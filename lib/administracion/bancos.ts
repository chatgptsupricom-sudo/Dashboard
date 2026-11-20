import * as XLSX from "xlsx";
import { db, query } from "@/lib/db";
import { callOdooRPCComo, callOdooRPCEstricto } from "@/lib/odoo";
import { SEDES_VALIDAS } from "@/lib/auth/sedeRol";
import {
  ampliar,
  ArchivoIlegible,
  bloquesEstado,
  clienteDelArchivo,
  diaDeCarpeta,
  huella,
  leerConIA,
} from "@/lib/administracion/binance";
import {
  armarEstado,
  cruzarBanco,
  cuentaSugerida,
  emparejarViejas,
  errorPagos,
  errorPeriodo,
  leerFilasExcel,
  celular58,
  mismaReferencia,
  type ComprobanteBanco,
  type EstadoLeido,
  type FilaEstado,
  type MovPanel,
  type Movimiento,
  type PagoOdoo,
  type VerificacionApi,
} from "@/lib/administracion/bancosCruce";
import { claveTransferencia, credencialesMercantil, verificarEnMercantil } from "@/lib/administracion/mercantil";

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
  // Columnas que llegaron despues: la verificacion en el banco por la API
  // (Mercantil) y el cobro de Odoo registrado desde el panel.
  const { rows: cols } = await query("SHOW COLUMNS FROM banco_comprobantes");
  const hay = new Set(cols.map((c: any) => c.Field));
  const nuevas: [string, string][] = [
    ["api_estado", "VARCHAR(20) NULL"],
    ["api_detalle", "TEXT NULL"],
    ["api_clave", "VARCHAR(100) NULL"],
    ["api_at", "DATETIME NULL"],
    ["odoo_pago_id", "INT NULL"],
    ["odoo_registrado_por", "VARCHAR(190) NULL"],
    ["odoo_registrado_at", "DATETIME NULL"],
    // Pago Movil: lo dice la IA (NULL = comprobante de antes, no se sabe) y el celular de quien pago como se ve.
    ["pago_movil", "TINYINT NULL"],
    ["telefono_origen", "VARCHAR(30) NULL"],
  ];
  for (const [col, tipo] of nuevas) {
    if (!hay.has(col)) await db.execute(`ALTER TABLE banco_comprobantes ADD COLUMN ${col} ${tipo}`);
  }
  if (!hay.has("api_clave")) await db.execute("ALTER TABLE banco_comprobantes ADD INDEX idx_api_clave (journal_id, api_clave)");
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
  // Movimiento conciliado en Odoo desde el panel (aprobado por una persona): la linea de extracto que se creo.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banco_conciliaciones (
      huella CHAR(64) PRIMARY KEY,
      journal_id INT NOT NULL,
      st_line_id INT NOT NULL,
      pago_odoo_id INT NULL,
      detalle VARCHAR(255) NOT NULL DEFAULT '',
      aprobado_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (journal_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Lineas viejas de Odoo que se deshicieron y borraron desde el panel para rehacerlas (registro).
  await db.execute(`
    CREATE TABLE IF NOT EXISTS banco_deshechos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      journal_id INT NOT NULL,
      st_line_id INT NOT NULL,
      asiento VARCHAR(60) NOT NULL DEFAULT '',
      fecha DATE NOT NULL,
      monto DECIMAL(20,2) NOT NULL,
      descripcion VARCHAR(255) NOT NULL DEFAULT '',
      contra VARCHAR(255) NOT NULL DEFAULT '',
      diferencial DECIMAL(20,2) NOT NULL DEFAULT 0,
      hecho_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (journal_id, fecha)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // Que se hizo con los asientos de diferencial al deshacer (llego despues).
  const { rows: colsDes } = await query("SHOW COLUMNS FROM banco_deshechos LIKE 'diferencial_modo'");
  if (!colsDes.length) await db.execute("ALTER TABLE banco_deshechos ADD COLUMN diferencial_modo VARCHAR(10) NOT NULL DEFAULT ''");
  // detalle llego despues (la tabla pudo crearse sin ella).
  const { rows: colsConc } = await query("SHOW COLUMNS FROM banco_conciliaciones LIKE 'detalle'");
  if (!colsConc.length) await db.execute("ALTER TABLE banco_conciliaciones ADD COLUMN detalle VARCHAR(255) NOT NULL DEFAULT ''");
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

/** Cuentas de Recibos/Pagos Pendientes del diario (las de sus metodos de pago). */
async function pendientesDelDiario(cuenta: CuentaBanco): Promise<number[]> {
  const metodos = await callOdooRPCEstricto<any[]>(
    "account.payment.method.line",
    "search_read",
    [[["journal_id", "=", cuenta.id]]],
    { fields: ["payment_account_id"], context: { allowed_company_ids: [cuenta.sede] } },
  );
  return [...new Set((metodos || []).map((m) => (Array.isArray(m.payment_account_id) ? m.payment_account_id[0] : 0)).filter(Boolean))];
}

/**
 * Lo que espera su linea del banco en Odoo, en el diario y el periodo:
 * - cobros (monto +) y pagos (monto -), tambien las transferencias internas
 *   (cambios de bolivares a Criptos, entre bancos propios), sin borradores ni
 *   anulados. `ref` es el Memo: ahi CxC y Administracion ponen la referencia del banco.
 * - asientos contables que dejaron algo sin conciliar en las cuentas de pendientes
 *   del diario sin ser un pago (devolucion de viaticos, tasa de aduana, intereses,
 *   un pago por error...). Van con id NEGATIVO (= -id del apunte, account.move.line)
 *   para no chocar con los ids de account.payment.
 */
async function pagosOdoo(cuenta: CuentaBanco, desde: string, hasta: string): Promise<PagoOdoo[]> {
  const ctx = { allowed_company_ids: [cuenta.sede] };
  const [pagos, pendientes] = await Promise.all([
    callOdooRPCEstricto<any[]>(
      "account.payment",
      "search_read",
      [
        [
          ["journal_id", "=", cuenta.id],
          ["state", "not in", ["draft", "cancel"]],
          ["date", ">=", desde],
          ["date", "<=", hasta],
        ],
      ],
      { fields: ["name", "date", "amount", "payment_type", "partner_id", "ref", "is_matched"], context: ctx },
    ),
    pendientesDelDiario(cuenta),
  ]);
  const apuntes = pendientes.length
    ? await callOdooRPCEstricto<any[]>(
        "account.move.line",
        "search_read",
        [
          [
            ["account_id", "in", pendientes],
            ["parent_state", "=", "posted"],
            ["reconciled", "=", false],
            ["payment_id", "=", false],
            ["statement_line_id", "=", false],
            ["amount_currency", "!=", 0],
            ["date", ">=", desde],
            ["date", "<=", hasta],
          ],
        ],
        { fields: ["move_id", "date", "amount_currency", "partner_id", "name", "ref"], context: ctx },
      )
    : [];
  return [
    ...(pagos || []).map((p) => ({
      id: p.id,
      nombre: String(p.name || ""),
      fecha: String(p.date),
      monto: (Number(p.amount) || 0) * (p.payment_type === "outbound" ? -1 : 1),
      cliente: Array.isArray(p.partner_id) ? String(p.partner_id[1]) : "",
      ref: String(p.ref || ""),
      conciliado: !!p.is_matched,
    })),
    ...(apuntes || []).map((a) => ({
      id: -a.id,
      nombre: Array.isArray(a.move_id) ? String(a.move_id[1]) : "",
      fecha: String(a.date),
      monto: Number(a.amount_currency) || 0,
      cliente: Array.isArray(a.partner_id) ? String(a.partner_id[1]) : String(a.name || ""),
      ref: String(a.ref || a.name || ""),
      conciliado: false,
    })),
  ];
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
  "concepto o descripcion. pago_movil: true si es un Pago Movil (trae numero celular de origen o destino, o dice " +
  "'Pago Movil'/'Tpago'), false si es una transferencia. telefono_origen: el celular de quien pago tal cual se ve, con " +
  "los asteriscos si viene oculto ('04**-***5239'); si no se ve, ''. Si no es un comprobante de pago, es_comprobante = " +
  "false y lo demas vacio o 0.";

const ESQUEMA_COMPROBANTE = {
  type: "object",
  additionalProperties: false,
  required: [
    "es_comprobante",
    "referencia",
    "monto",
    "moneda",
    "fecha",
    "banco",
    "cuenta_origen",
    "motivo",
    "pago_movil",
    "telefono_origen",
  ],
  properties: {
    es_comprobante: { type: "boolean" },
    referencia: { type: "string" },
    monto: { type: "number" },
    moneda: { type: "string" },
    fecha: { type: "string" },
    banco: { type: "string" },
    cuenta_origen: { type: "string" },
    motivo: { type: "string" },
    pago_movil: { type: "boolean" },
    telefono_origen: { type: "string" },
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
          archivo_nombre, archivo_mime, archivo, archivo_sha, subido_por, pago_movil, telefono_origen)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
        l?.pago_movil ? 1 : 0,
        String(l?.telefono_origen || "").replace(/[^\d*]/g, "").slice(0, 30),
      ],
    );
    const id = res.insertId as number;
    const api = await verificarComprobante(cuenta, id).catch((e: any) => {
      console.error("[bancos] verificar en el banco:", e?.message);
      return null;
    });
    return { id, referencia, monto, fecha, cliente, api };
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

// ---------- Verificacion en el banco (API de Mercantil) ----------

/**
 * Consulta el comprobante en el banco y guarda la respuesta. Si la misma
 * transferencia ya la confirmo otro comprobante de la cuenta, queda "duplicado".
 * null si la cuenta no tiene API.
 */
export async function verificarComprobante(
  cuenta: CuentaBanco,
  id: number,
  telefonoManual?: string,
): Promise<VerificacionApi | null> {
  await ensureTablas();
  const cred = await credencialesMercantil(cuenta.id, cuenta.sede);
  if (!cred) return null;
  const { rows } = await query(
    `SELECT referencia, monto, moneda, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, banco, pago_movil, telefono_origen
       FROM banco_comprobantes WHERE id = ? AND journal_id = ?`,
    [id, cuenta.id],
  );
  const c: any = rows[0];
  if (!c) return null;
  const monto = Number(c.monto);
  const telefonos = cred.pm
    ? await celularesCandidatos(cuenta, { referencia: c.referencia, monto, telefono: c.telefono_origen || "" }, telefonoManual)
    : [];
  let v = await verificarEnMercantil(cred, {
    referencia: c.referencia,
    monto,
    moneda: c.moneda,
    fecha: c.fecha,
    banco: c.banco,
    pagoMovil: c.pago_movil === null ? null : !!Number(c.pago_movil),
    telefonos,
  });
  const clave = claveTransferencia(v, c.referencia, monto);
  if (clave) {
    const { rows: otro } = await query(
      "SELECT id, referencia, cliente FROM banco_comprobantes WHERE journal_id = ? AND api_clave = ? AND id <> ? LIMIT 1",
      [cuenta.id, clave, id],
    );
    const o: any = otro[0];
    if (o) v = { ...v, estado: "duplicado", mensaje: `Es la misma transferencia del comprobante ${o.referencia} (${o.cliente || "sin cliente"})` };
  }
  await query(
    "UPDATE banco_comprobantes SET api_estado = ?, api_detalle = ?, api_clave = ?, api_at = NOW() WHERE id = ? AND journal_id = ?",
    [v.estado, JSON.stringify(v), v.estado === "confirmado" ? clave : null, id, cuenta.id],
  );
  return v;
}

/**
 * Celulares posibles de quien hizo un Pago Movil (58 + 10 digitos), en este
 * orden: el que escribieron a mano; el del comprobante si se ve completo; el del
 * cliente del cobro de Odoo con esa referencia y monto; y los clientes de la sede
 * cuyo telefono termina en los digitos que se ven ("04**-***5239" -> 5239).
 */
async function celularesCandidatos(
  cuenta: CuentaBanco,
  c: { referencia: string; monto: number; telefono: string },
  manual?: string,
): Promise<string[]> {
  const delManual = manual ? celular58(manual) : null;
  if (delManual) return [delManual];
  const visto = String(c.telefono || "");
  const completo = visto.includes("*") ? null : celular58(visto);
  const sufijo = /(\d{4,})$/.exec(visto)?.[1] || "";
  const lista: string[] = completo ? [completo] : [];
  const ctx = { allowed_company_ids: [cuenta.sede] };
  const telefonosDe = (p: any) => [p.phone, p.mobile].map((t) => celular58(String(t || ""))).filter(Boolean) as string[];
  try {
    const pagos = await callOdooRPCEstricto<any[]>(
      "account.payment",
      "search_read",
      [[["company_id", "=", cuenta.sede], ["payment_type", "=", "inbound"], ["amount", "=", c.monto]]],
      { fields: ["ref", "partner_id"], limit: 50, order: "date desc", context: ctx },
    );
    const ids = (pagos || [])
      .filter((p) => mismaReferencia(String(p.ref || ""), c.referencia) && Array.isArray(p.partner_id))
      .map((p) => p.partner_id[0]);
    if (ids.length) {
      const partners = await callOdooRPCEstricto<any[]>("res.partner", "read", [ids, ["phone", "mobile"]], { context: ctx });
      for (const p of partners || []) lista.push(...telefonosDe(p));
    }
    if (sufijo) {
      const partners = await callOdooRPCEstricto<any[]>(
        "res.partner",
        "search_read",
        [["|", ["phone", "=like", `%${sufijo}`], ["mobile", "=like", `%${sufijo}`]]],
        { fields: ["phone", "mobile"], limit: 30, context: ctx },
      );
      for (const p of partners || []) lista.push(...telefonosDe(p));
    }
  } catch (e: any) {
    console.warn("[bancos] celulares candidatos:", e?.message);
  }
  return [...new Set(lista)].filter((t) => !sufijo || t.endsWith(sufijo));
}

/** Vuelve a consultar en el banco los comprobantes del periodo que no estan confirmados. */
export async function verificarPendientes(cuenta: CuentaBanco, desdeDia: string, hastaDia: string) {
  const malo = errorPeriodo(desdeDia, hastaDia);
  if (malo) throw new Error(malo);
  await ensureTablas();
  const { rows } = await query(
    `SELECT id FROM banco_comprobantes
      WHERE journal_id = ? AND fecha BETWEEN ? AND ?
        AND (api_estado IS NULL OR api_estado IN ('no_encontrado', 'error', 'sin_telefono'))
      ORDER BY fecha, id`,
    [cuenta.id, desdeDia, hastaDia],
  );
  const resultado: Record<string, number> = {};
  for (const r of rows as any[]) {
    const v = await verificarComprobante(cuenta, r.id);
    if (!v) break;
    resultado[v.estado] = (resultado[v.estado] || 0) + 1;
    // Mercantil caido: no tiene sentido seguir con los demas.
    if (v.estado === "error") break;
  }
  return { revisados: rows.length, resultado };
}

// ---------- Registrar el cobro en Odoo ----------

export type ClienteOdoo = { id: number; nombre: string; rif: string; vendedor: string; vendedorId: number | null };

const aCliente = (p: any): ClienteOdoo => ({
  id: p.id,
  nombre: String(p.name || ""),
  rif: String(p.vat || ""),
  vendedor: Array.isArray(p.user_id) ? String(p.user_id[1]) : "",
  vendedorId: Array.isArray(p.user_id) ? p.user_id[0] : null,
});

/** Clientes de la sede por nombre o RIF (para elegir a quien va el cobro). */
export async function buscarClientes(cuenta: CuentaBanco, texto: string): Promise<ClienteOdoo[]> {
  const t = texto.trim();
  if (t.length < 3) return [];
  const digitos = t.replace(/\D/g, "");
  // Fichas principales (no contactos); un cliente persona natural no es is_company.
  // RIF de 9 digitos: los 8 primeros, asi calza con o sin guiones y con o sin el digito verificador.
  const sinCeros = digitos.replace(/^0+/, "");
  const porDigitos = sinCeros.length === 9 ? sinCeros.slice(0, 8) : digitos.length >= 5 ? sinCeros : t;
  const dominio: any[] = [
    ["parent_id", "=", false],
    "|",
    "|",
    "|",
    ["name", "ilike", t],
    ["vat", "ilike", porDigitos],
    ["phone", "=like", `%${digitos.slice(-7) || t}`],
    ["mobile", "=like", `%${digitos.slice(-7) || t}`],
  ];
  const filas = await callOdooRPCEstricto<any[]>("res.partner", "search_read", [dominio], {
    fields: ["name", "vat", "user_id"],
    limit: 15,
    order: "customer_rank desc, name",
    context: { allowed_company_ids: [cuenta.sede] },
  });
  return (filas || []).map(aCliente);
}

/** Bolivares por dolar (BCV) del dia o del ultimo dia antes con tasa, de la sede de la cuenta. */
async function tasaBcv(sede: number, fecha: string): Promise<number> {
  const filas = await callOdooRPCEstricto<any[]>(
    "res.currency.rate",
    "search_read",
    [[["company_id", "=", sede], ["currency_id.name", "=", "USD"], ["name", "<=", fecha]]],
    { fields: ["inverse_rate"], order: "name desc", limit: 1, context: { allowed_company_ids: [sede] } },
  );
  return Math.round((Number(filas?.[0]?.inverse_rate) || 0) * 100) / 100;
}

/**
 * Cobro de Odoo ya registrado con esa referencia y monto en cualquier diario de
 * la sede (para no registrarlo dos veces): hay cobros de Mercantil cargados en
 * otro diario, como «Deposito / Transferencia Mercantil».
 */
async function cobroExistente(cuenta: CuentaBanco, referencia: string, monto: number, fecha: string) {
  const pagos = await callOdooRPCEstricto<any[]>(
    "account.payment",
    "search_read",
    [
      [
        ["company_id", "=", cuenta.sede],
        ["payment_type", "=", "inbound"],
        ["state", "!=", "cancel"],
        ["amount", "=", monto],
        ["date", ">=", sumarDias(fecha, -30)],
      ],
    ],
    { fields: ["name", "ref", "state", "journal_id"], context: { allowed_company_ids: [cuenta.sede] } },
  );
  return (pagos || []).find((p) => mismaReferencia(String(p.ref || ""), referencia)) || null;
}

type ComprobanteRegistro = {
  id: number;
  referencia: string;
  monto: number;
  fecha: string;
  motivo: string;
  cliente: string;
  api: VerificacionApi;
  odooPagoId: number | null;
};

/** El comprobante si se puede registrar en Odoo, o el motivo por el que no. */
async function comprobanteParaRegistrar(cuenta: CuentaBanco, id: number): Promise<ComprobanteRegistro | { error: string }> {
  await ensureTablas();
  const { rows } = await query(
    `SELECT id, referencia, monto, DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, motivo, cliente, api_estado, api_detalle, odoo_pago_id
       FROM banco_comprobantes WHERE id = ? AND journal_id = ?`,
    [id, cuenta.id],
  );
  const r: any = rows[0];
  if (!r) return { error: "Ese comprobante no existe en esta cuenta" };
  if (r.odoo_pago_id !== null) return { error: "Este comprobante ya se registró en Odoo desde el panel" };
  if (r.api_estado !== "confirmado") return { error: "Solo se registra un comprobante que el banco confirmó" };
  const api = JSON.parse(r.api_detalle || "{}") as VerificacionApi;
  const monto = Number(r.monto);
  const fecha = api.fecha || r.fecha;
  const existente = await cobroExistente(cuenta, r.referencia, monto, fecha);
  if (existente) {
    const diario = Array.isArray(existente.journal_id) ? `, diario ${existente.journal_id[1]}` : "";
    return { error: `Ya está en Odoo: ${existente.name} (ref ${existente.ref}${diario})` };
  }
  return { id: r.id, referencia: r.referencia, monto, fecha, motivo: r.motivo, cliente: r.cliente, api, odooPagoId: null };
}

/**
 * Lo que se va a registrar en Odoo, para que lo revisen antes: los mismos campos
 * que llena Cuentas por Cobrar a mano en los cobros de Mercantil (diario, metodo
 * Manual, referencia del banco, tasa propia, descripcion y el vendedor del cliente).
 */
export async function vistaPreviaRegistro(cuenta: CuentaBanco, id: number) {
  const c = await comprobanteParaRegistrar(cuenta, id);
  if ("error" in c) return c;
  // Clientes sugeridos: por la cedula/RIF de quien pago (segun el banco) y por el nombre del archivo.
  const porRif = c.api.pagadorId ? await buscarClientes(cuenta, c.api.pagadorId.replace(/^[A-Z]0*/i, "")) : [];
  const porTelefono = c.api.telefono ? await buscarClientes(cuenta, c.api.telefono) : [];
  const porNombre = c.cliente ? await buscarClientes(cuenta, c.cliente) : [];
  // El nombre que da el banco, sin la forma juridica ("EL BUEN PLATO, C.A." -> "EL BUEN PLATO").
  const pagador = String(c.api.pagador || "").replace(/,?s*(C.?s?A.?|S.?s?A.?|S.?R.?L.?)s*$/i, "").trim();
  const porPagador = pagador ? await buscarClientes(cuenta, pagador) : [];
  const vistos = new Set<number>();
  const sugeridos = [...porTelefono, ...porRif, ...porPagador, ...porNombre].filter((p) => !vistos.has(p.id) && vistos.add(p.id)).slice(0, 10);
  return {
    comprobante: c,
    diario: cuenta.nombre,
    moneda: cuenta.moneda,
    metodo: "Manual",
    tasaBcv: await tasaBcv(cuenta.sede, c.fecha),
    sugeridos,
  };
}

const escaparHtml = (s: string) => s.replace(/[&<>"]/g, (x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[x]!);

/**
 * Registra el cobro en Odoo y lo confirma, con una nota en el chatter de quien
 * lo aprobo en el panel (en Odoo queda a nombre del usuario de la API). Se marca
 * el comprobante antes de crear (odoo_pago_id = 0): dos clics no crean dos cobros.
 */
export async function registrarCobro(
  cuenta: CuentaBanco,
  id: number,
  datos: { partnerId: number; tasa: number; descripcion: string },
  autor: { nombre: string; email: string },
) {
  const c = await comprobanteParaRegistrar(cuenta, id);
  if ("error" in c) return c;
  const [res]: any = await db.execute(
    "UPDATE banco_comprobantes SET odoo_pago_id = 0, odoo_registrado_por = ? WHERE id = ? AND journal_id = ? AND odoo_pago_id IS NULL",
    [autor.email, id, cuenta.id],
  );
  if (!res.affectedRows) return { error: "Otra persona lo está registrando" };
  const soltar = () =>
    query("UPDATE banco_comprobantes SET odoo_pago_id = NULL, odoo_registrado_por = NULL WHERE id = ? AND odoo_pago_id = 0", [id]);
  const ctx = { allowed_company_ids: [cuenta.sede], company_id: cuenta.sede };
  let pagoId: number;
  try {
    const cliente = (await callOdooRPCEstricto<any[]>("res.partner", "read", [[datos.partnerId], ["name", "user_id"]], { context: ctx }))?.[0];
    if (!cliente) throw new Error("El cliente no existe en Odoo");
    const diario = (await callOdooRPCEstricto<any[]>("account.journal", "read", [[cuenta.id], ["currency_id"]], { context: ctx }))?.[0];
    const metodos = await callOdooRPCEstricto<any[]>(
      "account.payment.method.line",
      "search_read",
      [[["journal_id", "=", cuenta.id], ["payment_type", "=", "inbound"]]],
      { fields: ["name"], context: ctx },
    );
    const metodo = metodos?.find((m) => /manual/i.test(m.name)) || metodos?.[0];
    if (!metodo) throw new Error("El diario no tiene método de pago de entrada");
    const montoUsd = Math.round((c.monto / datos.tasa) * 100) / 100;
    pagoId = (await callOdooRPCEstricto<number>(
      "account.payment",
      "create",
      [
        {
          payment_type: "inbound",
          partner_type: "customer",
          partner_id: datos.partnerId,
          journal_id: cuenta.id,
          payment_method_line_id: metodo.id,
          ...(Array.isArray(diario?.currency_id) ? { currency_id: diario.currency_id[0] } : {}),
          amount: c.monto,
          date: c.fecha,
          ref: c.referencia,
          // Como los registra CxC en el formulario de Odoo: tasa propia del cobro y su importe local en dolares
          // (Odoo lo llena al cambiar la tasa en pantalla, no al crear por la API). Total pagar lo calcula Odoo.
          custom_rate: true,
          tax_today: datos.tasa,
          amount_local: montoUsd,
          amount_ref: c.monto,
          payment_description: `<p>${escaparHtml(datos.descripcion)}</p>`,
          ...(Array.isArray(cliente.user_id) ? { salesperson_id: cliente.user_id[0] } : {}),
        },
      ],
      { context: ctx },
    )) as number;
    if (!pagoId) throw new Error("Odoo no devolvió el cobro creado");
  } catch (e: any) {
    await soltar();
    throw e;
  }
  await query("UPDATE banco_comprobantes SET odoo_pago_id = ?, odoo_registrado_at = NOW() WHERE id = ?", [pagoId, id]);
  let confirmado = true;
  let aviso: string | undefined;
  try {
    await callOdooRPCEstricto("account.payment", "action_post", [[pagoId]], { context: ctx });
  } catch (e: any) {
    confirmado = false;
    aviso = `El cobro quedó en borrador en Odoo: ${String(e?.message || "error").slice(0, 200)}`;
  }
  const a = c.api;
  try {
    await callOdooRPCEstricto("account.payment", "message_post", [[pagoId]], {
      body:
        `Cobro registrado desde el panel (Conciliación bancaria) por ${escaparHtml(autor.nombre || autor.email)} (${escaparHtml(autor.email)}). ` +
        (a.tipo === "pago_movil"
          ? `Verificado en Mercantil: Pago Móvil del ${a.fecha} desde el ${escaparHtml(a.telefono || "—")} (${escaparHtml(a.pagadorId || "—")}), ` +
            `autorización ${escaparHtml(a.autorizacion || "—")}, ref ${escaparHtml(c.referencia)}.`
          : `Verificado en Mercantil: transferencia del ${a.fecha} ${a.hora || ""} de ${escaparHtml(a.pagador || "—")} (${escaparHtml(a.pagadorId || "—")}), ` +
            `ref ${escaparHtml(c.referencia)}, estatus ${a.estatus || "—"}.`),
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
  } catch (e: any) {
    console.warn("[bancos] sin nota en el chatter:", e?.message);
  }
  const pago = (await callOdooRPCEstricto<any[]>("account.payment", "read", [[pagoId], ["name", "state"]], { context: ctx }).catch(() => null))?.[0];
  return { id: pagoId, nombre: String(pago?.name || ""), estado: String(pago?.state || ""), confirmado, aviso };
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

// ---------- Conciliar en Odoo (con aprobacion) ----------

/**
 * Cuentas que se proponen por sede (codigo en el plan de cuentas). Comisiones:
 * Caracas y Panama "Gastos Bancarios" (la que usa Caracas a mano), Valencia
 * "Comisiones Bancarias" (su 6.07.01.001 es "Debitos Bancarios"). IGTF: Valencia
 * "Gastos De IGTF", Caracas "Comision de IGTF - gastos".
 */
const SUGERIDAS: Record<number, Partial<Record<"comision" | "igtf", string>>> = {
  9: { comision: "6.07.01.002", igtf: "6.06.01.014" },
  10: { comision: "6.07.01.001", igtf: "6.07.01.004" },
  7: { comision: "6.07.01.001" },
};

export type CuentaContable = { id: number; codigo: string; nombre: string };

// Por cobrar, por pagar y caja/banco no: necesitan cliente o son la cuenta del propio diario.
const TIPOS_NO_CONTRAPARTIDA = ["asset_receivable", "liability_payable", "asset_cash", "off_balance", "equity_unaffected"];
const cacheContables = new Map<number, { hasta: number; cuentas: CuentaContable[] }>();

/** Cuentas contables de la sede que pueden ser contrapartida de un movimiento del banco. */
export async function cuentasContables(sede: number): Promise<CuentaContable[]> {
  const c = cacheContables.get(sede);
  if (c && c.hasta > Date.now()) return c.cuentas;
  const filas = await callOdooRPCEstricto<any[]>(
    "account.account",
    "search_read",
    [[["company_id", "=", sede], ["deprecated", "=", false], ["account_type", "not in", TIPOS_NO_CONTRAPARTIDA]]],
    { fields: ["code", "name"], order: "code", context: { allowed_company_ids: [sede] } },
  );
  const cuentas = (filas || []).map((f) => ({ id: f.id, codigo: String(f.code || ""), nombre: String(f.name || "") }));
  cacheContables.set(sede, { hasta: Date.now() + 10 * 60_000, cuentas });
  return cuentas;
}

/** La cuenta que se propone para un movimiento sin cobro/pago (comision, IGTF), o null. */
export async function sugeridaPara(cuenta: CuentaBanco, m: { monto: number; descripcion: string; referencia?: string }) {
  const clave = cuentaSugerida(m);
  const codigo = clave && SUGERIDAS[cuenta.sede]?.[clave];
  return codigo ? (await cuentasContables(cuenta.sede)).find((c) => c.codigo === codigo) ?? null : null;
}

/**
 * Odoo con el usuario de las conciliaciones de la sede (ver conciliarEnOdoo):
 * ODOO_CONCILIACION_UID_<sede> + ODOO_CONCILIACION_API_KEY_<sede>, si no las
 * dos sin sede; sin ninguna, el de la API del panel.
 */
function rpc<T>(sede: number, model: string, method: string, args: any[], kwargs: Record<string, any>) {
  const env = (nombre: string) => process.env[`${nombre}_${sede}`] || process.env[nombre] || "";
  const uid = Number(env("ODOO_CONCILIACION_UID")) || 0;
  const key = env("ODOO_CONCILIACION_API_KEY");
  return uid && key ? callOdooRPCComo<T>({ uid, key }, model, method, args, kwargs) : callOdooRPCEstricto<T>(model, method, args, kwargs);
}

/**
 * Contra que se concilia el movimiento: uno o varios cobros/pagos de Odoo, una
 * cuenta contable (comision, IGTF, intereses...), la cuenta de transferencias
 * internas de la sede (movimiento entre cuentas propias) o nada (la linea queda
 * en Odoo para terminarla alla).
 */
export type Destino =
  | { tipo: "pagos"; pagos: number[] }
  | { tipo: "cuenta"; cuentaId: number }
  | { tipo: "transferencia" }
  | { tipo: "sin_conciliar" };

/**
 * Concilia en Odoo un movimiento del estado de cuenta cuando una persona lo
 * aprueba en la pantalla: crea su linea de extracto en el diario con la
 * contrapartida del `destino` y, si son cobros/pagos, la concilia con sus lineas
 * en la cuenta de "Pagos/Recibos Pendientes" (todas a la vez: un movimiento que
 * paga varios cobros, o un cobro que entro en varias partes), como se hace a mano
 * en Odoo. Una transferencia se concilia con la otra pata si ya esta (misma
 * moneda, monto contrario, +-5 dias). "sin_conciliar" deja la linea contra la
 * cuenta de suspenso del diario, para terminarla en la conciliacion de Odoo.
 *
 * `unique_import_id` = "panel-<huella>": Odoo no deja crear dos veces la misma
 * linea y un reintento la reusa. No crea la linea si Odoo ya tiene una importada
 * del mismo dia y monto en el diario (esa se concilia en Odoo). Se deshace en
 * Odoo (romper conciliacion y borrar la linea).
 *
 * En Odoo lo hace el usuario de la sede (`ODOO_CONCILIACION_UID_<sede>` con su
 * API key `ODOO_CONCILIACION_API_KEY_<sede>`: Valencia Victor, Caracas Adriana): queda a su nombre y Odoo revisa sus permisos
 * (necesita Contabilidad y no estar en «Restricciones de Usuario (Supricom)»,
 * que no deja tocar dias pasados). Sin las dos, el usuario de la API del panel.
 */
export async function conciliarEnOdoo(
  cuenta: CuentaBanco,
  huellaMov: string,
  destino: Destino,
  autor: { nombre: string; email: string },
): Promise<{ error: string } | { stLineId: number; asiento: string; aviso?: string }> {
  await ensureTablas();
  const { rows } = await query(
    `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, referencia, descripcion, monto
       FROM banco_movimientos WHERE journal_id = ? AND huella = ? LIMIT 1`,
    [cuenta.id, huellaMov],
  );
  const mov = rows[0];
  if (!mov) return { error: "Ese movimiento ya no está en el estado de cuenta" };
  const monto = Number(mov.monto);
  const ctx = { allowed_company_ids: [cuenta.sede], company_id: cuenta.sede };
  const leer = async (modelo: string, dominio: any[], campos: string[]) =>
    (await rpc<any[]>(cuenta.sede, modelo, "search_read", [dominio], { fields: campos, context: ctx })) || [];
  const conciliar = async (ids: number[]) => {
    try {
      await rpc(cuenta.sede, "account.move.line", "reconcile", [ids], { context: ctx });
    } catch (e) {
      // reconcile() puede devolver algo que el JSON-RPC no sabe mandar aunque lo haya hecho: se mira en Odoo.
      const tocadas = await leer("account.move.line", [["id", "in", ids], ["matching_number", "!=", false]], ["id"]);
      if (tocadas.length < ids.length) throw e;
    }
  };

  // Contrapartida y, si son cobros/pagos, sus lineas por conciliar.
  let cuentaId: number | null = null;
  let lineasPago: number[] = [];
  let errorPendiente: string | null = null;
  let partnerId: number | null = null;
  let detalle = "";
  // Tasa (Bs por USD) con que Odoo pasa la linea a dolares (account_dual_currency: custom_tax_today). Sin ella
  // usa la BCV del dia y, contra un cobro registrado a la tasa acordada, la conciliacion deja diferencial
  // cambiario (Valencia abr-2026: ~$30 mil). Con cobros/pagos: la de ellos; si no, la BCV del dia.
  const enBolivares = /VEF|VES|BS/i.test(cuenta.moneda);
  let tasa: number | null = null;
  if (destino.tipo === "pagos") {
    const ids = [...new Set(destino.pagos)];
    // id negativo = apunte de un asiento contable en las cuentas de pendientes (ver pagosOdoo).
    const idsPago = ids.filter((i) => i > 0);
    const idsApunte = ids.filter((i) => i < 0).map((i) => -i);
    const pagos = idsPago.length
      ? await leer(
          "account.payment",
          [["id", "in", idsPago]],
          ["name", "journal_id", "state", "payment_type", "outstanding_account_id", "partner_id", "move_id"],
        )
      : [];
    if (pagos.length !== idsPago.length) return { error: "Uno de los pagos no existe en Odoo" };
    const campos = ["amount_residual_currency", "amount_currency", "balance", "move_id", "account_id", "partner_id", "parent_state", "reconciled"];
    const apuntes = idsApunte.length ? await leer("account.move.line", [["id", "in", idsApunte]], campos) : [];
    if (apuntes.length !== idsApunte.length) return { error: "Uno de los asientos no existe en Odoo" };
    if (apuntes.length) {
      const pendientes = new Set(await pendientesDelDiario(cuenta));
      for (const a of apuntes) {
        const nombre = a.move_id?.[1] || `apunte ${a.id}`;
        if (!pendientes.has(a.account_id?.[0])) return { error: `${nombre} no está en una cuenta de pendientes de este banco` };
        if (a.parent_state !== "posted") return { error: `${nombre} no está publicado en Odoo` };
        if (a.reconciled) return { error: `${nombre} ya está conciliado en Odoo` };
        if (Number(a.amount_currency) > 0 !== monto > 0) {
          return { error: `${nombre} es una ${Number(a.amount_currency) > 0 ? "entrada" : "salida"} y el movimiento es una ${monto > 0 ? "entrada" : "salida"}` };
        }
      }
    }
    for (const p of pagos) {
      if (!Array.isArray(p.journal_id) || p.journal_id[0] !== cuenta.id) return { error: `${p.name} es de otro diario` };
      if (p.state !== "posted") return { error: `${p.name} no está confirmado en Odoo` };
      if ((p.payment_type === "inbound") !== monto > 0) {
        return { error: `${p.name} es un ${p.payment_type === "inbound" ? "cobro" : "pago"} y el movimiento es una ${monto > 0 ? "entrada" : "salida"}` };
      }
      if (!Array.isArray(p.outstanding_account_id)) return { error: `${p.name} no tiene cuenta de pagos pendientes` };
    }
    const cuentasPend = new Set([...pagos.map((p) => p.outstanding_account_id[0]), ...apuntes.map((a) => a.account_id[0])]);
    if (cuentasPend.size > 1) return { error: "Lo elegido usa cuentas de pendientes distintas: concílialo por separado" };
    cuentaId = [...cuentasPend][0];
    const partners = new Set(
      [...pagos, ...apuntes].map((p) => (Array.isArray(p.partner_id) ? p.partner_id[0] : 0)),
    );
    partnerId = partners.size === 1 ? [...partners][0] || null : null;
    const lineasPagos = pagos.length
      ? await leer("account.move.line", [["move_id", "in", pagos.map((p) => p.move_id[0])], ["account_id", "=", cuentaId]], campos)
      : [];
    if (lineasPagos.length !== pagos.length) return { error: "No se encontró la línea de algún pago en la cuenta de pagos pendientes" };
    const lineas = [...lineasPagos, ...apuntes];
    lineasPago = lineas.map((l) => l.id);
    if (enBolivares) {
      const bs = lineas.reduce((t, l) => t + Math.abs(Number(l.amount_currency) || 0), 0);
      const usd = lineas.reduce((t, l) => t + Math.abs(Number(l.balance) || 0), 0);
      tasa = usd > 0 ? bs / usd : null;
    }
    errorPendiente = errorPagos(monto, lineas.map((l) => Math.abs(Number(l.amount_residual_currency) || 0)));
    detalle = [...pagos.map((p) => p.name), ...apuntes.map((a) => a.move_id?.[1] || "")].join(", ");
  } else if (destino.tipo === "cuenta") {
    const c = (await cuentasContables(cuenta.sede)).find((x) => x.id === destino.cuentaId);
    if (!c) return { error: "Esa cuenta contable no es de la sede o no se puede usar de contrapartida" };
    cuentaId = c.id;
    detalle = `${c.codigo} ${c.nombre}`;
    if (cuentaSugerida({ monto, descripcion: mov.descripcion, referencia: mov.referencia }) === "comision") {
      // Antes se sumaban las comisiones del mes en un asiento contra Pagos Pendientes: con ese asiento abierto,
      // registrar cada comision a gasto lo duplica. Hay que revertirlo en Odoo primero.
      const metodos = await leer("account.payment.method.line", [["journal_id", "=", cuenta.id]], ["payment_account_id"]);
      const pendientes = [...new Set(metodos.map((x) => x.payment_account_id?.[0]).filter(Boolean))];
      const mes = mov.fecha.slice(0, 7);
      const finMes = new Date(Date.UTC(+mes.slice(0, 4), +mes.slice(5, 7), 0)).toISOString().slice(0, 10);
      const delMes = pendientes.length
        ? await leer(
            "account.move.line",
            [
              ["account_id", "in", pendientes],
              ["parent_state", "=", "posted"],
              ["journal_id.type", "=", "general"],
              ["reconciled", "=", false],
              ["date", ">=", `${mes}-01`],
              ["date", "<=", finMes],
              "|",
              "|",
              ["name", "ilike", "comisi"],
              ["move_id.ref", "ilike", "comisi"],
              ["move_id.ref", "ilike", "debitos%bancarios"],
            ],
            ["move_id", "amount_currency"],
          )
        : [];
      if (delMes.length) {
        const a = delMes[0];
        return {
          error:
            `${mes} ya tiene en Odoo el asiento de comisiones del mes (${a.move_id?.[1] || ""}, ${Math.abs(Number(a.amount_currency) || 0)}): ` +
            "si se aprueban una por una, el gasto queda dos veces. Revérsalo en Odoo primero.",
        };
      }
    }
  } else if (destino.tipo === "transferencia") {
    const cia = (await leer("res.company", [["id", "=", cuenta.sede]], ["transfer_account_id"]))[0];
    if (!Array.isArray(cia?.transfer_account_id)) return { error: "La sede no tiene cuenta de transferencias internas en Odoo" };
    cuentaId = cia.transfer_account_id[0];
    detalle = `Transferencia entre cuentas propias (${cia.transfer_account_id[1]})`;
  } else {
    detalle = "Pasado a Odoo sin conciliar";
  }

  if (enBolivares && !tasa) {
    // BCV del dia: la tasa del USD de la sede (rate = USD por 1 Bs).
    const fila = (
      await rpc<any[]>(cuenta.sede, "res.currency.rate", "search_read", [[["currency_id.name", "=", "USD"], ["company_id", "=", cuenta.sede], ["name", "<=", mov.fecha]]], {
        fields: ["rate"],
        order: "name desc",
        limit: 1,
        context: ctx,
      })
    )?.[0];
    tasa = Number(fila?.rate) > 0 ? 1 / Number(fila.rate) : null;
  }
  if (enBolivares && !tasa) return { error: `No se encontró la tasa para el ${mov.fecha}` };

  const importId = `panel-${huellaMov}`;
  let linea = (await leer("account.bank.statement.line", [["unique_import_id", "=", importId]], ["move_id"]))[0];
  // Si la linea ya existe es un reintento: lo que falta es solo conciliar (o nada).
  if (!linea) {
    if (errorPendiente) return { error: errorPendiente };
    const importada = (
      await leer(
        "account.bank.statement.line",
        [["journal_id", "=", cuenta.id], ["date", "=", mov.fecha], ["amount", "=", monto], ["unique_import_id", "not ilike", "panel-"]],
        ["move_id"],
      )
    )[0];
    if (importada) {
      return {
        error: `Odoo ya tiene esta línea de extracto (${importada.move_id?.[1] || importada.id}): concíliala en Odoo, o deshazla en «Líneas que ya estaban en Odoo» y apruébala aquí`,
      };
    }
    const id = await rpc<number>(
      cuenta.sede,
      "account.bank.statement.line",
      "create",
      [
        {
          journal_id: cuenta.id,
          date: mov.fecha,
          amount: monto,
          payment_ref: [mov.referencia, mov.descripcion].filter(Boolean).join(" · ").slice(0, 250) || "Movimiento del banco",
          unique_import_id: importId,
          ...(cuentaId ? { counterpart_account_id: cuentaId } : {}),
          ...(partnerId ? { partner_id: partnerId } : {}),
          // Como las lineas que Caracas concilia a mano: tasa propia de la linea.
          ...(tasa ? { custom_tax_today: tasa, custom_rate_auto: true } : {}),
        },
      ],
      { context: ctx },
    );
    if (!id) throw new Error("Odoo no devolvió la línea de extracto");
    linea = (await leer("account.bank.statement.line", [["id", "=", id]], ["move_id"]))[0];
    if (tasa) {
      // Control: si Odoo no la paso a dolares con esa tasa, se borra la linea recien creada y no se concilia.
      const lineas = await leer("account.move.line", [["move_id", "=", linea.move_id[0]]], ["balance"]);
      const usd = Math.max(0, ...lineas.map((l) => Math.abs(Number(l.balance) || 0)));
      const esperado = Math.abs(monto) / tasa;
      if (Math.abs(usd - esperado) > Math.max(0.05, esperado * 0.001)) {
        await rpc(cuenta.sede, "account.bank.statement.line", "unlink", [[id]], { context: ctx });
        return {
          error: `Odoo pasó el movimiento a ${usd.toFixed(2)} USD y con la tasa ${tasa.toFixed(4)} son ${esperado.toFixed(2)} USD: no se concilió, para no generar diferencial cambiario`,
        };
      }
    }
  }
  const asientoId = Array.isArray(linea.move_id) ? linea.move_id[0] : 0;
  const contra = cuentaId
    ? (await leer("account.move.line", [["move_id", "=", asientoId], ["account_id", "=", cuentaId]], ["reconciled", "amount_currency", "currency_id"]))[0]
    : null;
  if (cuentaId && !contra) {
    return { error: "Ese movimiento ya se pasó a Odoo con otra contrapartida: termínalo o deshazlo en Odoo" };
  }

  let aviso: string | undefined;
  if (destino.tipo === "pagos" && !contra.reconciled) {
    if (errorPendiente) return { error: errorPendiente };
    await conciliar([contra.id, ...lineasPago]);
  }
  if (destino.tipo === "transferencia" && !contra.reconciled) {
    // La otra pata: linea de extracto de otro diario en la misma cuenta, misma moneda, monto contrario.
    const dias = (n: number) => new Date(Date.parse(mov.fecha) + n * 86400_000).toISOString().slice(0, 10);
    const otras = await leer(
      "account.move.line",
      [
        ["account_id", "=", cuentaId],
        ["reconciled", "=", false],
        ["parent_state", "=", "posted"],
        ["journal_id", "!=", cuenta.id],
        ["move_id.statement_line_id", "!=", false],
        ["currency_id", "=", Array.isArray(contra.currency_id) ? contra.currency_id[0] : false],
        ["amount_currency", "=", -Number(contra.amount_currency)],
        ["date", ">=", dias(-5)],
        ["date", "<=", dias(5)],
      ],
      ["move_id"],
    );
    if (otras.length === 1) await conciliar([contra.id, otras[0].id]);
    else aviso = otras.length ? "Hay varias posibles contrapartes en la otra cuenta: concílialas en Odoo" : "La otra cuenta todavía no tiene su movimiento: cuando se cargue, se concilian entre sí";
  }

  await query(
    `INSERT INTO banco_conciliaciones (huella, journal_id, st_line_id, pago_odoo_id, detalle, aprobado_por) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE st_line_id = VALUES(st_line_id), pago_odoo_id = VALUES(pago_odoo_id), detalle = VALUES(detalle),
       aprobado_por = VALUES(aprobado_por), created_at = CURRENT_TIMESTAMP`,
    [huellaMov, cuenta.id, linea.id, destino.tipo === "pagos" ? destino.pagos[0] : null, detalle.slice(0, 255), autor.email],
  );
  try {
    await rpc(cuenta.sede, "account.move", "message_post", [[asientoId]], {
      body:
        `${destino.tipo === "sin_conciliar" ? "Pasado a Odoo" : "Conciliado"} desde el panel (Conciliación bancaria) por ` +
        `${escaparHtml(autor.nombre || autor.email)} (${escaparHtml(autor.email)}): movimiento del banco del ${mov.fecha}, ` +
        `ref ${escaparHtml(mov.referencia || "—")}, ${monto}. ${escaparHtml(detalle)}.`,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
  } catch (e: any) {
    console.warn("[bancos] sin nota en el chatter:", e?.message);
  }
  return { stLineId: linea.id, asiento: Array.isArray(linea.move_id) ? String(linea.move_id[1]) : "", aviso };
}

// ---------- Lineas viejas de Odoo (deshacer y rehacer desde el panel) ----------

export type LineaVieja = {
  id: number;
  fecha: string;
  monto: number;
  descripcion: string;
  asiento: string;
  estado: "con_diferencial" | "conciliada" | "sin_conciliar";
  /** Asientos de los cobros/pagos con que se concilio. */
  contra: string[];
  /** Diferencial cambiario que genero la conciliacion (USD, ingresos - egresos). */
  diferencial: number;
  /** Asientos de diferencial cambiario de su conciliacion. */
  asientosDiferencial: number[];
  /** El estado de cuenta del panel tiene ese movimiento: se puede rehacer desde el panel. */
  enPanel: boolean;
  /** El movimiento del panel que le corresponde (`emparejarViejas`: puede tener el monto distinto si Odoo lo tiene mal cargado). */
  movPanel: MovPanel | null;
};

/**
 * Lineas de extracto de Odoo del diario en el periodo que NO creo el panel
 * (importadas o hechas a mano). Las conciliadas con diferencial cambiario son
 * las "malas" (la linea a BCV contra un cobro a tasa acordada); mientras sigan
 * en Odoo el panel no crea la suya (`conciliarEnOdoo`: "Odoo ya tiene esta linea").
 */
export async function lineasViejasOdoo(cuenta: CuentaBanco, inicio: string, fin: string): Promise<LineaVieja[]> {
  const malo = errorPeriodo(inicio, fin);
  if (malo) throw new Error(malo);
  await ensureTablas();
  const ctx = { allowed_company_ids: [cuenta.sede] };
  const leer = async (modelo: string, dominio: any[], campos: string[]) =>
    (await callOdooRPCEstricto<any[]>(modelo, "search_read", [dominio], { fields: campos, context: ctx })) || [];
  const lineas = await leer(
    "account.bank.statement.line",
    [["journal_id", "=", cuenta.id], ["date", ">=", inicio], ["date", "<=", fin], ["unique_import_id", "not ilike", "panel-"]],
    ["date", "amount", "payment_ref", "is_reconciled", "move_id"],
  );
  if (!lineas.length) return [];
  const movesIds = lineas.map((l) => l.move_id[0]);
  const apuntes = await leer("account.move.line", [["move_id", "in", movesIds]], ["move_id", "matched_debit_ids", "matched_credit_ids"]);
  const partialIds = [...new Set(apuntes.flatMap((a) => [...a.matched_debit_ids, ...a.matched_credit_ids]))];
  const parciales = partialIds.length
    ? await leer("account.partial.reconcile", [["id", "in", partialIds]], ["debit_move_id", "credit_move_id", "exchange_move_id", "full_reconcile_id"])
    : [];
  const fullIds = [...new Set(parciales.map((p) => p.full_reconcile_id?.[0]).filter(Boolean))];
  const fulls = fullIds.length ? await leer("account.full.reconcile", [["id", "in", fullIds]], ["exchange_move_id"]) : [];
  const difIds = [...new Set([...parciales.map((p) => p.exchange_move_id?.[0]), ...fulls.map((f) => f.exchange_move_id?.[0])].filter(Boolean))];
  // Diferencial de cada asiento: lo que fue a ingreso (8.01.01.001, credito) menos lo que fue a egreso.
  const difApuntes = difIds.length
    ? await leer("account.move.line", [["move_id", "in", difIds], ["account_id.code", "=like", "8.%"]], ["move_id", "balance"])
    : [];
  const difPorAsiento = new Map<number, number>();
  for (const a of difApuntes) difPorAsiento.set(a.move_id[0], (difPorAsiento.get(a.move_id[0]) || 0) - Number(a.balance || 0));
  const fullDif = new Map(fulls.map((f) => [f.id, f.exchange_move_id?.[0]]));

  // Con 3 dias de margen: una linea mal cargada se empareja tambien por referencia en dias cercanos.
  const { rows } = await query(
    `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha, monto, referencia FROM banco_movimientos
      WHERE journal_id = ? AND fecha BETWEEN DATE_SUB(?, INTERVAL 3 DAY) AND DATE_ADD(?, INTERVAL 3 DAY)`,
    [cuenta.id, inicio, fin],
  );
  const delPanel = emparejarViejas(
    lineas.map((l) => ({ id: l.id, fecha: String(l.date), monto: Number(l.amount) || 0, ref: String(l.payment_ref || "") })),
    rows.map((r: any) => ({ fecha: r.fecha, monto: Number(r.monto), referencia: String(r.referencia || "") })),
  );

  return lineas.map((l) => {
    const moveId = l.move_id[0];
    const mios = new Set(apuntes.filter((a) => a.move_id[0] === moveId).map((a) => a.id));
    const susParciales = parciales.filter((p) => mios.has(p.debit_move_id[0]) || mios.has(p.credit_move_id[0]));
    const difs = new Set<number>();
    for (const p of susParciales) {
      if (p.exchange_move_id) difs.add(p.exchange_move_id[0]);
      const f = p.full_reconcile_id && fullDif.get(p.full_reconcile_id[0]);
      if (f) difs.add(f);
    }
    const diferencial = [...difs].reduce((s, id) => s + (difPorAsiento.get(id) || 0), 0);
    const contra = [
      ...new Set(
        susParciales.map((p) => String((mios.has(p.debit_move_id[0]) ? p.credit_move_id : p.debit_move_id)[1] || "").split(" ")[0]),
      ),
    ].filter(Boolean);
    const monto = Number(l.amount) || 0;
    return {
      id: l.id,
      fecha: String(l.date),
      monto,
      descripcion: String(l.payment_ref || ""),
      asiento: String(l.move_id[1] || ""),
      estado: difs.size ? "con_diferencial" : l.is_reconciled ? "conciliada" : "sin_conciliar",
      contra,
      diferencial: Math.round(diferencial * 100) / 100,
      asientosDiferencial: [...difs],
      enPanel: delPanel.has(l.id),
      movPanel: delPanel.get(l.id) ?? null,
    };
  });
}

/**
 * Deshace (si estaba conciliada) y borra en Odoo una linea de extracto vieja,
 * para rehacerla desde el panel sin diferencial. Solo lineas que no creo el
 * panel y cuyo movimiento esta en el estado de cuenta del panel (si no, no se
 * podria rehacer). Deshacer es el "Revertir conciliacion" de Odoo: los cobros o
 * pagos vuelven a quedar pendientes. Con `diferencial = "reverso"` Odoo revierte
 * los asientos de diferencial cambiario (quedan el original y su reverso, en
 * neto cero); con "borrar", despues de deshacer, el original y su reverso se pasan
 * a borrador y se borran del todo (`force_delete`: Odoo no deja borrar un asiento
 * con numero que no es el ultimo de su secuencia); si eso falla quedan revertidos
 * y se avisa. Queda registro en `banco_deshechos`.
 */
export async function deshacerLineaVieja(
  cuenta: CuentaBanco,
  stLineId: number,
  autor: { nombre: string; email: string },
  diferencialModo: "reverso" | "borrar" = "reverso",
) {
  await ensureTablas();
  const ctx = { allowed_company_ids: [cuenta.sede], company_id: cuenta.sede };
  const linea = (
    await rpc<any[]>(cuenta.sede, "account.bank.statement.line", "search_read", [[["id", "=", stLineId], ["journal_id", "=", cuenta.id]]], {
      fields: ["date", "amount", "payment_ref", "is_reconciled", "unique_import_id", "move_id"],
      context: ctx,
    })
  )?.[0];
  if (!linea) return { error: "Esa línea no existe en Odoo o es de otro diario" };
  if (String(linea.unique_import_id || "").startsWith("panel-")) return { error: "Esa línea la creó el panel: deshazla en Odoo" };
  const monto = Number(linea.amount) || 0;
  const viejas = await lineasViejasOdoo(cuenta, String(linea.date), String(linea.date));
  const info = viejas.find((v) => v.id === stLineId);
  if (!info?.enPanel) return { error: `Primero sube el estado de cuenta del ${linea.date}: si se borra sin él, no se puede rehacer desde el panel` };
  const difs = info?.asientosDiferencial || [];
  let avisoDif: string | undefined;
  let modoHecho = diferencialModo;
  if (linea.is_reconciled || info?.contra.length) {
    // Con diferencial, la linea del banco tiene dos conciliaciones: con el cobro (la que lleva el asiento de
    // diferencial, exchange_move_id) y con el propio asiento de diferencial. «Revertir conciliacion» las rompe
    // juntas y Odoo, al revertir el diferencial, lo encuentra todavia conciliado con la linea del banco: «No puede
    // hacer esta modificacion en un asiento contable conciliado» (BANES/2026/00291 / EXCH/2026/04/0045, nov-2026).
    // Y al romper la que lleva el diferencial, la moneda dual reescribe los apuntes del cobro/pago, y como ese
    // cobro sigue conciliado con su factura Odoo lo rechaza (PBANES/2026/00039 / FPROV/2026/04/0045, nov-2026; ni
    // `skip_account_move_synchronization` lo evita). Por eso, con diferencial: se suelta el cobro de sus facturas, se
    // deshace lo del banco y, si los montos del cobro quedaron iguales, se vuelve a aplicar a las mismas facturas.
    // Si el cobro cambio, no se vuelve a aplicar (quedaria un diferencial o un saldo nuevo) y se avisa; si algo
    // falla antes de deshacer lo del banco, se vuelve a aplicar enseguida, como estaba.
    const sinSincronizar = { ...ctx, skip_account_move_synchronization: true };
    const leer = async (modelo: string, dominio: any[], campos: string[]) =>
      (await rpc<any[]>(cuenta.sede, modelo, "search_read", [dominio], { fields: campos, context: ctx })) || [];
    const parcialesDe = (lineas: any[]) => [...new Set(lineas.flatMap((a) => [...(a.matched_debit_ids || []), ...(a.matched_credit_ids || [])]))] as number[];
    if (difs.length) {
      const apuntes = await leer("account.move.line", [["move_id", "in", [linea.move_id[0], ...difs]]], ["matched_debit_ids", "matched_credit_ids"]);
      const propios = new Set(apuntes.map((a) => a.id));
      const parciales = await leer("account.partial.reconcile", [["id", "in", parcialesDe(apuntes)]], ["exchange_move_id", "debit_move_id", "credit_move_id"]);
      const delBanco = new Set(parciales.map((p) => p.id));

      // Los cobros/pagos del otro lado y lo que tienen aplicado fuera de esta conciliacion (sus facturas).
      const contrapartes = parciales.flatMap((p) => [p.debit_move_id[0], p.credit_move_id[0]]).filter((id) => !propios.has(id));
      const movesPago = [
        ...new Set((contrapartes.length ? await leer("account.move.line", [["id", "in", contrapartes]], ["move_id"]) : []).map((l) => l.move_id[0])),
      ];
      const camposPago = ["move_id", "account_id", "balance", "amount_currency", "reconciled", "matched_debit_ids", "matched_credit_ids"];
      const lineasPago = movesPago.length ? await leer("account.move.line", [["move_id", "in", movesPago]], camposPago) : [];
      const dePago = new Set(lineasPago.map((l) => l.id));
      const aplicadas = (
        await leer("account.partial.reconcile", [["id", "in", parcialesDe(lineasPago).filter((id) => !delBanco.has(id))]], ["debit_move_id", "credit_move_id"])
      ).map((p) => {
        const pago = dePago.has(p.debit_move_id[0]) ? p.debit_move_id[0] : p.credit_move_id[0];
        const l = lineasPago.find((x) => x.id === pago)!;
        return { id: p.id, move: l.move_id[0], nombre: String(l.move_id[1] || ""), cuentaPago: l.account_id[0], otra: pago === p.debit_move_id[0] ? p.credit_move_id[0] : p.debit_move_id[0] };
      });
      // Sumas de cada cobro por cuenta (los apuntes se pueden volver a crear: se comparan por cuenta, no por id).
      const sumas = (lineas: any[]) => {
        const m = new Map<string, { balance: number; moneda: number }>();
        for (const l of lineas) {
          const k = `${l.move_id[0]}|${l.account_id[0]}`;
          const s = m.get(k) || { balance: 0, moneda: 0 };
          m.set(k, { balance: s.balance + (Number(l.balance) || 0), moneda: s.moneda + (Number(l.amount_currency) || 0) });
        }
        return m;
      };
      const antes = sumas(lineasPago);

      /** Vuelve a aplicar cada cobro a sus facturas si sus montos no cambiaron. Devuelve el aviso, si hay. */
      const reaplicar = async (): Promise<string | undefined> => {
        if (!aplicadas.length) return undefined;
        const cambiado = (lineas: any[]) => {
          const despues = sumas(lineas);
          return [...antes].some(([k, v]) => {
            const d = despues.get(k);
            return !d || Math.abs(d.balance - v.balance) > 0.005 || Math.abs(d.moneda - v.moneda) > 0.005;
          });
        };
        let ahora = await leer("account.move.line", [["move_id", "in", movesPago]], camposPago);
        if (cambiado(ahora)) {
          // La moneda dual rehizo los apuntes del pago a la BCV del dia aunque el pago tiene su tasa acordada
          // (PBANES/2026/00039: $1.476,19 a 630 paso a $1.909,18 a 487,12, nov-2026; el pago seguia diciendo 630).
          // Pasarlo a borrador y confirmarlo de nuevo rehace los apuntes con la tasa del pago.
          const pagos = await leer("account.payment", [["move_id", "in", movesPago]], ["id"]);
          try {
            for (const p of pagos) {
              await rpc(cuenta.sede, "account.payment", "action_draft", [[p.id]], { context: ctx });
              await rpc(cuenta.sede, "account.payment", "action_post", [[p.id]], { context: ctx });
            }
          } catch {
            // se avisa abajo con el monto como quedo
          }
          ahora = await leer("account.move.line", [["move_id", "in", movesPago]], camposPago);
        }
        const cambio = cambiado(ahora);
        const nombres = [...new Set(aplicadas.map((a) => a.nombre))].join(", ");
        if (cambio) {
          return `${nombres} cambió de monto al deshacer y no se volvió a aplicar a sus facturas (quedaría un diferencial): revísalo en Odoo y aplícalo a mano`;
        }
        const fallas: string[] = [];
        // Agrupadas por apunte del cobro (Node 20 en el servidor: sin Object.groupBy).
        const grupos = new Map<string, typeof aplicadas>();
        for (const a of aplicadas) grupos.set(`${a.move}|${a.cuentaPago}`, [...(grupos.get(`${a.move}|${a.cuentaPago}`) || []), a]);
        for (const [clave, grupo] of grupos) {
          const [move, cuentaPago] = clave.split("|").map(Number);
          const lineaPago = ahora.find((l) => l.move_id[0] === move && l.account_id[0] === cuentaPago && !l.reconciled);
          const ids = lineaPago ? [lineaPago.id, ...grupo.map((a) => a.otra)] : [];
          try {
            if (!ids.length) throw new Error("sin apunte");
            await rpc(cuenta.sede, "account.move.line", "reconcile", [ids], { context: ctx });
          } catch {
            // reconcile() puede devolver algo que el JSON-RPC no sabe mandar aunque lo haya hecho: se mira en Odoo.
            const hecho = ids.length && (await leer("account.move.line", [["id", "=", ids[0]], ["matching_number", "!=", false]], ["id"])).length;
            if (!hecho) fallas.push(grupo[0].nombre);
          }
        }
        return fallas.length ? `No se pudo volver a aplicar ${fallas.join(", ")} a sus facturas: aplícalo en Odoo` : undefined;
      };

      // Romper CUALQUIER conciliacion del cobro hace que la moneda dual reescriba sus apuntes, y Odoo lo rechaza
      // mientras le quede otra (soltarlo primero de la factura choca con la del banco y al reves: PBANES/2026/00039
      // con 7460 y 12446, nov-2026). Por eso todas las del cobro se rompen en UNA sola llamada: cuando la moneda dual
      // escribe, ya no le queda ninguna.
      try {
        // 1) De a una, las que no tocan el cobro (la linea del banco con el asiento de diferencial): el diferencial
        //    queda suelto y Odoo lo puede revertir despues.
        // 2) Juntas, TODAS las que tocan el cobro: con el banco, con el diferencial (a veces el diferencial esta
        //    conciliado con el cobro y no con el banco: BANES/2026/00294 / PBANES/2026/00059, 7467 y 7468) y con sus
        //    facturas. Si una de esas se rompe sola, al cobro le queda otra y Odoo rechaza que la moneda dual lo reescriba.
        const tocaPago = (x: any) => dePago.has(x.debit_move_id[0]) || dePago.has(x.credit_move_id[0]);
        for (const p of parciales.filter((x) => !tocaPago(x))) {
          await rpc(cuenta.sede, "account.partial.reconcile", "unlink", [[p.id]], { context: sinSincronizar });
        }
        const juntas = [...parciales.filter(tocaPago).map((x) => x.id), ...aplicadas.map((a) => a.id)];
        if (juntas.length) await rpc(cuenta.sede, "account.partial.reconcile", "unlink", [juntas], { context: sinSincronizar });
        await rpc(cuenta.sede, "account.bank.statement.line", "action_undo_reconciliation", [[stLineId]], { context: sinSincronizar });
      } catch (e) {
        // Si ya se habia soltado de sus facturas, dejarlo aplicado otra vez, como estaba.
        const siguen = aplicadas.length ? await leer("account.partial.reconcile", [["id", "in", aplicadas.map((a) => a.id)]], ["id"]).catch(() => []) : [];
        if (aplicadas.length && !siguen.length) await reaplicar().catch(() => undefined);
        throw e;
      }
      // 3) Volver a aplicar los cobros a sus facturas.
      avisoDif = await reaplicar();
    } else {
      await rpc(cuenta.sede, "account.bank.statement.line", "action_undo_reconciliation", [[stLineId]], { context: sinSincronizar });
    }
  }
  await rpc(cuenta.sede, "account.bank.statement.line", "unlink", [[stLineId]], { context: ctx });
  if (diferencialModo === "borrar" && difs.length) {
    // Odoo no deja pasar a borrador un asiento de diferencial mientras es de una conciliacion: al deshacerla
    // arriba lo revirtio. Ahora el original y su reverso ya no son de ninguna y se borran los dos.
    const reversos = (
      (await rpc<any[]>(cuenta.sede, "account.move", "search_read", [[["reversed_entry_id", "in", difs]]], { fields: ["id"], context: ctx })) || []
    ).map((m) => m.id);
    const borrar = [...difs, ...reversos];
    try {
      await rpc(cuenta.sede, "account.move", "button_draft", [borrar], { context: ctx });
      await rpc(cuenta.sede, "account.move", "unlink", [borrar], { context: { ...ctx, force_delete: true } });
    } catch (e: any) {
      avisoDif = [
        avisoDif,
        `La línea se deshizo y se borró, pero los asientos de diferencial quedaron revertidos (no se pudieron borrar: ${String(e?.message || "error").slice(0, 200)})`,
      ]
        .filter(Boolean)
        .join(". ");
      modoHecho = "reverso";
    }
  }
  await query(
    `INSERT INTO banco_deshechos (journal_id, st_line_id, asiento, fecha, monto, descripcion, contra, diferencial, diferencial_modo, hecho_por)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      cuenta.id,
      stLineId,
      String(linea.move_id?.[1] || ""),
      linea.date,
      monto,
      String(linea.payment_ref || "").slice(0, 255),
      (info?.contra || []).join(", ").slice(0, 255),
      info?.diferencial || 0,
      difs.length ? modoHecho : "",
      autor.email,
    ],
  );
  return {
    ok: true as const,
    contra: info?.contra || [],
    diferencial: info?.diferencial || 0,
    diferencialModo: difs.length ? modoHecho : null,
    aviso: avisoDif,
  };
}

