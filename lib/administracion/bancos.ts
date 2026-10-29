import * as XLSX from "xlsx";
import { db, query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { SEDES_VALIDAS } from "@/lib/auth/sedeRol";
import {
  ampliar,
  ArchivoIlegible,
  bloquesEstado,
  clienteDelArchivo,
  diaDeCarpeta,
  huella,
  leerConIA,
  rangoSemana,
} from "@/lib/administracion/binance";
import {
  armarEstado,
  cruzarBanco,
  leerFilasExcel,
  type ComprobanteBanco,
  type EstadoLeido,
  type FilaEstado,
  type Movimiento,
  type PagoOdoo,
} from "@/lib/administracion/bancosCruce";

/**
 * Conciliacion bancaria (rol Administracion), como la de Binance pero por
 * cuenta de banco = diario de Odoo con extractos por archivo. En Valencia y
 * Caracas los extractos no se cargan en Odoo (el ultimo es de abril-2026), pero
 * Cuentas por Cobrar si registra cada cobro (`account.payment`) con la
 * referencia del banco: el cruce es estado de cuenta <-> cobros de Odoo <->
 * comprobantes de los clientes (`cruzarBanco`).
 *
 * El estado de cuenta en Excel/CSV (Banesco, Mercantil...) se lee sin IA
 * (`leerFilasExcel`); una captura o PDF lo lee la IA, como en Binance. Tablas
 * `banco_estados`, `banco_movimientos`, `banco_comprobantes` y
 * `banco_amarres` (se crean solas). Un movimiento se identifica por su huella
 * (cuenta, dia, referencia, monto, saldo, descripcion): la misma fila en dos
 * archivos que se solapan es una sola, y borrar uno no borra la del otro.
 */

const DIA_MS = 86400_000;
const sumarDias = (dia: string, n: number) => new Date(Date.parse(dia) + n * DIA_MS).toISOString().slice(0, 10);

// ---------- Tablas ----------

let tablasListas = false;
async function ensureTablas() {
  if (tablasListas) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banco_estados (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      journal_id INT NOT NULL,
      archivo_nombre VARCHAR(200) NOT NULL DEFAULT '',
      archivo_mime VARCHAR(100) NOT NULL DEFAULT '',
      archivo LONGBLOB NOT NULL,
      archivo_sha CHAR(64) NOT NULL,
      desde DATE NOT NULL,
      hasta DATE NOT NULL,
      filas INT NOT NULL DEFAULT 0,
      saltos INT NOT NULL DEFAULT 0,
      subido_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (journal_id, desde),
      INDEX (archivo_sha)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banco_movimientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      estado_id INT NOT NULL,
      journal_id INT NOT NULL,
      fecha DATE NOT NULL,
      referencia VARCHAR(60) NOT NULL DEFAULT '',
      descripcion VARCHAR(255) NOT NULL DEFAULT '',
      monto DECIMAL(20,2) NOT NULL,
      saldo DECIMAL(20,2) NULL,
      huella CHAR(64) NOT NULL,
      INDEX (journal_id, fecha),
      INDEX (huella),
      INDEX (estado_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banco_comprobantes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      journal_id INT NOT NULL,
      referencia VARCHAR(60) NOT NULL,
      monto DECIMAL(20,2) NOT NULL,
      moneda VARCHAR(12) NOT NULL DEFAULT '',
      fecha DATE NOT NULL,
      cuenta_origen VARCHAR(30) NOT NULL DEFAULT '',
      banco VARCHAR(80) NOT NULL DEFAULT '',
      motivo VARCHAR(255) NOT NULL DEFAULT '',
      cliente VARCHAR(200) NOT NULL DEFAULT '',
      movimiento_huella CHAR(64) NULL,
      archivo_nombre VARCHAR(200) NOT NULL DEFAULT '',
      archivo_mime VARCHAR(60) NOT NULL,
      archivo LONGBLOB NOT NULL,
      archivo_sha CHAR(64) NOT NULL,
      subido_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_ref (journal_id, referencia, monto),
      INDEX (journal_id, fecha),
      INDEX (archivo_sha)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Movimiento <-> cobro de Odoo amarrado a mano.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banco_amarres (
      huella CHAR(64) PRIMARY KEY,
      journal_id INT NOT NULL,
      pago_odoo_id INT NOT NULL,
      hecho_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_pago (pago_odoo_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablasListas = true;
}

// ---------- Cuentas (diarios de Odoo) ----------

export type CuentaBanco = { id: number; nombre: string; sede: number; moneda: string; numero: string };

let cacheCuentas: { hasta: number; cuentas: CuentaBanco[] } | null = null;

/**
 * Cuentas de banco de las sedes: diarios tipo banco con extractos por archivo
 * (deja fuera Criptos, IVA retenido, cheques, tarjetas y transitorias).
 */
export async function cuentasBancarias(sedes: number[]): Promise<CuentaBanco[]> {
  if (!cacheCuentas || cacheCuentas.hasta < Date.now()) {
    const diarios = await callOdooRPCEstricto<any[]>(
      "account.journal",
      "search_read",
      [[["type", "=", "bank"], ["bank_statements_source", "=", "file_import"], ["company_id", "in", SEDES_VALIDAS]]],
      { fields: ["name", "company_id", "currency_id", "bank_acc_number"], context: { allowed_company_ids: SEDES_VALIDAS } },
    );
    cacheCuentas = {
      hasta: Date.now() + 10 * 60_000,
      cuentas: (diarios || [])
        .map((d) => ({
          id: d.id,
          nombre: String(d.name || "").trim(),
          sede: Array.isArray(d.company_id) ? d.company_id[0] : 0,
          moneda: Array.isArray(d.currency_id) ? String(d.currency_id[1]) : "",
          numero: String(d.bank_acc_number || "").trim(),
        }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    };
  }
  return cacheCuentas.cuentas.filter((c) => sedes.includes(c.sede));
}

/** Cobros de clientes de Odoo en el diario (sin borradores ni anulados). */
async function cobrosOdoo(cuenta: CuentaBanco, desde: string, hasta: string): Promise<PagoOdoo[]> {
  const pagos = await callOdooRPCEstricto<any[]>(
    "account.payment",
    "search_read",
    [
      [
        ["journal_id", "=", cuenta.id],
        ["payment_type", "=", "inbound"],
        ["state", "not in", ["draft", "cancel"]],
        ["date", ">=", desde],
        ["date", "<=", hasta],
      ],
    ],
    { fields: ["name", "date", "amount", "partner_id", "ref"], context: { allowed_company_ids: [cuenta.sede] } },
  );
  return (pagos || []).map((p) => ({
    id: p.id,
    nombre: String(p.name || ""),
    fecha: String(p.date),
    monto: Number(p.amount) || 0,
    cliente: Array.isArray(p.partner_id) ? String(p.partner_id[1]) : "",
    ref: String(p.ref || ""),
  }));
}

// ---------- Estado de cuenta ----------

const EXCEL = /\.(xlsx?|csv|html?)$/i;
export const esExcel = (nombre: string) => EXCEL.test(nombre);

const INSTRUCCIONES_ESTADO =
  "Te dan una captura o PDF de un estado de cuenta bancario (movimientos de la cuenta). Devuelve TODAS las filas de " +
  "movimientos, sin inventar ni saltar ninguna, en el orden en que aparecen de arriba a abajo. Las filas de saldo " +
  "inicial o final no son movimientos. fecha: 'YYYY-MM-DD' (en Venezuela y Panama las fechas son dia/mes/año). " +
  "referencia: el numero de referencia o documento tal cual; si no hay columna de referencia, ''. " +
  "descripcion: el texto completo de la descripcion o concepto. monto: el monto con signo, + si entra a la cuenta " +
  "(credito, abono, deposito) y - si sale (debito, cargo, comision); si solo hay una columna sin signo, ponlo " +
  "positivo. Sin separador de miles: 1.394.295,35 es 1394295.35 y 136,108.70 es 136108.70. saldo: el saldo de esa " +
  "fila y tiene_saldo = true; si no hay columna de saldo, saldo = 0 y tiene_saldo = false. " +
  "Pueden venir varias imagenes: son pedazos seguidos de la misma lista, con un poco de solape; una fila que sale " +
  "en dos pedazos va una sola vez. Si no es un estado de cuenta, devuelve la lista vacia.";

const ESQUEMA_ESTADO = {
  type: "object",
  additionalProperties: false,
  required: ["movimientos"],
  properties: {
    movimientos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["fecha", "referencia", "descripcion", "monto", "saldo", "tiene_saldo"],
        properties: {
          fecha: { type: "string" },
          referencia: { type: "string" },
          descripcion: { type: "string" },
          monto: { type: "number" },
          saldo: { type: "number" },
          tiene_saldo: { type: "boolean" },
        },
      },
    },
  },
} as const;

/** Filas del estado de cuenta: el Excel se lee aca; la captura o el PDF, con la IA. */
async function leerEstado(datos: Buffer, nombre: string, mime: string): Promise<EstadoLeido> {
  if (esExcel(nombre)) {
    // raw: las fechas y montos llegan como el texto de la celda ("27/10/2026",
    // "+1.394.295,35"); si no, SheetJS lee 2026/10/22 como mes/dia.
    const libro = XLSX.read(datos, { type: "buffer", raw: true });
    for (const hoja of libro.SheetNames) {
      const celdas = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[hoja], { header: 1, raw: true, defval: "" });
      const leido = leerFilasExcel(celdas);
      if (leido) return leido;
    }
    throw new ArchivoIlegible("No encontré las columnas Fecha y Monto (o Débito/Crédito) en el archivo");
  }
  const prep = await bloquesEstado(datos, mime);
  const l = await leerConIA(INSTRUCCIONES_ESTADO, ESQUEMA_ESTADO, prep.bloques, "Lee estos movimientos.", 16000);
  const vistas = new Set<string>();
  const filas: FilaEstado[] = [];
  for (const f of Array.isArray(l?.movimientos) ? l.movimientos : []) {
    const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(f?.fecha)) ? String(f.fecha) : null;
    const monto = Number(f?.monto);
    if (!fecha || !monto) continue;
    const fila: FilaEstado = {
      fecha,
      referencia: String(f.referencia || "").trim().slice(0, 60),
      descripcion: String(f.descripcion || "").replace(/\s+/g, " ").trim().slice(0, 255),
      monto,
      saldo: f.tiene_saldo ? Number(f.saldo) : null,
    };
    // Una fila que cae en el solape de dos franjas sale dos veces: va una.
    const llave = JSON.stringify(fila);
    if (vistas.has(llave)) continue;
    vistas.add(llave);
    filas.push(fila);
  }
  if (!filas.length) throw new ArchivoIlegible("No se leyó ningún movimiento: ¿es un estado de cuenta?");
  return armarEstado(filas);
}

/**
 * Guarda el estado de cuenta de una cuenta: el archivo (su huella evita leerlo
 * dos veces) y sus movimientos con su huella. Una fila identica repetida dentro
 * del mismo archivo (sin saldo) son dos movimientos: lleva su numero de vez.
 */
export async function guardarEstado(
  cuenta: CuentaBanco,
  archivo: { nombre: string; mime: string; datos: Buffer },
  email: string,
) {
  await ensureTablas();
  const sha = huella(archivo.datos);
  const { rows: previo } = await query("SELECT id FROM banco_estados WHERE journal_id = ? AND archivo_sha = ? LIMIT 1", [
    cuenta.id,
    sha,
  ]);
  if (previo.length) return { yaEstaba: true as const };
  const leido = await leerEstado(archivo.datos, archivo.nombre, archivo.mime);
  // db.execute y no query(): la auditoria guardaria el archivo entero en sql_params.
  const [res]: any = await db.execute(
    `INSERT INTO banco_estados (company_id, journal_id, archivo_nombre, archivo_mime, archivo, archivo_sha, desde, hasta, filas, saltos, subido_por)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [
      cuenta.sede,
      cuenta.id,
      archivo.nombre.slice(0, 200),
      (archivo.mime || "application/octet-stream").slice(0, 100),
      archivo.datos,
      sha,
      leido.desde,
      leido.hasta,
      leido.filas.length,
      leido.saltos,
      email,
    ],
  );
  const estadoId: number = res.insertId;
  const veces = new Map<string, number>();
  const valores = leido.filas.map((f) => {
    const base = [cuenta.id, f.fecha, f.referencia, f.monto.toFixed(2), f.saldo?.toFixed(2) ?? "", f.descripcion].join("|");
    const n = (veces.get(base) || 0) + 1;
    veces.set(base, n);
    return [estadoId, cuenta.id, f.fecha, f.referencia, f.descripcion, f.monto, f.saldo, huella(Buffer.from(`${base}|${n}`))];
  });
  for (let i = 0; i < valores.length; i += 200) {
    const tanda = valores.slice(i, i + 200);
    await db.execute(
      `INSERT INTO banco_movimientos (estado_id, journal_id, fecha, referencia, descripcion, monto, saldo, huella)
       VALUES ${tanda.map(() => "(?,?,?,?,?,?,?,?)").join(",")}`,
      tanda.flat(),
    );
  }
  return {
    yaEstaba: false as const,
    filas: leido.filas.length,
    entradas: leido.filas.filter((f) => f.monto > 0).length,
    desde: leido.desde,
    hasta: leido.hasta,
    saltos: leido.saltos,
  };
}

/** Borra un archivo del estado de cuenta y sus movimientos (los que otro archivo tambien trae se quedan). */
export async function borrarEstado(cuenta: CuentaBanco, estadoId: number) {
  await ensureTablas();
  await query("DELETE FROM banco_movimientos WHERE estado_id = ? AND journal_id = ?", [estadoId, cuenta.id]);
  await query("DELETE FROM banco_estados WHERE id = ? AND journal_id = ?", [estadoId, cuenta.id]);
}

// ---------- Comprobantes ----------

const INSTRUCCIONES_COMPROBANTE =
  "Te dan la captura o el PDF de un comprobante de una transferencia o pago bancario que un cliente le hizo a la " +
  "empresa (Banesco, Mercantil, pago movil, ACH...). Devuelve SOLO lo que esta en la imagen, sin inventar. " +
  "referencia: el numero de la operacion tal cual ('Referencia', 'Comprobante Nro', 'Nro. de operacion', " +
  "'Numero de confirmacion'); copia cada caracter con cuidado, es lo que se usa para conciliar. " +
  "monto: el monto transferido, sin signo ni separador de miles (USD 136,108.70 es 136108.70; Bs. 1.394.295,35 es " +
  "1394295.35). moneda: USD, VES, EUR... ('Bs.' es VES; '$' es USD). fecha: 'YYYY-MM-DD' de la operacion (dia/mes/año " +
  "si viene con numeros); si no se ve, ''. banco: el banco desde donde se pago. cuenta_origen: los ultimos 4 digitos " +
  "de la cuenta desde la que se pago ('Desde mi cuenta', 'Cuenta origen'); si no se ve, ''. motivo: el motivo, " +
  "concepto o descripcion. Si no es un comprobante de pago, es_comprobante = false y lo demas vacio o 0.";

const ESQUEMA_COMPROBANTE = {
  type: "object",
  additionalProperties: false,
  required: ["es_comprobante", "referencia", "monto", "moneda", "fecha", "banco", "cuenta_origen", "motivo"],
  properties: {
    es_comprobante: { type: "boolean" },
    referencia: { type: "string" },
    monto: { type: "number" },
    moneda: { type: "string" },
    fecha: { type: "string" },
    banco: { type: "string" },
    cuenta_origen: { type: "string" },
    motivo: { type: "string" },
  },
} as const;

/**
 * Lee el comprobante y lo guarda en la cuenta. Sin fecha en la imagen se toma
 * el dia de la carpeta ("27-10-2026/Cliente.jpg"). La misma referencia y monto
 * en la misma cuenta es el mismo comprobante: se devuelve quien lo subio.
 */
export async function guardarComprobante(
  cuenta: CuentaBanco,
  archivo: { nombre: string; mime: string; datos: Buffer },
  carpeta: string,
  email: string,
) {
  await ensureTablas();
  const sha = huella(archivo.datos);
  const { rows: mismo } = await query(
    "SELECT referencia, subido_por FROM banco_comprobantes WHERE journal_id = ? AND archivo_sha = ? LIMIT 1",
    [cuenta.id, sha],
  );
  if (mismo.length) {
    const r: any = mismo[0];
    return { repetido: `Este archivo ya estaba cargado (referencia ${r.referencia}, ${r.subido_por})` };
  }
  const l = await leerConIA(
    INSTRUCCIONES_COMPROBANTE,
    ESQUEMA_COMPROBANTE,
    [await ampliar(archivo.datos, archivo.mime)],
    "Lee este comprobante.",
    1000,
  );
  const referencia = String(l?.referencia || "").trim().slice(0, 60);
  const monto = Number(l?.monto);
  if (referencia.replace(/[^a-z0-9]/gi, "").length < 4 || !(monto > 0)) {
    throw new ArchivoIlegible(
      `No se leyó un comprobante de pago (referencia: "${referencia || "—"}", monto: ${monto > 0 ? monto : "—"})`,
    );
  }
  let fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(l?.fecha)) ? String(l.fecha) : null;
  if (!fecha) {
    const dia = diaDeCarpeta(carpeta);
    // diaDeCarpeta da las 00:00 de Caracas en UTC: la fecha UTC es ese mismo dia.
    if (dia !== null) fecha = new Date(dia).toISOString().slice(0, 10);
  }
  if (!fecha) throw new ArchivoIlegible("El comprobante no trae la fecha: súbelo dentro de una carpeta con el día (27-10-2026)");
  const cliente = clienteDelArchivo(archivo.nombre);
  try {
    const [res]: any = await db.execute(
      `INSERT INTO banco_comprobantes
         (company_id, journal_id, referencia, monto, moneda, fecha, cuenta_origen, banco, motivo, cliente,
          archivo_nombre, archivo_mime, archivo, archivo_sha, subido_por)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        cuenta.sede,
        cuenta.id,
        referencia,
        monto,
        String(l?.moneda || "").trim().toUpperCase().slice(0, 12),
        fecha,
        String(l?.cuenta_origen || "").replace(/\D/g, "").slice(-30),
        String(l?.banco || "").trim().slice(0, 80),
        String(l?.motivo || "").trim().slice(0, 255),
        cliente,
        archivo.nombre.slice(0, 200),
        archivo.mime,
        archivo.datos,
        sha,
        email,
      ],
    );
    return { id: res.insertId as number, referencia, monto, fecha, cliente };
  } catch (e: any) {
    if (e?.code !== "ER_DUP_ENTRY") throw e;
    const { rows } = await query(
      "SELECT subido_por FROM banco_comprobantes WHERE journal_id = ? AND referencia = ? AND monto = ?",
      [cuenta.id, referencia, monto],
    );
    return { repetido: `La referencia ${referencia} por ${monto} ya estaba cargada (${(rows[0] as any)?.subido_por || ""})` };
  }
}

export async function imagenComprobante(cuenta: CuentaBanco, id: number) {
  await ensureTablas();
  const [rows]: any = await db.execute(
    "SELECT archivo, archivo_mime, archivo_nombre FROM banco_comprobantes WHERE id = ? AND journal_id = ?",
    [id, cuenta.id],
  );
  return rows[0] || null;
}

export async function borrarComprobante(cuenta: CuentaBanco, id: number) {
  await ensureTablas();
  await query("DELETE FROM banco_comprobantes WHERE id = ? AND journal_id = ?", [id, cuenta.id]);
}

/** Amarra a mano un comprobante con un movimiento (null = soltarlo). */
export async function amarrarComprobante(cuenta: CuentaBanco, id: number, movimiento: string | null) {
  await ensureTablas();
  await query("UPDATE banco_comprobantes SET movimiento_huella = ? WHERE id = ? AND journal_id = ?", [
    movimiento,
    id,
    cuenta.id,
  ]);
}

/** Amarra a mano un movimiento con un cobro de Odoo (null = soltarlo). Un cobro va con un solo movimiento. */
export async function amarrarPago(cuenta: CuentaBanco, movimiento: string, pagoId: number | null, email: string) {
  await ensureTablas();
  await query("DELETE FROM banco_amarres WHERE journal_id = ? AND (huella = ? OR pago_odoo_id = ?)", [
    cuenta.id,
    movimiento,
    pagoId ?? 0,
  ]);
  if (pagoId !== null) {
    await query("INSERT INTO banco_amarres (huella, journal_id, pago_odoo_id, hecho_por) VALUES (?,?,?,?)", [
      movimiento,
      cuenta.id,
      pagoId,
      email,
    ]);
  }
}

// ---------- Conciliacion ----------

/**
 * La semana (lunes a domingo) de una cuenta. Se cruza con una semana de margen
 * a cada lado: Odoo puede tener el cobro con otro dia que el banco.
 */
export async function conciliacionSemana(cuenta: CuentaBanco, lunes: string) {
  if (!rangoSemana(lunes)) throw new Error("Semana inválida");
  await ensureTablas();
  const domingo = sumarDias(lunes, 6);
  const desde = sumarDias(lunes, -7);
  const hasta = sumarDias(lunes, 13);
  const [movs, estados, comps, amarres, pagos] = await Promise.all([
    // La misma fila en dos archivos (misma huella) va una vez: la del primero.
    query(
      `SELECT m.huella, DATE_FORMAT(m.fecha, '%Y-%m-%d') AS fecha, m.referencia, m.descripcion, m.monto, m.saldo
         FROM banco_movimientos m
         JOIN (SELECT MIN(id) AS id FROM banco_movimientos
                WHERE journal_id = ? AND fecha BETWEEN ? AND ? GROUP BY huella) u ON u.id = m.id
        ORDER BY m.fecha, m.id`,
      [cuenta.id, desde, hasta],
    ),
    query(
      `SELECT id, archivo_nombre, DATE_FORMAT(desde, '%Y-%m-%d') AS desde, DATE_FORMAT(hasta, '%Y-%m-%d') AS hasta,
              filas, saltos, subido_por, created_at
         FROM banco_estados WHERE journal_id = ? ORDER BY desde`,
      [cuenta.id],
    ),
    query(
      `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, referencia, monto, moneda, cuenta_origen, banco, motivo,
              cliente, movimiento_huella, archivo_nombre, subido_por
         FROM banco_comprobantes WHERE journal_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha, id`,
      [cuenta.id, desde, hasta],
    ),
    query("SELECT huella, pago_odoo_id FROM banco_amarres WHERE journal_id = ?", [cuenta.id]),
    cobrosOdoo(cuenta, desde, hasta),
  ]);
  const movimientos: Movimiento[] = movs.rows.map((r: any) => ({
    id: r.huella,
    fecha: r.fecha,
    referencia: r.referencia,
    descripcion: r.descripcion,
    monto: Number(r.monto),
    saldo: r.saldo === null ? null : Number(r.saldo),
  }));
  const comprobantes: ComprobanteBanco[] = comps.rows.map((r: any) => ({
    id: r.id,
    fecha: r.fecha,
    referencia: r.referencia,
    monto: Number(r.monto),
    moneda: r.moneda,
    cuentaOrigen: r.cuenta_origen,
    banco: r.banco,
    motivo: r.motivo,
    cliente: r.cliente,
    movimientoId: r.movimiento_huella,
    archivoNombre: r.archivo_nombre,
    subidoPor: r.subido_por,
  }));
  const manuales = new Map<string, number>(amarres.rows.map((r: any) => [r.huella, Number(r.pago_odoo_id)]));
  const cubierto = (dia: string) => estados.rows.some((e: any) => dia >= e.desde && dia <= e.hasta);
  const cruce = cruzarBanco(movimientos, pagos, comprobantes, manuales, cubierto);

  const enSemana = (dia: string) => dia >= lunes && dia <= domingo;
  const pagosTomados = new Set(cruce.movimientos.filter((m) => m.pago).map((m) => m.pago!.id));
  return {
    movimientos: cruce.movimientos.filter((m) => enSemana(m.fecha)),
    /** Lo que salio de la cuenta en la semana (no se concilia, solo el total). */
    salidas: movimientos.filter((m) => m.monto < 0 && enSemana(m.fecha)).reduce((s, m) => s + m.monto, 0),
    comprobantes: cruce.comprobantes.filter((c) => enSemana(c.fecha)),
    pagosSinMovimiento: cruce.pagosSinMovimiento.filter((p) => enSemana(p.fecha)),
    /** Cobros de Odoo de la ventana que no tomo ningun movimiento: para amarrar a mano. */
    pagosLibres: pagos.filter((p) => !pagosTomados.has(p.id)),
    /** Dias de la semana que no cubre ningun estado de cuenta. */
    diasSinEstado: Array.from({ length: 7 }, (_, i) => sumarDias(lunes, i)).filter((d) => !cubierto(d)),
    archivos: estados.rows
      .filter((e: any) => e.desde <= domingo && e.hasta >= lunes)
      .map((e: any) => ({
        id: e.id,
        nombre: e.archivo_nombre,
        desde: e.desde,
        hasta: e.hasta,
        filas: Number(e.filas),
        saltos: Number(e.saltos),
        subidoPor: e.subido_por,
        subidoEl: new Date(e.created_at).toISOString(),
      })),
  };
}

export type ConciliacionBanco = Awaited<ReturnType<typeof conciliacionSemana>>;
