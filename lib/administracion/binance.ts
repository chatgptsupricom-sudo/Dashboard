import crypto from "crypto";
import http from "http";
import https from "https";
import tls from "tls";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { db, query } from "@/lib/db";
import { esRolAdministracion, sedeDelToken } from "@/lib/auth/sedeRol";

/**
 * Conciliacion de pagos de Binance Pay (rol Administracion). La cuenta de
 * Binance de Supricom es una sola para todas las sedes.
 *
 * Administracion sube los comprobantes (capturas de la app de quien pago),
 * la IA (OpenAI si hay OPENAI_API_KEY, si no Claude) lee de cada uno el ID de orden, el monto, la moneda y la fecha, y se
 * guardan en `binance_comprobantes` (se crea sola). El cruce contra Binance no
 * se guarda: se hace cada vez que se abre la semana, con el historial de
 * Binance Pay (`GET /sapi/v1/pay/transactions`, 18 meses hacia atras).
 *
 * Necesita BINANCE_API_KEY / BINANCE_API_SECRET (una key de solo lectura) y
 * OPENAI_API_KEY (o ANTHROPIC_API_KEY) para leer los comprobantes.
 *
 * Sin la API, Administracion sube el estado de cuenta de Binance Pay (capturas o
 * PDF de la lista de movimientos: fecha, quien, monto, moneda). Eso no trae el
 * ID de orden: se cruza por monto + moneda + hora al minuto (`cruzar`). Las
 * filas quedan en `binance_movimientos` (se crea sola) y, si la semana tiene
 * estado de cuenta, se usa ese en vez de la API.
 *
 * Binance responde 451 desde paises restringidos (el servidor del panel esta
 * en uno). BINANCE_PROXY_URL (http://usuario:clave@host:puerto) hace que solo
 * estas consultas salgan por un proxy HTTP en un pais permitido, p. ej. el de
 * un contenedor gluetun con VPN; el resto del panel sigue saliendo directo.
 */

const BASE = process.env.BINANCE_API_URL?.trim() || "https://api.binance.com";
const MODELO =
  process.env.BINANCE_IA_MODELO?.trim() || process.env.AGENTE_IA_MODELO?.trim() || "claude-sonnet-5-5";
// Venezuela no tiene horario de verano: la semana va de lunes a domingo en UTC-4.
const OFFSET_CARACAS_MS = 4 * 3600_000;
const DIA_MS = 86400_000;
// Un comprobante cuyo ID se leyo mal se acepta si hay un solo pago del mismo
// monto y moneda a esta distancia de la hora del comprobante.
const MARGEN_POR_HORA_MS = 15 * 60_000;
// El estado de cuenta y el comprobante muestran la misma hora del pago.
const MARGEN_ESTADO_MS = 2 * 60_000;
// Mediodia del lunes: donde queda un comprobante sin fecha que Binance no encontro.
const MEDIODIA_MS = 12 * 3600_000;

export class BinanceNoConfigurado extends Error {
  constructor() {
    super("Falta configurar BINANCE_API_KEY y BINANCE_API_SECRET en el servidor");
  }
}

export type PagoBinance = {
  id: string;
  fecha: string; // ISO UTC
  monto: number; // positivo = recibido
  moneda: string;
  tipo: string;
  pagador: string;
};

export type EstadoComprobante =
  | "conciliado"
  | "manual"
  | "monto_distinto"
  | "por_monto_hora"
  | "no_encontrado"
  | "sin_verificar";

/** De donde salieron los pagos de la semana. */
export type OrigenPagos = "estado" | "api";

export type Comprobante = {
  id: number;
  orderId: string;
  monto: number;
  moneda: string;
  fecha: string; // ISO UTC
  /** El comprobante no traia fecha: se guardo en la semana elegida al subirlo. */
  fechaEstimada: boolean;
  /** Sin hora, pero con el dia: la fecha salio del nombre del archivo (1-02-10-2026.jpg). */
  soloDia: boolean;
  /** Movimiento del estado de cuenta que se le asigno a mano, o null. */
  movimientoId: number | null;
  archivoNombre: string;
  subidoPor: string;
  subidoEl: string;
  estado: EstadoComprobante;
  binance: PagoBinance | null;
  /** Su monto sale mas de una vez en los pagos de la semana: se puede amarrar a mano. */
  montoRepetido?: boolean;
};

// ---------- Binance ----------

/** GET por un proxy HTTP con CONNECT: el TLS va de punta a punta con Binance. */
function getPorProxy(
  destino: URL,
  headers: Record<string, string>,
  proxyUrl: string,
): Promise<{ status: number; texto: string }> {
  const proxy = new URL(proxyUrl);
  const auth = proxy.username
    ? {
        "Proxy-Authorization": `Basic ${Buffer.from(
          `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`,
        ).toString("base64")}`,
      }
    : {};
  return new Promise((resolve, reject) => {
    const tunel = http.request({
      host: proxy.hostname,
      port: Number(proxy.port) || 80,
      method: "CONNECT",
      path: `${destino.hostname}:443`,
      headers: { host: `${destino.hostname}:443`, ...auth },
      timeout: 20_000,
    });
    tunel.on("connect", (res, socket) => {
      if (res.statusCode !== 200) {
        socket.destroy();
        return reject(new Error(`El proxy de Binance respondió ${res.statusCode}`));
      }
      const req = https.request(
        {
          host: destino.hostname,
          path: destino.pathname + destino.search,
          method: "GET",
          headers,
          agent: false,
          createConnection: () => tls.connect({ socket, servername: destino.hostname }),
          timeout: 20_000,
        },
        (r) => {
          let texto = "";
          r.setEncoding("utf8");
          r.on("data", (c) => (texto += c));
          r.on("end", () => resolve({ status: r.statusCode || 0, texto }));
        },
      );
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error("Binance no respondió a tiempo")));
      req.end();
    });
    tunel.on("error", (e) => reject(new Error(`No se pudo conectar al proxy de Binance: ${e.message}`)));
    tunel.on("timeout", () => tunel.destroy(new Error("El proxy de Binance no respondió")));
    tunel.end();
  });
}

