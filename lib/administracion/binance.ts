import crypto from "crypto";
import http from "http";
import https from "https";
import tls from "tls";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { db, query } from "@/lib/db";

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
  /** Movimiento del estado de cuenta que se le asigno a mano, o null. */
  movimientoId: number | null;
  archivoNombre: string;
  subidoPor: string;
  subidoEl: string;
  estado: EstadoComprobante;
  binance: PagoBinance | null;
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

const mismoMonto = (p: PagoBinance, c: BaseComprobante) =>
  p.moneda === c.moneda.toUpperCase() && Math.abs(p.monto - c.monto) < 1e-6;

/**
 * Cruza comprobantes con pagos. Con la API manda el ID de orden; con el estado
 * de cuenta (sin ID) manda monto + moneda + hora: el pago mas cercano dentro del
 * margen. Un comprobante sin fecha solo se acepta si hay un unico pago libre de
 * ese monto en la semana, y queda para revisar.
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
      pago = libres.length === 1 ? libres[0] : null;
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
    // En el estado de cuenta la hora es la unica prueba: si coincide, esta conciliado.
    const estado = origen === "estado" && !base.fechaEstimada ? "conciliado" : "por_monto_hora";
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
 */
export async function conciliacionSemana(lunes: string) {
  const rango = rangoSemana(lunes);
  if (!rango) throw new Error("Semana inválida");
  await ensureTabla();
  const { rows } = await query(
    // DATE_FORMAT: la columna guarda UTC y asi no depende de la zona del proceso.
    `SELECT id, order_id, monto, moneda, DATE_FORMAT(fecha_pago, '%Y-%m-%dT%H:%i:%sZ') AS fecha,
            fecha_estimada, movimiento_id, archivo_nombre, subido_por, created_at
       FROM binance_comprobantes WHERE fecha_pago BETWEEN ? AND ? ORDER BY fecha_pago`,
    [aMysql(rango.desde), aMysql(rango.hasta)],
  );
  const bases: BaseComprobante[] = rows.map((r: any) => ({
    id: r.id,
    orderId: String(r.order_id),
    monto: Number(r.monto),
    moneda: String(r.moneda),
    fecha: r.fecha,
    fechaEstimada: !!r.fecha_estimada,
    movimientoId: r.movimiento_id ?? null,
    archivoNombre: r.archivo_nombre,
    subidoPor: r.subido_por,
    subidoEl: new Date(r.created_at).toISOString(),
  }));

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
        comprobantes: bases.map((b): Comprobante => ({ ...b, estado: "sin_verificar", binance: null })),
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
  return { comprobantes, sinComprobante, errorBinance: null, origen, movimientos: pagos.filter(enSemana).length };
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

export type Movimiento = { fechaMs: number; contraparte: string; monto: number; moneda: string };

/** Guarda los movimientos; los repetidos (misma hora, monto, moneda y quien) se saltan. */
export async function guardarMovimientos(movs: Movimiento[], email: string) {
  await ensureTablaMovimientos();
  let nuevos = 0;
  for (const m of movs) {
    const { rows } = await query(
      "INSERT IGNORE INTO binance_movimientos (fecha, contraparte, monto, moneda, subido_por) VALUES (?,?,?,?,?)",
      [aMysql(m.fechaMs), m.contraparte.slice(0, 120), m.monto, m.moneda, email],
    );
    nuevos += Number((rows as any)?.affectedRows || 0);
  }
  return { nuevos, repetidos: movs.length - nuevos };
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
}

export async function imagenComprobante(id: number) {
  await ensureTabla();
  const [rows]: any = await db.execute(
    "SELECT archivo, archivo_mime, archivo_nombre FROM binance_comprobantes WHERE id = ?",
    [id],
  );
  return rows[0] || null;
}

/**
 * Amarra a mano un comprobante con un movimiento del estado de cuenta (null =
 * soltarlo). Sirve cuando el comprobante no trae fecha y el monto se repite.
 */
export async function asignarMovimiento(id: number, movimientoId: number | null) {
  await ensureTabla();
  if (movimientoId !== null) {
    await ensureTablaMovimientos();
    const { rows } = await query("SELECT id FROM binance_movimientos WHERE id = ?", [movimientoId]);
    if (!rows.length) throw new ArchivoIlegible("Ese pago ya no está en el estado de cuenta");
  }
  await query("UPDATE binance_comprobantes SET movimiento_id = ? WHERE id = ?", [movimientoId, id]);
}

export async function eliminarComprobante(id: number) {
  await ensureTabla();
  await query("DELETE FROM binance_comprobantes WHERE id = ?", [id]);
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
  "To/From, Amount/Monto, Currency/Moneda, Status/Estado). Devuelve TODAS las filas, sin inventar ni saltar ninguna. " +
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

async function bloquesEstado(datos: Buffer, mime: string): Promise<Archivo[]> {
  if (mime === "application/pdf") return [bloqueArchivo(datos, mime)];
  const sharp = (await import("sharp")).default;
  const meta = await sharp(datos).metadata();
  const img =
    (meta.width || 0) > ANCHO_MAX ? await sharp(datos).resize({ width: ANCHO_MAX }).png().toBuffer() : datos;
  const { width = 0, height = 0 } = img === datos ? meta : await sharp(img).metadata();
  if (height <= ALTO_FRANJA * 1.2) {
    if (img === datos && datos.length <= MAX_IMAGEN_BYTES) return [bloqueArchivo(datos, mime)];
    return [bloqueArchivo(await sharp(img).png().toBuffer(), "image/png")];
  }
  const bloques: Archivo[] = [];
  for (let top = 0; top < height; top += ALTO_FRANJA - SOLAPE) {
    if (bloques.length >= MAX_FRANJAS) {
      throw new ArchivoIlegible("La captura es demasiado larga: súbela en varias partes");
    }
    const alto = Math.min(ALTO_FRANJA, height - top);
    const franja = await sharp(img).extract({ left: 0, top, width, height: alto }).png().toBuffer();
    bloques.push(bloqueArchivo(franja, "image/png"));
    if (top + alto >= height) break;
  }
  return bloques;
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
        required: ["fecha", "tipo", "recibido", "contraparte", "monto", "moneda", "completado"],
        properties: {
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
export async function leerEstadoDeCuenta(datos: Buffer, mime: string): Promise<{ movs: Movimiento[]; leidas: number }> {
  // 16000: el tope de salida de gpt-4o (unas 300 filas).
  const l = await leerConIA(INSTRUCCIONES_ESTADO, ESQUEMA_ESTADO, await bloquesEstado(datos, mime), "Lee estos movimientos.", 16000);
  const filas: any[] = Array.isArray(l?.movimientos) ? l.movimientos : [];
  const movs: Movimiento[] = [];
  for (const f of filas) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(f?.fecha || ""));
    const monto = Math.abs(Number(f?.monto));
    const moneda = String(f?.moneda || "").trim().toUpperCase().slice(0, 12);
    if (!m || !f?.recibido || !f?.completado || !(monto > 0) || !moneda) continue;
    const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    movs.push({ fechaMs: local + OFFSET_CARACAS_MS, contraparte: String(f?.contraparte || "").trim(), monto, moneda });
  }
  return { movs, leidas: filas.length };
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

/** Guarda el comprobante. Devuelve el que ya estaba si el ID de orden se repite. */
export async function guardarComprobante(
  leido: Leido & { fechaMs: number; estimada: boolean },
  archivo: { nombre: string; mime: string; datos: Buffer },
  usuario: { email: string; cids: number | null },
): Promise<{ id: number } | { repetido: { fecha: string; subidoPor: string } }> {
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
        leido.estimada ? 1 : 0,
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
      "SELECT created_at, subido_por FROM binance_comprobantes WHERE order_id = ?",
      [leido.orderId],
    );
    return { repetido: { fecha: new Date(rows[0]?.created_at).toISOString(), subidoPor: rows[0]?.subido_por || "" } };
  }
}