// ---------- Conciliacion ----------

// Margen a cada lado del periodo para cruzar: Odoo puede tener el cobro con
// otro dia que el banco (la referencia se busca hasta 15 dias, DIAS_VENTANA).
const MARGEN_DIAS = 15;

/**
 * La conciliacion de una cuenta en un periodo (un mes o un rango de fechas,
 * hasta MAX_DIAS_PERIODO dias). Se cruza con MARGEN_DIAS de margen a cada lado y
 * se devuelve solo lo del periodo.
 */
export async function conciliacionPeriodo(cuenta: CuentaBanco, inicio: string, fin: string) {
  const malo = errorPeriodo(inicio, fin);
  if (malo) throw new Error(malo);
  await ensureTablas();
  const desde = sumarDias(inicio, -MARGEN_DIAS);
  const hasta = sumarDias(fin, MARGEN_DIAS);
  const [movs, estados, comps, amarres, pagos, concs] = await Promise.all([
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
              cliente, movimiento_huella, archivo_nombre, subido_por, api_detalle, odoo_pago_id
         FROM banco_comprobantes WHERE journal_id = ? AND fecha BETWEEN ? AND ? ORDER BY fecha, id`,
      [cuenta.id, desde, hasta],
    ),
    query("SELECT huella, pago_odoo_id FROM banco_amarres WHERE journal_id = ?", [cuenta.id]),
    pagosOdoo(cuenta, desde, hasta),
    query("SELECT huella, st_line_id, detalle, aprobado_por, created_at FROM banco_conciliaciones WHERE journal_id = ?", [cuenta.id]),
  ]);
  // Solo las lineas que siguen en Odoo (alguien pudo romper la conciliacion y borrarla alla).
  const enSemanaHuellas = new Set(movs.rows.map((r: any) => r.huella));
  const filasConc = concs.rows.filter((r: any) => enSemanaHuellas.has(r.huella));
  const idsLinea = filasConc.map((r: any) => Number(r.st_line_id));
  // id de la linea -> si ya esta conciliada (una "sin conciliar" pudo terminarse en Odoo) y su asiento.
  const vivas = new Map<number, { conciliada: boolean; asientoId: number; asiento: string }>(
    idsLinea.length
      ? ((await callOdooRPCEstricto<any[]>("account.bank.statement.line", "search_read", [[["id", "in", idsLinea]]], {
          fields: ["is_reconciled", "move_id"],
          context: { allowed_company_ids: [cuenta.sede] },
        })) || []).map((l) => [
          l.id,
          {
            conciliada: !!l.is_reconciled,
            asientoId: Array.isArray(l.move_id) ? Number(l.move_id[0]) : 0,
            asiento: Array.isArray(l.move_id) ? String(l.move_id[1]) : "",
          },
        ])
      : [],
  );
  const conciliadoEnOdoo = new Map<
    string,
    { stLineId: number; asientoId: number; asiento: string; detalle: string; conciliada: boolean; por: string; el: string }
  >(
    filasConc
      .filter((r: any) => vivas.has(Number(r.st_line_id)))
      .map((r: any) => [
        r.huella,
        {
          stLineId: Number(r.st_line_id),
          detalle: String(r.detalle || ""),
          ...vivas.get(Number(r.st_line_id))!,
          por: r.aprobado_por,
          el: new Date(r.created_at).toISOString(),
        },
      ]),
  );
  const mercantil = !!(await credencialesMercantil(cuenta.id, cuenta.sede));
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
    api: r.api_detalle ? (JSON.parse(r.api_detalle) as VerificacionApi) : null,
    // 0 (registrandose en este momento) va como null.
    odooPagoId: r.odoo_pago_id ? Number(r.odoo_pago_id) : null,
  }));
  const manuales = new Map<string, number>(amarres.rows.map((r: any) => [r.huella, Number(r.pago_odoo_id)]));
  const cubierto = (dia: string) => estados.rows.some((e: any) => dia >= e.desde && dia <= e.hasta);
  const cruce = cruzarBanco(movimientos, pagos, comprobantes, manuales, cubierto);

  const enSemana = (dia: string) => dia >= inicio && dia <= fin;
  const deLaSemana = await Promise.all(
    cruce.movimientos
      .filter((m) => enSemana(m.fecha))
      .map(async (m) => ({
        ...m,
        odoo: conciliadoEnOdoo.get(m.id) ?? null,
        /** Cuenta que se propone si no tiene cobro/pago (comision, IGTF). */
        sugerida: m.pago ? null : await sugeridaPara(cuenta, m).catch(() => null),
      })),
  );
  const pagosTomados = new Set(cruce.movimientos.flatMap((m) => [m.pago, ...m.otrosPagos]).filter((p) => p).map((p) => p!.id));
  for (const id of cruce.pagosConfirmadosApi) pagosTomados.add(id);
  return {
    /** La cuenta consulta los comprobantes en el banco (API de Mercantil). */
    mercantil,
    /** Entradas y salidas del periodo; `odoo` = ya pasado a Odoo desde el panel (con o sin conciliar). */
    movimientos: deLaSemana,
    comprobantes: cruce.comprobantes.filter((c) => enSemana(c.fecha)),
    pagosSinMovimiento: cruce.pagosSinMovimiento.filter((p) => enSemana(p.fecha)),
    /** Cobros y pagos de Odoo de la ventana que no tomo ningun movimiento: para amarrar a mano. */
    pagosLibres: pagos.filter((p) => !pagosTomados.has(p.id)),
    /** Dias del periodo que no cubre ningun estado de cuenta. */
    diasSinEstado: Array.from({ length: Math.round((Date.parse(fin) - Date.parse(inicio)) / DIA_MS) + 1 }, (_, i) =>
      sumarDias(inicio, i),
    ).filter((d) => !cubierto(d)),
    archivos: estados.rows
      .filter((e: any) => e.desde <= fin && e.hasta >= inicio)
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

export type ConciliacionBanco = Awaited<ReturnType<typeof conciliacionPeriodo>>;