async function firmado(path: string, params: Record<string, string>): Promise<any> {
  const key = process.env.BINANCE_API_KEY?.trim();
  const secret = process.env.BINANCE_API_SECRET?.trim();
  if (!key || !secret) throw new BinanceNoConfigurado();
  const qs = new URLSearchParams({ ...params, recvWindow: "10000", timestamp: String(Date.now()) }).toString();
  const firma = crypto.createHmac("sha256", secret).update(qs).digest("hex");
  const url = `${BASE}${path}?${qs}&signature=${firma}`;
  const headers = { "X-MBX-APIKEY": key };
  const proxy = process.env.BINANCE_PROXY_URL?.trim();
  const { status, texto } = proxy
    ? await getPorProxy(new URL(url), headers, proxy)
    : await fetch(url, { headers, cache: "no-store" }).then(async (r) => ({ status: r.status, texto: await r.text() }));
  let json: any = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  if (status === 451) {
    throw new Error(
      proxy
        ? "Binance bloquea el país por donde sale el proxy (451): elige un servidor de la VPN en otro país"
        : "Binance bloquea el país del servidor (451): falta configurar BINANCE_PROXY_URL",
    );
  }
  if (status < 200 || status >= 300 || (json?.code && json.code !== "000000")) {
    throw new Error(`Binance respondió ${status}: ${json?.msg || json?.message || "sin detalle"}`);
  }
  return json;
}

/**
 * Pagos de Binance Pay en el rango (ms). La API devuelve 100 como maximo y no
 * pagina: si llega llena, se parte el rango en dos.
 */
async function pagosEnRango(desde: number, hasta: number): Promise<any[]> {
  const json = await firmado("/sapi/v1/pay/transactions", {
    startTime: String(desde),
    endTime: String(hasta),
    limit: "100",
  });
  const data: any[] = Array.isArray(json?.data) ? json.data : [];
  if (data.length < 100 || hasta - desde < 1000) return data;
  const medio = Math.floor((desde + hasta) / 2);
  return [...(await pagosEnRango(desde, medio)), ...(await pagosEnRango(medio + 1, hasta))];
}

// Cada consulta pesa 3000 de los 180000 por minuto de la cuenta: al subir una
// semana de comprobantes la pantalla recarga varias veces seguidas.
const cache = new Map<string, { hasta: number; pagos: PagoBinance[] }>();

