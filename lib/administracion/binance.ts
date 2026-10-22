import crypto from "crypto";
import http from "http";
import https from "https";
import tls from "tls";
import Anthropic from "@anthropic-ai/sdk";
import { db, query } from "@/lib/db";

/**
 * Conciliacion de pagos de Binance Pay (rol Administracion). La cuenta de
 * Binance de Supricom es una sola para todas las sedes.
 *
 * Administracion sube los comprobantes (capturas de la app de quien pago),
 * Claude lee de cada uno el ID de orden, el monto, la moneda y la fecha, y se
 * guardan en `binance_comprobantes` (se crea sola). El cruce contra Binance no
 * se guarda: se hace cada vez que se abre la semana, con el historial de
 * Binance Pay (`GET /sapi/v1/pay/transactions`, 18 meses hacia atras).
 *
 * Necesita BINANCE_API_KEY / BINANCE_API_SECRET (una key de solo lectura) y
 * ANTHROPIC_API_KEY para leer los comprobantes.
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
  | "monto_distinto"
  | "por_monto_hora"
  | "no_encontrado"
  | "sin_verificar";

export type Comprobante = {
  id: number;
  orderId: string;
  monto: number;
  moneda: string;
  fecha: string; // ISO UTC
  /** El comprobante no traia fecha: se guardo en la semana elegida al subirlo. */
  fechaEstimada: boolean;
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
/**
 * Comprobantes de la semana cruzados con Binance, y los pagos que entraron en
 * la semana sin comprobante. Si Binance falla, los comprobantes salen
 * `sin_verificar` con el error.
 */
export async function conciliacionSemana(lunes: string) {
  const rango = rangoSemana(lunes);
  if (!rango) throw new Error("Semana inválida");
  await ensureTabla();
  const { rows } = await query(
    // DATE_FORMAT: la columna guarda UTC y asi no depende de la zona del proceso.
    `SELECT id, order_id, monto, moneda, DATE_FORMAT(fecha_pago, '%Y-%m-%dT%H:%i:%sZ') AS fecha,
            fecha_estimada, archivo_nombre, subido_por, created_at
       FROM binance_comprobantes WHERE fecha_pago BETWEEN ? AND ? ORDER BY fecha_pago`,
    [aMysql(rango.desde), aMysql(rango.hasta)],
  );

  // Un dia de margen: la hora del comprobante puede no ser exacta.
  let pagos: PagoBinance[] = [];
  let errorBinance: string | null = null;
  try {
    pagos = await pagosRecibidos(rango.desde - DIA_MS, Math.min(rango.hasta + DIA_MS, Date.now()));
  } catch (e: any) {
    errorBinance = e?.message || "No se pudo consultar Binance";
  }
  const porId = new Map(pagos.map((p) => [p.id, p]));
  const usados = new Set<string>(rows.map((r: any) => String(r.order_id)).filter((id) => porId.has(id)));

  const comprobantes: Comprobante[] = rows.map((r: any) => {
    const base = {
      id: r.id,
      orderId: String(r.order_id),
      monto: Number(r.monto),
      moneda: String(r.moneda),
      fecha: r.fecha,
      fechaEstimada: !!r.fecha_estimada,
      archivoNombre: r.archivo_nombre,
      subidoPor: r.subido_por,
      subidoEl: new Date(r.created_at).toISOString(),
    };
    if (errorBinance) return { ...base, estado: "sin_verificar" as const, binance: null };
    const exacto = porId.get(base.orderId);
    if (exacto) {
      const igual = exacto.moneda === base.moneda.toUpperCase() && Math.abs(exacto.monto - base.monto) < 1e-6;
      const fecha = base.fechaEstimada ? exacto.fecha : base.fecha;
      return { ...base, fecha, estado: igual ? ("conciliado" as const) : ("monto_distinto" as const), binance: exacto };
    }
    const t = Date.parse(base.fecha);
    const candidatos = pagos.filter(
      (p) =>
        !usados.has(p.id) &&
        p.moneda === base.moneda.toUpperCase() &&
        Math.abs(p.monto - base.monto) < 1e-6 &&
        // Sin fecha en el comprobante vale cualquier hora de la semana.
        (base.fechaEstimada || Math.abs(Date.parse(p.fecha) - t) <= MARGEN_POR_HORA_MS),
    );
    if (candidatos.length === 1) {
      usados.add(candidatos[0].id);
      return { ...base, estado: "por_monto_hora" as const, binance: candidatos[0] };
    }
    return { ...base, estado: "no_encontrado" as const, binance: null };
  });

  const sinComprobante = pagos.filter((p) => {
    const t = Date.parse(p.fecha);
    return !usados.has(p.id) && t >= rango.desde && t <= rango.hasta;
  });
  return { comprobantes, sinComprobante, errorBinance };
}

export async function imagenComprobante(id: number) {
  await ensureTabla();
  const [rows]: any = await db.execute(
    "SELECT archivo, archivo_mime, archivo_nombre FROM binance_comprobantes WHERE id = ?",
    [id],
  );
  return rows[0] || null;
}

export async function eliminarComprobante(id: number) {
  await ensureTabla();
  await query("DELETE FROM binance_comprobantes WHERE id = ?", [id]);
}

// ---------- Lectura del comprobante ----------

const INSTRUCCIONES =
  "Te dan la captura o el PDF de un comprobante de pago de Binance Pay (pantalla 'Pago exitoso' de la app). " +
  "Devuelve SOLO lo que esta en la imagen, sin inventar. " +
  "order_id: el 'ID de orden' / 'Order ID' completo, solo digitos; copia cada digito con cuidado, es lo que se usa para conciliar. " +
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

/** fechaMs null = la captura no trae la fecha. */
export type Leido = { orderId: string; monto: number; moneda: string; fechaMs: number | null };

/** Lee el comprobante. null = no es un comprobante de Binance o le faltan datos. */
export async function leerComprobante(datos: Buffer, mime: string): Promise<Leido | null> {
  const base64 = datos.toString("base64");
  const documento: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: mime as "image/jpeg", data: base64 } };
  const respuesta = await anthropic().messages.create({
    model: MODELO,
    max_tokens: 1000,
    system: INSTRUCCIONES,
    output_config: { format: { type: "json_schema", schema: ESQUEMA as any }, effort: "low" },
    messages: [{ role: "user", content: [documento, { type: "text", text: "Lee este comprobante." }] }],
  });
  let l: any;
  try {
    l = JSON.parse(respuesta.content.map((b) => (b.type === "text" ? b.text : "")).join(""));
  } catch {
    return null;
  }
  const orderId = String(l?.order_id || "").replace(/\D/g, "");
  const monto = Number(l?.monto);
  const moneda = String(l?.moneda || "").trim().toUpperCase().slice(0, 12);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(l?.fecha || ""));
  if (!l?.es_comprobante || !/^\d{6,40}$/.test(orderId) || !(monto > 0) || !moneda) return null;
  if (!m) return { orderId, monto, moneda, fechaMs: null };
  const local = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
  // Sin "UTC" en el comprobante se toma la hora de Caracas.
  return { orderId, monto, moneda, fechaMs: l.fecha_en_utc ? local : local + OFFSET_CARACAS_MS };
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