/** Pagos recibidos (monto positivo) en el rango, de mas viejo a mas nuevo. */
export async function pagosRecibidos(desde: number, hasta: number): Promise<PagoBinance[]> {
  const llave = `${desde}-${hasta}`;
  const guardado = cache.get(llave);
  if (guardado && guardado.hasta > Date.now()) return guardado.pagos;
  const vistos = new Map<string, PagoBinance>();
  for (const t of await pagosEnRango(desde, hasta)) {
    const monto = Number(t?.amount);
    if (!(monto > 0) || !t?.transactionId) continue;
    vistos.set(String(t.transactionId), {
      id: String(t.transactionId),
      fecha: new Date(Number(t.transactionTime)).toISOString(),
      monto,
      moneda: String(t.currency || "").toUpperCase(),
      tipo: String(t.orderType || ""),
      pagador: String(t.payerInfo?.name || t.payerInfo?.binanceId || ""),
    });
  }
  const pagos = [...vistos.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
  cache.set(llave, { hasta: Date.now() + 60_000, pagos });
  return pagos;
}

// ---------- Tabla ----------

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS binance_comprobantes (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(40) NOT NULL,
      monto DECIMAL(20,8) NOT NULL,
      moneda VARCHAR(12) NOT NULL,
      fecha_pago DATETIME NOT NULL,
      archivo_nombre VARCHAR(200) NOT NULL DEFAULT '',
      archivo_mime VARCHAR(60) NOT NULL,
      archivo LONGBLOB NOT NULL,
      subido_por VARCHAR(190) NOT NULL DEFAULT '',
      company_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_order (order_id),
      INDEX (fecha_pago)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  try {
    await query("ALTER TABLE binance_comprobantes ADD COLUMN fecha_estimada TINYINT(1) NOT NULL DEFAULT 0");
  } catch (e: any) {
    if (e?.code !== "ER_DUP_FIELDNAME") throw e;
  }
  try {
    // El pago del estado de cuenta que Administracion le asigno a mano.
    await query("ALTER TABLE binance_comprobantes ADD COLUMN movimiento_id INT NULL");
  } catch (e: any) {
    if (e?.code !== "ER_DUP_FIELDNAME") throw e;
  }
  tablaLista = true;
}

/** Lunes 00:00 (Caracas) de la semana `lunes` (YYYY-MM-DD), en ms UTC. */
export function rangoSemana(lunes: string): { desde: number; hasta: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(lunes);
  if (!m) return null;
  const desde = Date.UTC(+m[1], +m[2] - 1, +m[3]) + OFFSET_CARACAS_MS;
  if (new Date(desde - OFFSET_CARACAS_MS).getUTCDay() !== 1) return null;
  return { desde, hasta: desde + 7 * DIA_MS - 1 };
}

const aMysql = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace("T", " ");
type BaseComprobante = Omit<Comprobante, "estado" | "binance">;

/** Dia (YYYY-MM-DD) en hora de Caracas de una fecha ISO. */
const diaCaracas = (iso: string) => new Date(Date.parse(iso) - OFFSET_CARACAS_MS).toISOString().slice(0, 10);

const mismoMonto = (p: PagoBinance, c: BaseComprobante) =>
  p.moneda === c.moneda.toUpperCase() && Math.abs(p.monto - c.monto) < 1e-6;

/**
 * Cruza comprobantes con pagos. Con la API manda el ID de orden; con el estado
 * de cuenta (sin ID) manda monto + moneda + hora: el pago mas cercano dentro del
 * margen. Un comprobante sin hora solo se acepta si su monto sale una sola vez
 * (en su dia, o en la semana si tampoco trae dia); con la API queda para revisar.
 */
export function cruzar(bases: BaseComprobante[], pagos: PagoBinance[], origen: OrigenPagos) {
  const porId = new Map(pagos.map((p) => [p.id, p]));
  const usados = new Set<string>(origen === "api" ? bases.map((b) => b.orderId).filter((id) => porId.has(id)) : []);
  const margen = origen === "estado" ? MARGEN_ESTADO_MS : MARGEN_POR_HORA_MS;
  // Primero los que tienen hora: no deben perder su pago contra uno sin fecha.
  const orden = [...bases.keys()].sort((a, b) => Number(bases[a].fechaEstimada) - Number(bases[b].fechaEstimada));
  const salida: Comprobante[] = new Array(bases.length);
  // Lo que Administracion amarro a mano va antes que todo y no se discute.
  bases.forEach((base, i) => {
    const pago = origen === "estado" && base.movimientoId ? porId.get(`e${base.movimientoId}`) : undefined;
    if (!pago || usados.has(pago.id)) return;
    usados.add(pago.id);
    salida[i] = { ...base, fecha: base.fechaEstimada ? pago.fecha : base.fecha, estado: "manual", binance: pago };
  });
  for (const i of orden) {
    if (salida[i]) continue;
    const base = bases[i];
    const exacto = origen === "api" ? porId.get(base.orderId) : undefined;
    if (exacto) {
      const fecha = base.fechaEstimada ? exacto.fecha : base.fecha;
      salida[i] = { ...base, fecha, estado: mismoMonto(exacto, base) ? "conciliado" : "monto_distinto", binance: exacto };
      continue;
    }
    const libres = pagos.filter((p) => !usados.has(p.id) && mismoMonto(p, base));
    let pago: PagoBinance | null = null;
    if (base.fechaEstimada) {
      // Con el dia del nombre del archivo solo cuentan los pagos de ese dia. Si
      // el monto se repite (aunque otro comprobante ya tenga uno) no se adivina:
      // se amarra a mano.
      const delDia = (p: PagoBinance) => !base.soloDia || diaCaracas(p.fecha) === diaCaracas(base.fecha);
      const iguales = pagos.filter((p) => mismoMonto(p, base) && delDia(p));
      pago = iguales.length === 1 && !usados.has(iguales[0].id) ? iguales[0] : null;
    } else {
      const t = Date.parse(base.fecha);
      const dt = (p: PagoBinance) => Math.abs(Date.parse(p.fecha) - t);
      pago = libres.filter((p) => dt(p) <= margen).sort((a, b) => dt(a) - dt(b))[0] || null;
    }
    if (!pago) {
      salida[i] = { ...base, estado: "no_encontrado", binance: null };
      continue;
    }
    usados.add(pago.id);
    // En el estado de cuenta la hora (o el monto unico, si no hay hora) es la
    // unica prueba: si coincide, esta conciliado.
    const estado = origen === "estado" ? "conciliado" : "por_monto_hora";
    salida[i] = { ...base, fecha: base.fechaEstimada ? pago.fecha : base.fecha, estado, binance: pago };
  }
  return { comprobantes: salida, usados };
}

/**
 * El estado de cuenta muestra la hora sin zona. Se guarda como hora de Caracas,
 * pero si se bajo con la hora en UTC los comprobantes calzan 4 h despues: se usa
 * la lectura que concilia mas comprobantes.
 */
function ajustarZona(bases: BaseComprobante[], pagos: PagoBinance[]) {
  const comoUtc = pagos.map((p) => ({ ...p, fecha: new Date(Date.parse(p.fecha) - OFFSET_CARACAS_MS).toISOString() }));
  const conciliados = (lista: PagoBinance[]) =>
    cruzar(bases, lista, "estado").comprobantes.filter((c) => c.estado === "conciliado").length;
  return conciliados(comoUtc) > conciliados(pagos) ? comoUtc : pagos;
}

/**
 * Comprobantes de la semana cruzados con Binance, y los pagos que entraron en
 * la semana sin comprobante. Los pagos salen del estado de cuenta si la semana
 * tiene uno; si no, de la API. Si la API falla, los comprobantes salen
 * `sin_verificar` con el error.
 *
 * La tabla de comprobantes es una sola para las tres sedes (la cuenta de Binance
 * es una), pero cada sede solo ve los suyos (`sede`; null = todas, SuperAdmin).
 * El cruce se hace con los de todas: un pago que ya tomo el comprobante de otra
 * sede no sale como "sin comprobante" ni se le ofrece a esta.
 */
export async function conciliacionSemana(lunes: string, sede: number | null) {
  const rango = rangoSemana(lunes);
  if (!rango) throw new Error("Semana inválida");
  await ensureTabla();
  const { rows } = await query(
    // DATE_FORMAT: la columna guarda UTC y asi no depende de la zona del proceso.
    `SELECT id, order_id, monto, moneda, DATE_FORMAT(fecha_pago, '%Y-%m-%dT%H:%i:%sZ') AS fecha,
            fecha_estimada, movimiento_id, archivo_nombre, subido_por, created_at, company_id
       FROM binance_comprobantes WHERE fecha_pago BETWEEN ? AND ? ORDER BY fecha_pago`,
    [aMysql(rango.desde), aMysql(rango.hasta)],
  );
  const bases: BaseComprobante[] = rows.map((r: any) => ({
    id: r.id,
    orderId: String(r.order_id),
    monto: Number(r.monto),
    moneda: String(r.moneda),
    fecha: r.fecha,
    // 0 = hora del comprobante, 1 = semana elegida, 2 = dia del nombre del archivo.
    fechaEstimada: Number(r.fecha_estimada) > 0,
    soloDia: Number(r.fecha_estimada) === 2,
    movimientoId: r.movimiento_id ?? null,
    archivoNombre: r.archivo_nombre,
    subidoPor: r.subido_por,
    subidoEl: new Date(r.created_at).toISOString(),
  }));
  const propios = new Set<number>(
    rows.filter((r: any) => sede === null || Number(r.company_id) === sede).map((r: any) => r.id),
  );
  const deLaSede = (c: Comprobante) => propios.has(c.id);

  // Un dia de margen: la hora del comprobante puede no ser exacta.
  const desde = rango.desde - DIA_MS;
  const hasta = Math.min(rango.hasta + DIA_MS, Date.now());
  let pagos = await movimientosEnRango(desde, hasta);
  let origen: OrigenPagos = "estado";
  if (pagos.length) {
    pagos = ajustarZona(bases, pagos);
  } else {
    origen = "api";
    try {
      pagos = await pagosRecibidos(desde, hasta);
    } catch (e: any) {
      return {
        comprobantes: bases.map((b): Comprobante => ({ ...b, estado: "sin_verificar", binance: null })).filter(deLaSede),
        sinComprobante: [] as PagoBinance[],
        errorBinance: (e?.message as string) || "No se pudo consultar Binance",
        origen,
        movimientos: 0,
      };
    }
  }

  const { comprobantes, usados } = cruzar(bases, pagos, origen);
  const enSemana = (p: PagoBinance) => {
    const t = Date.parse(p.fecha);
    return t >= rango.desde && t <= rango.hasta;
  };
  const sinComprobante = pagos.filter((p) => !usados.has(p.id) && enSemana(p));
  const deLaSemana = pagos.filter(enSemana);
  const visibles = comprobantes.filter(deLaSede).map((c) => ({
    ...c,
    montoRepetido: deLaSemana.filter((p) => mismoMonto(p, c)).length > 1,
  }));
  return { comprobantes: visibles, sinComprobante, errorBinance: null, origen, movimientos: deLaSemana.length };
}

// ---------- Estado de cuenta ----------

let tablaMovimientosLista = false;
async function ensureTablaMovimientos() {
  if (tablaMovimientosLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS binance_movimientos (
      id INT AUTO_INCREMENT PRIMARY KEY,
      fecha DATETIME NOT NULL,
      contraparte VARCHAR(120) NOT NULL DEFAULT '',
      monto DECIMAL(20,8) NOT NULL,
      moneda VARCHAR(12) NOT NULL,
      subido_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_mov (fecha, monto, moneda, contraparte),
      INDEX (fecha)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // La captura subida, para recortar la linea de cada pago en el Excel.
  await db.execute(`
    CREATE TABLE IF NOT EXISTS binance_estados (
      id INT AUTO_INCREMENT PRIMARY KEY,
      archivo_nombre VARCHAR(200) NOT NULL DEFAULT '',
      archivo LONGBLOB NOT NULL,
      subido_por VARCHAR(190) NOT NULL DEFAULT '',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // De que captura salio cada pago y entre que pixeles esta su linea.
  for (const col of ["estado_id INT NULL", "y0 INT NULL", "y1 INT NULL"]) {
    try {
      await query(`ALTER TABLE binance_movimientos ADD COLUMN ${col}`);
    } catch (e: any) {
      if (e?.code !== "ER_DUP_FIELDNAME") throw e;
    }
  }
  tablaMovimientosLista = true;
}

async function movimientosEnRango(desde: number, hasta: number): Promise<PagoBinance[]> {
  await ensureTablaMovimientos();
  const { rows } = await query(
    `SELECT id, DATE_FORMAT(fecha, '%Y-%m-%dT%H:%i:%sZ') AS fecha, contraparte, monto, moneda
       FROM binance_movimientos WHERE fecha BETWEEN ? AND ? ORDER BY fecha`,
    [aMysql(desde), aMysql(hasta)],
  );
  return rows.map((r: any) => ({
    id: `e${r.id}`,
    fecha: r.fecha,
    monto: Number(r.monto),
    moneda: String(r.moneda),
    tipo: "Estado de cuenta",
    pagador: r.contraparte,
  }));
}

type Region = { y0: number; y1: number };

export type Movimiento = {
  fechaMs: number;
  contraparte: string;
  monto: number;
  moneda: string;
  /** Donde esta su linea en la captura (null: PDF o no se ubico). */
  linea: Region | null;
};

/**
 * Guarda los movimientos y la captura de donde salieron. Los repetidos (misma
 * hora, monto, moneda y quien) no se duplican, pero toman el recorte si no
 * tenian uno (lo subido antes de guardar capturas).
 */
export async function guardarMovimientos(
  movs: Movimiento[],
  email: string,
  captura: { datos: Buffer; nombre: string } | null,
) {
  await ensureTablaMovimientos();
  let estadoId: number | null = null;
  if (captura && movs.some((m) => m.linea)) {
    // db.execute y no query(): la auditoria guardaria la imagen entera en sql_params.
    const [res]: any = await db.execute(
      "INSERT INTO binance_estados (archivo_nombre, archivo, subido_por) VALUES (?,?,?)",
      [captura.nombre.slice(0, 200), captura.datos, email],
    );
    estadoId = res.insertId;
  }
  let nuevos = 0;
  for (const m of movs) {
    const conLinea = estadoId !== null && m.linea;
    const { rows } = await query(
      // y0/y1 van antes que estado_id: MySQL asigna de izquierda a derecha. Las
      // columnas van con la tabla delante: el alias `nuevo` tiene las mismas y
      // sin eso MySQL responde "Column 'estado_id' in field list is ambiguous".
      `INSERT INTO binance_movimientos (fecha, contraparte, monto, moneda, subido_por, estado_id, y0, y1)
         VALUES (?,?,?,?,?,?,?,?) AS nuevo
       ON DUPLICATE KEY UPDATE
         binance_movimientos.y0 = IF(binance_movimientos.estado_id IS NULL, nuevo.y0, binance_movimientos.y0),
         binance_movimientos.y1 = IF(binance_movimientos.estado_id IS NULL, nuevo.y1, binance_movimientos.y1),
         binance_movimientos.estado_id = COALESCE(binance_movimientos.estado_id, nuevo.estado_id)`,
      [
        aMysql(m.fechaMs),
        m.contraparte.slice(0, 120),
        m.monto,
        m.moneda,
        email,
        conLinea ? estadoId : null,
        conLinea ? m.linea!.y0 : null,
        conLinea ? m.linea!.y1 : null,
      ],
    );
    // 1 = fila nueva; 2 = ya estaba y tomo el recorte; 0 = ya estaba igual.
    if (Number((rows as any)?.affectedRows) === 1) nuevos++;
  }
  return { nuevos, repetidos: movs.length - nuevos };
}

/** Recorte de la linea de cada movimiento en su captura, en JPEG, por id de movimiento. */
export async function recortesDeMovimientos(ids: number[]) {
  const salida = new Map<number, { datos: Buffer; ancho: number; alto: number }>();
  if (!ids.length) return salida;
  await ensureTablaMovimientos();
  const sharp = (await import("sharp")).default;
  const { rows } = await query(
    `SELECT id, estado_id, y0, y1 FROM binance_movimientos
      WHERE estado_id IS NOT NULL AND id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const capturas = new Map<number, Buffer | null>();
  for (const r of rows as any[]) {
    if (!capturas.has(r.estado_id)) {
      const [c]: any = await db.execute("SELECT archivo FROM binance_estados WHERE id = ?", [r.estado_id]);
      capturas.set(r.estado_id, c[0]?.archivo || null);
    }
    const captura = capturas.get(r.estado_id);
    if (!captura) continue;
    try {
      const { width = 0, height = 0 } = await sharp(captura).metadata();
      const y0 = Math.max(0, r.y0);
      const alto = Math.min(height, r.y1) - y0;
      if (alto <= 0) continue;
      const img = sharp(captura).extract({ left: 0, top: y0, width, height: alto }).resize({ width: Math.min(width, 700) });
      const datos = await img.jpeg({ quality: 85 }).toBuffer();
      const meta = await sharp(datos).metadata();
      salida.set(r.id, { datos, ancho: meta.width || 0, alto: meta.height || 0 });
    } catch (e: any) {
      console.error("[binance] recorte", r.id, e?.message);
    }
  }
  return salida;
}

/** Miniatura de cada comprobante en JPEG (los PDF no tienen), por id de comprobante. */
export async function miniaturasDeComprobantes(ids: number[]) {
  const salida = new Map<number, { datos: Buffer; ancho: number; alto: number }>();
  if (!ids.length) return salida;
  await ensureTabla();
  const sharp = (await import("sharp")).default;
  const [rows]: any = await db.execute(
    `SELECT id, archivo, archivo_mime FROM binance_comprobantes WHERE id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const r of rows) {
    if (r.archivo_mime === "application/pdf") continue;
    try {
      const datos = await sharp(r.archivo).resize({ width: 220, height: 260, fit: "inside" }).jpeg({ quality: 80 }).toBuffer();
      const meta = await sharp(datos).metadata();
      salida.set(r.id, { datos, ancho: meta.width || 0, alto: meta.height || 0 });
    } catch (e: any) {
      console.error("[binance] miniatura", r.id, e?.message);
    }
  }
  return salida;
}

/** Borra el estado de cuenta de la semana, para volver a subirlo. */
export async function borrarMovimientosSemana(lunes: string) {
  const rango = rangoSemana(lunes);
  if (!rango) throw new Error("Semana inválida");
  await ensureTablaMovimientos();
  await query("DELETE FROM binance_movimientos WHERE fecha BETWEEN ? AND ?", [
    aMysql(rango.desde),
    aMysql(rango.hasta),
  ]);
  // Las capturas que ya no tienen ningun pago.
  await query(
    `DELETE FROM binance_estados WHERE id NOT IN
       (SELECT estado_id FROM (SELECT DISTINCT estado_id FROM binance_movimientos WHERE estado_id IS NOT NULL) t)`,
  );
}

// Cada sede solo toca sus comprobantes (sede null = todas, SuperAdmin).
const DE_LA_SEDE = "(? IS NULL OR company_id = ?)";

/**
 * Sede cuyos comprobantes ve el usuario: Administracion la de su `cids`, el
 * SuperAdmin todas (null). undefined = Administracion sin sede valida (403).
 */
export function sedeBinance(payload: { role?: unknown; cids?: unknown } | null | undefined) {
  if (!esRolAdministracion(payload?.role)) return null;
  return sedeDelToken(payload) ?? undefined;
}

export const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

export async function imagenComprobante(id: number, sede: number | null) {
  await ensureTabla();
  const [rows]: any = await db.execute(
    `SELECT archivo, archivo_mime, archivo_nombre FROM binance_comprobantes WHERE id = ? AND ${DE_LA_SEDE}`,
    [id, sede, sede],
  );
  return rows[0] || null;
}

/**
 * Amarra a mano un comprobante con un movimiento del estado de cuenta (null =
 * soltarlo). Sirve cuando el comprobante no trae fecha y el monto se repite.
 */
export async function asignarMovimiento(id: number, movimientoId: number | null, sede: number | null) {
  await ensureTabla();
  const { rows: propio } = await query(`SELECT id FROM binance_comprobantes WHERE id = ? AND ${DE_LA_SEDE}`, [
    id,
    sede,
    sede,
  ]);
  if (!propio.length) throw new ArchivoIlegible("Ese comprobante no existe");
  if (movimientoId !== null) {
    await ensureTablaMovimientos();
    const { rows } = await query("SELECT id FROM binance_movimientos WHERE id = ?", [movimientoId]);
    if (!rows.length) throw new ArchivoIlegible("Ese pago ya no está en el estado de cuenta");
    // Solo se cambia de pago cuando el monto del comprobante se repite en el
    // estado de cuenta de esa semana (lunes a domingo, hora de Caracas): si es
    // unico, el cruce ya lo amarro y otro monto no es ese pago.
    const { rows: iguales } = await query(
      `SELECT COUNT(*) AS n
         FROM binance_comprobantes c
         JOIN binance_movimientos m ON m.id = ? AND m.monto = c.monto AND m.moneda = c.moneda
         JOIN binance_movimientos o ON o.monto = m.monto AND o.moneda = m.moneda
          AND YEARWEEK(o.fecha - INTERVAL 4 HOUR, 3) = YEARWEEK(m.fecha - INTERVAL 4 HOUR, 3)
        WHERE c.id = ?`,
      [movimientoId, id],
    );
    if (Number(iguales[0]?.n || 0) < 2) {
      throw new ArchivoIlegible("Solo se puede amarrar a otro pago del mismo monto cuando ese monto se repite en el estado de cuenta");
    }
  }
  await query("UPDATE binance_comprobantes SET movimiento_id = ? WHERE id = ?", [movimientoId, id]);
}

export async function eliminarComprobante(id: number, sede: number | null) {
  await ensureTabla();
  await query(`DELETE FROM binance_comprobantes WHERE id = ? AND ${DE_LA_SEDE}`, [id, sede, sede]);
}

// ---------- Lectura del comprobante ----------

const INSTRUCCIONES =
  "Te dan la captura o el PDF de un comprobante de pago de Binance Pay (pantalla 'Pago exitoso' de la app). " +
  "Muchas veces viene recortada (sin el titulo, la fecha ni el boton): si trae un ID de orden y un monto, es un comprobante. " +
  "Devuelve SOLO lo que esta en la imagen, sin inventar. " +
  "order_id: el 'ID de orden' / 'Order ID' completo, solo digitos; copia cada digito con cuidado, es lo que se usa para conciliar. " +
  "Normalmente tiene 18 digitos: si cuentas menos, vuelve a leerlo, sobre todo donde hay digitos repetidos seguidos (777, 000). " +
  "monto: el monto pagado, sin signo ni separador de miles. moneda: el codigo (USDT, USDC, BTC...). " +
  "fecha: fecha y hora del pago como 'YYYY-MM-DD HH:MM:SS'; fecha_en_utc = true si el comprobante dice UTC. " +
  "Si la captura no muestra la fecha, fecha = '' (no la inventes). " +
  "Si la imagen no es un comprobante de pago de Binance, es_comprobante = false y lo demas vacio o 0.";

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["es_comprobante", "order_id", "monto", "moneda", "fecha", "fecha_en_utc"],
  properties: {
    es_comprobante: { type: "boolean" },
    order_id: { type: "string" },
    monto: { type: "number" },
    moneda: { type: "string" },
    fecha: { type: "string" },
    fecha_en_utc: { type: "boolean" },
  },
} as const;

let cliente: Anthropic | null = null;
const WORKSPACE = process.env.ANTHROPIC_WORKSPACE_ID?.trim();
const anthropic = () =>
  (cliente ??= new Anthropic(WORKSPACE ? { defaultHeaders: { "anthropic-workspace-id": WORKSPACE } } : {}));
let clienteOpenAI: OpenAI | null = null;
const openai = () => (clienteOpenAI ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY }));
// El mismo modelo de vision que usa el resto del panel.
const MODELO_OPENAI = process.env.OPENAI_VISION_MODEL?.trim() || "gpt-4o";

/** Hay con que leer: OpenAI (el que se usa si esta) o Claude. */
export const hayIA = () => !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

type Archivo = { mime: string; data: string };

function bloqueArchivo(datos: Buffer, mime: string): Archivo {
  return { mime, data: datos.toString("base64") };
}

/**
 * Pide a la IA que lea los archivos y devuelva JSON con `esquema`. Usa OpenAI
 * si hay OPENAI_API_KEY y si no Claude. null = la respuesta no era JSON.
 */
async function leerConIA(
  sistema: string,
  esquema: object,
  archivos: Archivo[],
  pedido: string,
  maxTokens: number,
): Promise<any> {
  let texto = "";
  if (process.env.OPENAI_API_KEY) {
    const r = await openai().chat.completions.create({
      model: MODELO_OPENAI,
      max_tokens: maxTokens,
      response_format: { type: "json_schema", json_schema: { name: "lectura", strict: true, schema: esquema as any } },
      messages: [
        { role: "system", content: sistema },
        {
          role: "user",
          content: [
            ...archivos.map((a): OpenAI.Chat.ChatCompletionContentPart =>
              a.mime === "application/pdf"
                ? { type: "file", file: { filename: "archivo.pdf", file_data: `data:application/pdf;base64,${a.data}` } }
                : { type: "image_url", image_url: { url: `data:${a.mime};base64,${a.data}`, detail: "high" } },
            ),
            { type: "text", text: pedido },
          ],
        },
      ],
    });
    texto = r.choices[0]?.message?.content || "";
  } else {
    const r = await anthropic().messages.create({
      model: MODELO,
      max_tokens: maxTokens,
      system: sistema,
      output_config: { format: { type: "json_schema", schema: esquema as any }, effort: "low" },
      messages: [
        {
          role: "user",
          content: [
            ...archivos.map((a): Anthropic.ContentBlockParam =>
              a.mime === "application/pdf"
                ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.data } }
                : { type: "image", source: { type: "base64", media_type: a.mime as "image/jpeg", data: a.data } },
            ),
            { type: "text", text: pedido },
          ],
        },
      ],
    });
    texto = r.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  }
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

/** fechaMs null = la captura no trae la fecha. */
export type Leido = { orderId: string; monto: number; moneda: string; fechaMs: number | null };

/**
 * Lee el comprobante. Si no salen ID de orden, monto y moneda lanza
 * `ArchivoIlegible` diciendo que se leyo, para que quien sube sepa por que.
 */
export async function leerComprobante(datos: Buffer, mime: string): Promise<Leido> {
  const l = await leerConIA(INSTRUCCIONES, ESQUEMA, [await ampliar(datos, mime)], "Lee este comprobante.", 1000);
  const orderId = String(l?.order_id || "").replace(/\D/g, "");
  const monto = Number(l?.monto);
  const moneda = String(l?.moneda || "").trim().toUpperCase().slice(0, 12);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(l?.fecha || ""));
  // es_comprobante no manda: una captura recortada con ID y monto sirve igual.
  if (!/^\d{6,40}$/.test(orderId) || !(monto > 0) || !moneda) {
    throw new ArchivoIlegible(
      `No se leyó un comprobante de Binance Pay (ID de orden: "${orderId || "—"}", monto: ${monto > 0 ? monto : "—"} ${moneda || ""})`,
    );
  }
  if (!m) return { orderId, monto, moneda, fechaMs: null };
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // Sin "UTC" en el comprobante se toma la hora de Caracas.
  return { orderId, monto, moneda, fechaMs: l.fecha_en_utc ? local : local + OFFSET_CARACAS_MS };
}

const INSTRUCCIONES_ESTADO =
  "Te dan una captura o PDF del historial de movimientos de Binance Pay (columnas Time/Fecha, Type/Tipo, " +
  "To/From, Amount/Monto, Currency/Moneda, Status/Estado). Devuelve TODAS las filas, sin inventar ni saltar ninguna, " +
  "en el orden en que aparecen, de arriba a abajo (no las ordenes por fecha ni por monto). " +
  "imagen: en que imagen esta la fila (1 = la primera). posicion: a que altura esta el centro de la fila dentro de " +
  "esa imagen, de 0 (borde de arriba) a 1 (borde de abajo). " +
  "fecha: tal cual aparece, como 'YYYY-MM-DD HH:MM:SS'. tipo: el texto de Type (Received, Sent, Recibido...). " +
  "recibido: true solo si es un pago recibido (Received/Recibido, o monto con +). " +
  "contraparte: el To/From tal cual. monto: el valor absoluto, sin signo ni separador de miles (1,841.85 es 1841.85). " +
  "moneda: el codigo (USDT...). completado: true si el estado es Completed/Completado. " +
  "Pueden venir varias imagenes: son pedazos seguidos de la misma lista, con un poco de solape; " +
  "una fila que sale en dos pedazos va una sola vez. " +
  "Si la imagen no es un historial de Binance, devuelve la lista vacia.";

// La IA achica cada imagen (OpenAI deja el lado corto en 768 px; Claude, el
// largo en ~1568): una captura larga del historial quedaria con los montos
// ilegibles. Se parte en franjas bajas que se solapan un poco (la fila
// repetida la descarta el UNIQUE de la tabla).
const ANCHO_MAX = 1500;
const ALTO_FRANJA = 700;
const SOLAPE = 100;
const MAX_FRANJAS = 30;
// El limite de la API por imagen es 5 MB.
const MAX_IMAGEN_BYTES = 4.5 * 1024 * 1024;

type EstadoPreparado = {
  bloques: Archivo[];
  /** La captura como se mando (achicada si era muy ancha); null en un PDF. */
  img: Buffer | null;
  /** Donde empieza y cuanto mide cada franja, en pixeles de `img`. */
  franjas: Region[];
};

async function bloquesEstado(datos: Buffer, mime: string): Promise<EstadoPreparado> {
  if (mime === "application/pdf") return { bloques: [bloqueArchivo(datos, mime)], img: null, franjas: [] };
  const sharp = (await import("sharp")).default;
  const meta = await sharp(datos).metadata();
  const img =
    (meta.width || 0) > ANCHO_MAX ? await sharp(datos).resize({ width: ANCHO_MAX }).png().toBuffer() : datos;
  const { width = 0, height = 0 } = img === datos ? meta : await sharp(img).metadata();
  if (height <= ALTO_FRANJA * 1.2) {
    const bloque =
      img === datos && datos.length <= MAX_IMAGEN_BYTES
        ? bloqueArchivo(datos, mime)
        : bloqueArchivo(await sharp(img).png().toBuffer(), "image/png");
    return { bloques: [bloque], img, franjas: [{ y0: 0, y1: height }] };
  }
  const bloques: Archivo[] = [];
  const franjas: Region[] = [];
  for (let top = 0; top < height; top += ALTO_FRANJA - SOLAPE) {
    if (bloques.length >= MAX_FRANJAS) {
      throw new ArchivoIlegible("La captura es demasiado larga: súbela en varias partes");
    }
    const alto = Math.min(ALTO_FRANJA, height - top);
    const franja = await sharp(img).extract({ left: 0, top, width, height: alto }).png().toBuffer();
    bloques.push(bloqueArchivo(franja, "image/png"));
    franjas.push({ y0: top, y1: top + alto });
    if (top + alto >= height) break;
  }
  return { bloques, img, franjas };
}

/**
 * Las lineas de texto de la captura, de arriba a abajo: bandas horizontales con
 * tinta sobre el color de fondo. Cada una se estira hasta la mitad del hueco con
 * la de al lado, asi el recorte sale con su margen, como la fila en pantalla.
 */
export async function lineasDeTexto(img: Buffer): Promise<Region[]> {
  const sharp = (await import("sharp")).default;
  const { data, info } = await sharp(img).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i++) hist[data[i]]++;
  const fondo = hist.indexOf(Math.max(...hist));
  const bandas: Region[] = [];
  let ini = -1;
  for (let y = 0; y <= height; y++) {
    let n = 0;
    if (y < height) for (let x = 0; x < width; x++) if (Math.abs(data[y * width + x] - fondo) > 60) n++;
    // Poca tinta = texto; tinta en casi todo el ancho = una raya o un bloque.
    const hay = y < height && n / width > 0.002 && n / width < 0.6;
    if (hay && ini < 0) ini = y;
    if (!hay && ini >= 0) {
      const previa = bandas[bandas.length - 1];
      // Un hueco chico es la misma linea (letras con partes separadas).
      if (previa && ini - previa.y1 < 6) previa.y1 = y;
      else bandas.push({ y0: ini, y1: y });
      ini = -1;
    }
  }
  const lineas = bandas.filter((b) => b.y1 - b.y0 >= 6);
  const huecos = lineas.slice(1).map((b, i) => b.y0 - lineas[i].y1).sort((a, b) => a - b);
  const medio = Math.round((huecos[Math.floor(huecos.length / 2)] ?? 40) / 2);
  return lineas.map((b, i) => ({
    y0: i ? Math.round((lineas[i - 1].y1 + b.y0) / 2) : Math.max(0, b.y0 - medio),
    y1: i < lineas.length - 1 ? Math.round((b.y1 + lineas[i + 1].y0) / 2) : Math.min(height, b.y1 + medio),
  }));
}

/**
 * La linea de cada fila leida. Si hay tantas lineas como filas (o una mas: el
 * encabezado) van en orden; si no, la linea donde la IA dijo que estaba la fila.
 */
export function ubicarFilas(
  filas: { imagen: number; posicion: number }[],
  lineas: Region[],
  franjas: Region[],
): (Region | null)[] {
  if (lineas.length === filas.length) return lineas;
  if (lineas.length === filas.length + 1) return lineas.slice(1);
  return filas.map((f) => {
    const franja = franjas[Math.min(Math.max(Math.round(f.imagen) - 1, 0), franjas.length - 1)];
    if (!franja) return null;
    const y = franja.y0 + Math.min(Math.max(Number(f.posicion) || 0, 0), 1) * (franja.y1 - franja.y0);
    return lineas.find((l) => y >= l.y0 && y <= l.y1) || null;
  });
}

// Un recorte de WhatsApp puede venir de 400 px: el ID de 18 digitos queda tan
// chico que la IA se come digitos repetidos (oct-2026: 777 leido como 77).
const ANCHO_MIN_COMPROBANTE = 1200;

async function ampliar(datos: Buffer, mime: string): Promise<Archivo> {
  if (mime === "application/pdf") return bloqueArchivo(datos, mime);
  const sharp = (await import("sharp")).default;
  const { width = 0 } = await sharp(datos).metadata();
  if (!width || width >= ANCHO_MIN_COMPROBANTE) return bloqueArchivo(datos, mime);
  const grande = await sharp(datos).resize({ width: ANCHO_MIN_COMPROBANTE, kernel: "lanczos3" }).png().toBuffer();
  return bloqueArchivo(grande, "image/png");
}

/** Un archivo que no se puede leer: el mensaje se le muestra a quien lo subio. */
export class ArchivoIlegible extends Error {}

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
        required: ["fecha", "tipo", "recibido", "contraparte", "monto", "moneda", "completado", "imagen", "posicion"],
        properties: {
          imagen: { type: "integer" },
          posicion: { type: "number" },
          fecha: { type: "string" },
          tipo: { type: "string" },
          recibido: { type: "boolean" },
          contraparte: { type: "string" },
          monto: { type: "number" },
          moneda: { type: "string" },
          completado: { type: "boolean" },
        },
      },
    },
  },
} as const;

/**
 * Lee el estado de cuenta: solo los pagos recibidos y completados. La hora se
 * toma como de Caracas (`ajustarZona` corrige si venia en UTC).
 */
export async function leerEstadoDeCuenta(
  datos: Buffer,
  mime: string,
): Promise<{ movs: Movimiento[]; leidas: number; captura: Buffer | null }> {
  const prep = await bloquesEstado(datos, mime);
  // 16000: el tope de salida de gpt-4o (unas 250 filas).
  const l = await leerConIA(INSTRUCCIONES_ESTADO, ESQUEMA_ESTADO, prep.bloques, "Lee estos movimientos.", 16000);
  const leidas: any[] = Array.isArray(l?.movimientos) ? l.movimientos : [];
  // Una fila que cae en el solape de dos franjas sale dos veces: va una.
  const vistas = new Set<string>();
  const filas = leidas.filter((f) => {
    const llave = [f?.fecha, f?.tipo, f?.contraparte, f?.monto, f?.moneda].join("|");
    if (vistas.has(llave)) return false;
    vistas.add(llave);
    return true;
  });
  // Todas las filas cuentan para ubicar las lineas, tambien las enviadas.
  const ubicadas = prep.img ? ubicarFilas(filas, await lineasDeTexto(prep.img), prep.franjas) : [];
  const movs: Movimiento[] = [];
  filas.forEach((f, i) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(f?.fecha || ""));
    const monto = Math.abs(Number(f?.monto));
    const moneda = String(f?.moneda || "").trim().toUpperCase().slice(0, 12);
    if (!m || !f?.recibido || !f?.completado || !(monto > 0) || !moneda) return;
    const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    movs.push({
      fechaMs: local + OFFSET_CARACAS_MS,
      contraparte: String(f?.contraparte || "").trim(),
      monto,
      moneda,
      linea: ubicadas[i] || null,
    });
  });
  const sharp = (await import("sharp")).default;
  const captura = prep.img ? await sharp(prep.img).jpeg({ quality: 90 }).toBuffer() : null;
  return { movs, leidas: leidas.length, captura };
}

/**
 * Fecha de un comprobante que no la trae: la del pago en Binance si esta en la
 * semana elegida; si no, el lunes de esa semana, marcada como estimada.
 */
export async function fechaSinComprobante(orderId: string, lunes: string) {
  const rango = rangoSemana(lunes);
  if (!rango) return null;
  try {
    const pagos = await pagosRecibidos(rango.desde - DIA_MS, Math.min(rango.hasta + DIA_MS, Date.now()));
    const pago = pagos.find((p) => p.id === orderId);
    if (pago) return { fechaMs: Date.parse(pago.fecha), estimada: false };
  } catch {
    // Binance no responde: queda en la semana elegida.
  }
  return { fechaMs: rango.desde + MEDIODIA_MS, estimada: true };
}

/**
 * Dia del pago escrito en el nombre del archivo, para los comprobantes que no
 * traen fecha. Administracion los nombra con un numero de secuencia delante:
 * "1-02-10-2026.jpg", "2_02.10.2026.png", "3-20261002.jpeg". Solo vale si el
 * nombre empieza con ese numero: "WhatsApp Image 2026-10-22..." es cuando se
 * guardo la imagen, no cuando se pago. Dos cifras antes del año = dia-mes.
 * Devuelve el mediodia de Caracas de ese dia, o null.
 */
export function fechaDelNombre(nombre: string): number | null {
  const m = /^\s*\d+\s*[-_.\s]\s*(.+)$/.exec(nombre.replace(/\.[a-z0-9]{2,5}$/i, ""));
  if (!m) return null;
  const t = m[1];
  const candidatos: [string, string, string][] = [];
  let r: RegExpExecArray | null;
  if ((r = /^(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/.exec(t))) candidatos.push([r[1], r[2], r[3]]);
  else if ((r = /^(\d{1,2})[-_.](\d{1,2})[-_.](\d{4}|\d{2})(?!\d)/.exec(t))) candidatos.push([r[3], r[2], r[1]]);
  else if ((r = /^(\d{8})(?!\d)/.exec(t))) {
    const s = r[1];
    candidatos.push([s.slice(0, 4), s.slice(4, 6), s.slice(6, 8)]); // 20261002
    candidatos.push([s.slice(4, 8), s.slice(2, 4), s.slice(0, 2)]); // 02102026
  }
  for (const [ys, ms, ds] of candidatos) {
    const y = ys.length === 2 ? 2000 + Number(ys) : Number(ys);
    const mes = Number(ms);
    const dia = Number(ds);
    const f = new Date(Date.UTC(y, mes - 1, dia));
    if (y < 2020 || y > 2100 || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) continue;
    return Date.UTC(y, mes - 1, dia) + OFFSET_CARACAS_MS + MEDIODIA_MS;
  }
  return null;
}

/** Guarda el comprobante. Devuelve el que ya estaba si el ID de orden se repite. */
export async function guardarComprobante(
  leido: Leido & { fechaMs: number; estimada: boolean; soloDia?: boolean },
  archivo: { nombre: string; mime: string; datos: Buffer },
  usuario: { email: string; cids: number | null },
): Promise<{ id: number } | { repetido: { fecha: string; subidoPor: string; companyId: number | null } }> {
  await ensureTabla();
  try {
    // db.execute y no query(): la auditoria guardaria la imagen entera en sql_params.
    const [res]: any = await db.execute(
      `INSERT INTO binance_comprobantes
         (order_id, monto, moneda, fecha_pago, fecha_estimada, archivo_nombre, archivo_mime, archivo, subido_por, company_id)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
      [
        leido.orderId,
        leido.monto,
        leido.moneda,
        aMysql(leido.fechaMs),
        leido.soloDia ? 2 : leido.estimada ? 1 : 0,
        archivo.nombre.slice(0, 200),
        archivo.mime,
        archivo.datos,
        usuario.email,
        usuario.cids,
      ],
    );
    return { id: res.insertId };
  } catch (e: any) {
    if (e?.code !== "ER_DUP_ENTRY") throw e;
    const [rows]: any = await db.execute(
      "SELECT created_at, subido_por, company_id FROM binance_comprobantes WHERE order_id = ?",
      [leido.orderId],
    );
    return {
      repetido: {
        fecha: new Date(rows[0]?.created_at).toISOString(),
        subidoPor: rows[0]?.subido_por || "",
        companyId: rows[0]?.company_id ?? null,
      },
    };
  }
}
