// lib/smartbit.ts
//
// Historico de ventas de Smartbit, el ERP anterior a Odoo.
//
// Odoo factura de forma nativa desde CORTE_ODOO en las 3 sedes; lo anterior
// en Odoo son solo las facturas abiertas que se migraron para cobranza
// ("Importación Masiva" en `ref`), o sea un historico parcial. Por eso, antes
// del corte los dashboards leen SOLO de la tabla MySQL `ventas_smartbit`
// (sql/ventas_smartbit.sql) y las consultas a Odoo arrancan en el corte
// (`desdeOdoo`). Asi no se duplica nada.
//
// La tabla se llena con importarVentasSmartbit() via
// POST /api/superadmin/smartbit/importar. El historico no cambia, asi que no
// se consulta la API de Smartbit en cada carga del dashboard.
//
// API: https://developers.smartbiterp.com/ (login email+password -> token
// Bearer; header X-ClientId obligatorio; paginacion con cantidadPaginas en
// el header de la respuesta).

import { db, getConnection, query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";

export const CORTE_ODOO = process.env.SMARTBIT_CORTE || "2026-04-01";

/** RIF comparable entre Odoo (`res.partner.vat`) y Smartbit (`codigo_cliente`). */
export const normalizarRif = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

/** SQL equivalente a normalizarRif() sobre `codigo_cliente` (guiones y espacios). */
export const RIF_SQL = "REPLACE(REPLACE(UPPER(codigo_cliente), '-', ''), ' ', '')";

/** Primer dia del historial de facturacion (Smartbit no tiene ventas antes). */
export const HISTORIA_DESDE = "2018-01-01";

/**
 * "+12.3%" de `total` contra el mes anterior a `mes` ("YYYY-MM") en la serie
 * mensual; "—" si ese mes no tiene ventas. Antes se comparaba contra el
 * penultimo punto de la serie, que solo coincide si `mes` es el actual.
 */
export function crecimientoVsMesAnterior(serie: Record<string, number>, mes: string, total: number): string {
  const [y, m] = mes.split("-").map(Number);
  const anterior = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const base = serie[anterior];
  if (!base) return "—";
  const pct = ((total - base) / Math.abs(base)) * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

const BASE_URL = (process.env.SMARTBIT_URL || "").replace(/\/+$/, "");
const POR_PAGINA = 500;

// ---------------------------------------------------------------------------
// Rangos
// ---------------------------------------------------------------------------

function diaAnterior(fecha: string): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Primer dia que se consulta en Odoo: nunca antes del corte. */
export function desdeOdoo(desde: string): string {
  return desde < CORTE_ODOO ? CORTE_ODOO : desde;
}

/** Tramo del rango que cae antes del corte, o null si no hay. */
export function rangoSmartbit(desde: string, hasta: string): [string, string] | null {
  if (desde >= CORTE_ODOO) return null;
  const fin = hasta < CORTE_ODOO ? hasta : diaAnterior(CORTE_ODOO);
  return desde <= fin ? [desde, fin] : null;
}

// ---------------------------------------------------------------------------
// Lectura (dashboards)
// ---------------------------------------------------------------------------

export type Exclusiones = Record<number, string[]>;

type Filtro = { sql: string; params: any[] };

/**
 * Ventas intercompañía en Smartbit: al cliente del grupo (SUPRICOM CCS 21,
 * SUPRICOM USA / LLC, Office Solutions Center, Ofimaster), por nombre o por
 * RIF en `codigo_cliente` (sin guiones ni puntos). Mismos criterios que
 * lib/intercompania.ts en Odoo. No son venta a un cliente: inflaban la sede
 * que vende y volvían a contar la mercancía.
 */
export const SQL_SIN_INTERCOMPANIA = `LOWER(COALESCE(cliente,'')) NOT REGEXP 'supricom|office solutions? center|ofimaster'
  AND REPLACE(REPLACE(REPLACE(UPPER(COALESCE(codigo_cliente,'')),'-',''),'.',''),' ','') NOT REGEXP '501193738|31163115|155595002|1576706'`;

/** Vendedores "local" de Smartbit: no son un vendedor, no cuentan en las métricas. */
export const SQL_SIN_VENDEDOR_LOCAL = `LOWER(COALESCE(vendedor,'')) NOT LIKE '%local%'`;

/**
 * Filtro de las lecturas de los dashboards (resumen y serie mensual): el
 * rango, las exclusiones de vendedores de cada ruta y siempre sin
 * intercompañía ni vendedores "local".
 */
function filtroBase(
  cids: number[],
  rango: [string, string],
  excluir?: Exclusiones,
): Filtro {
  let sql = `company_id IN (${cids.map(() => "?").join(",")}) AND fecha BETWEEN ? AND ?
    AND ${SQL_SIN_INTERCOMPANIA} AND ${SQL_SIN_VENDEDOR_LOCAL}`;
  const params: any[] = [...cids, rango[0], rango[1]];
  for (const [cid, reglas] of Object.entries(excluir || {})) {
    for (const regla of reglas) {
      sql += ` AND NOT (company_id = ? AND LOWER(COALESCE(vendedor,'')) LIKE ?)`;
      params.push(Number(cid), `%${regla.toLowerCase()}%`);
    }
  }
  return { sql, params };
}

// Si la tabla no existe todavia o la MySQL no responde, el dashboard sigue
// funcionando con los datos de Odoo: el historico es un extra.
async function leer(sql: string, params: any[]): Promise<any[]> {
  try {
    return (await query(sql, params)).rows;
  } catch (e: any) {
    console.error("[smartbit] no se pudo leer ventas_smartbit:", e?.message);
    return [];
  }
}

export interface ResumenSmartbit {
  productos: { codigo: string; articulo: string; venta: number; unidades: number }[];
  clientes: { cliente: string; venta: number }[];
  vendedores: { companyId: number; vendedor: string; venta: number }[];
}

/**
 * Productos, clientes y vendedores de Smartbit en [desde, hasta] (solo el
 * tramo previo al corte). `excluir` quita vendedores de productos y clientes;
 * los vendedores se devuelven todos y cada ruta aplica sus exclusiones. Nada
 * de esto trae intercompañía ni vendedores "local" (ver filtroBase).
 */
export async function resumenSmartbit(
  cids: number[],
  desde: string,
  hasta: string,
  excluir?: Exclusiones,
): Promise<ResumenSmartbit> {
  const rango = rangoSmartbit(desde, hasta);
  if (!rango || cids.length === 0) return { productos: [], clientes: [], vendedores: [] };

  const conExcl = filtroBase(cids, rango, excluir);
  const sinExcl = filtroBase(cids, rango);
  const [productos, clientes, vendedores] = await Promise.all([
    leer(
      `SELECT codigo_articulo AS codigo, MAX(articulo) AS articulo,
              SUM(venta) AS venta, SUM(unidades) AS unidades
         FROM ventas_smartbit WHERE ${conExcl.sql}
        GROUP BY codigo_articulo`,
      conExcl.params,
    ),
    leer(
      `SELECT cliente, SUM(venta) AS venta
         FROM ventas_smartbit WHERE ${conExcl.sql}
        GROUP BY cliente`,
      conExcl.params,
    ),
    leer(
      `SELECT company_id AS companyId, vendedor, SUM(venta) AS venta
         FROM ventas_smartbit WHERE ${sinExcl.sql}
        GROUP BY company_id, vendedor`,
      sinExcl.params,
    ),
  ]);

  return {
    productos: productos.map((p) => ({
      codigo: p.codigo || "",
      articulo: p.articulo || p.codigo || "Sin nombre",
      venta: Number(p.venta) || 0,
      unidades: Number(p.unidades) || 0,
    })),
    clientes: clientes.map((c) => ({ cliente: c.cliente || "Desconocido", venta: Number(c.venta) || 0 })),
    vendedores: vendedores.map((v) => ({
      companyId: Number(v.companyId),
      vendedor: v.vendedor || "Sin Vendedor",
      venta: Number(v.venta) || 0,
    })),
  };
}

/** Total de Smartbit por mes "YYYY-MM" en [desde, hasta], con exclusiones. */
export async function mensualSmartbit(
  cids: number[],
  desde: string,
  hasta: string,
  excluir?: Exclusiones,
): Promise<Record<string, number>> {
  const rango = rangoSmartbit(desde, hasta);
  if (!rango || cids.length === 0) return {};
  const f = filtroBase(cids, rango, excluir);
  const rows = await leer(
    `SELECT DATE_FORMAT(fecha, '%Y-%m') AS mes, SUM(venta) AS total
       FROM ventas_smartbit WHERE ${f.sql}
      GROUP BY mes`,
    f.params,
  );
  return Object.fromEntries(rows.map((r) => [r.mes, Number(r.total) || 0]));
}

/** Meses "YYYY-MM" con ventas de Smartbit (previos al corte). */
export async function mesesSmartbit(cids: number[]): Promise<string[]> {
  if (cids.length === 0) return [];
  const rows = await leer(
    `SELECT DISTINCT DATE_FORMAT(fecha, '%Y-%m') AS mes
       FROM ventas_smartbit
      WHERE company_id IN (${cids.map(() => "?").join(",")}) AND fecha < ?`,
    [...cids, CORTE_ODOO],
  );
  return rows.map((r) => r.mes);
}

/**
 * Ultima venta en Smartbit por codigo de articulo (en mayusculas, sin
 * espacios a los lados), para que Compras no marque "Nunca vendido" a lo que
 * se vendio antes de Odoo. Excluye ventas intercompania, como hace Odoo.
 */
export async function ultimaVentaSmartbit(cids: number[]): Promise<Map<string, Date>> {
  if (cids.length === 0) return new Map();
  const rows = await leer(
    `SELECT UPPER(TRIM(codigo_articulo)) AS codigo, MAX(fecha) AS ultima
       FROM ventas_smartbit
      WHERE company_id IN (${cids.map(() => "?").join(",")})
        AND venta > 0 AND codigo_articulo IS NOT NULL
        AND ${SQL_SIN_INTERCOMPANIA}
      GROUP BY UPPER(TRIM(codigo_articulo))`,
    cids,
  );
  return new Map(rows.map((r) => [r.codigo, new Date(r.ultima)]));
}

// ---------------------------------------------------------------------------
// Mezcla con los resultados de Odoo
// ---------------------------------------------------------------------------

const codigoDe = (nombre: string) => nombre.match(/\[(.*?)\]/)?.[1]?.trim().toUpperCase() || "";
const nombreNorm = (s: string) =>
  (s || "").replace(/\(v\)/gi, "").replace(/\s+/g, " ").trim().toUpperCase();

/**
 * Suma los productos de Smartbit a un read_group de account.move.line por
 * product_id. Empata por codigo ("[CODIGO] Nombre" en Odoo); lo que no empata
 * entra con id "sb:<codigo>" (sin stock en Odoo). Devuelve ordenado por venta.
 */
export function mezclarLineasProducto(lineas: any[], sb: ResumenSmartbit["productos"]): any[] {
  if (sb.length === 0) return lineas;
  const out = lineas.map((l) => ({ ...l }));
  const porCodigo = new Map<string, any>();
  for (const l of out) {
    const c = codigoDe(l.product_id?.[1] || "");
    if (c) porCodigo.set(c, l);
  }
  for (const p of sb) {
    const c = p.codigo.trim().toUpperCase();
    const existente = c ? porCodigo.get(c) : undefined;
    if (existente) {
      existente.price_subtotal = (existente.price_subtotal || 0) + p.venta;
      existente.quantity = (existente.quantity || 0) + p.unidades;
    } else {
      const nueva = {
        product_id: [`sb:${p.codigo}`, p.codigo ? `[${p.codigo}] ${p.articulo}` : p.articulo],
        price_subtotal: p.venta,
        quantity: p.unidades,
      };
      out.push(nueva);
      if (c) porCodigo.set(c, nueva);
    }
  }
  return out.sort((a, b) => (b.price_subtotal || 0) - (a.price_subtotal || 0));
}

/**
 * Suma los clientes de Smartbit a un read_group de account.move por
 * partner_id. Empata por nombre (los codigos de cliente no coinciden).
 */
export function mezclarClientes(ranking: any[], sb: ResumenSmartbit["clientes"]): any[] {
  if (sb.length === 0) return ranking;
  const out = ranking.map((r) => ({ ...r }));
  const porNombre = new Map(out.map((r) => [nombreNorm(r.partner_id?.[1] || ""), r]));
  for (const c of sb) {
    const k = nombreNorm(c.cliente);
    const existente = porNombre.get(k);
    if (existente) existente.amount_untaxed = (existente.amount_untaxed || 0) + c.venta;
    else {
      const nuevo = { partner_id: [`sb:${k}`, c.cliente], amount_untaxed: c.venta };
      out.push(nuevo);
      porNombre.set(k, nuevo);
    }
  }
  return out.sort((a, b) => (b.amount_untaxed || 0) - (a.amount_untaxed || 0));
}

/**
 * Suma los vendedores de Smartbit al mapa sellerStats de las rutas de stats
 * ({ total, id, companyId, name } por id de Odoo). Empata por nombre y sede.
 */
export function sumarVendedores(
  sellerStats: Record<string, { total: number; id: any; companyId: number; name: string }>,
  sb: ResumenSmartbit["vendedores"],
): void {
  const porNombre = new Map(
    Object.values(sellerStats).map((s) => [`${s.companyId}|${nombreNorm(s.name)}`, s]),
  );
  for (const v of sb) {
    const k = `${v.companyId}|${nombreNorm(v.vendedor)}`;
    const existente = porNombre.get(k);
    if (existente) existente.total += v.venta;
    else {
      const nuevo = { total: v.venta, id: `sb:${k}`, companyId: v.companyId, name: v.vendedor.trim() };
      sellerStats[nuevo.id] = nuevo;
      porNombre.set(k, nuevo);
    }
  }
}

// ---------------------------------------------------------------------------
// Importacion (API de Smartbit -> MySQL)
//
// Verificado contra la cuenta de Panama (2026-09-28): hay ventas desde 2019
// hasta marzo 2026 y nada desde abril (confirma el corte); `venta` es neto sin
// impuesto (cuadra exacto con amount_untaxed de las facturas migradas); los
// codigos de articulo coinciden con default_code de Odoo; el unico
// clasificador que llega es "Linea". La API limita a ~20 llamadas por minuto
// (headers x-rate-limit-*), y la ultima pagina que anuncia cantidadPaginas
// responde 204 vacio.
// ---------------------------------------------------------------------------

/**
 * Sedes a importar, de SMARTBIT_SEDES="9=<X-ClientId>,10=<X-ClientId>:<idSucursal>,...".
 * `:idSucursal` es opcional: sirve si las sedes son sucursales de una misma
 * cuenta de Smartbit (0 o sin nada = todas las sucursales de ese X-ClientId).
 */
export function sedesSmartbit(): { companyId: number; clientId: string; idSucursal: number }[] {
  return (process.env.SMARTBIT_SEDES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [cid, resto = ""] = s.split("=");
      const [clientId, suc] = resto.split(":");
      return { companyId: Number(cid), clientId: (clientId || "").trim(), idSucursal: Number(suc) || 0 };
    })
    .filter((s) => s.companyId && s.clientId);
}

let token: { valor: string; expira: number } | null = null;

async function obtenerToken(forzar = false): Promise<string> {
  if (!forzar && token && token.expira > Date.now() + 60_000) return token.valor;
  if (!BASE_URL || !process.env.SMARTBIT_EMAIL || !process.env.SMARTBIT_PASSWORD) {
    throw new Error("Faltan SMARTBIT_URL / SMARTBIT_EMAIL / SMARTBIT_PASSWORD en el entorno");
  }
  let res: Response;
  for (let intento = 1; ; intento++) {
    try {
      res = await fetch(`${BASE_URL}/api/v1/User/Login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: process.env.SMARTBIT_EMAIL, password: process.env.SMARTBIT_PASSWORD }),
      });
      break;
    } catch (e) {
      if (intento >= 10) throw e;
      await esperar(30_000 * intento);
    }
  }
  const data: any = await res.json().catch(() => null);
  if (!res.ok || !data?.token) {
    throw new Error(`Login Smartbit fallo (${res.status}): ${data?.message || "sin detalle"}`);
  }
  const expira = Date.parse(data.expiration);
  token = { valor: data.token, expira: Number.isFinite(expira) ? expira : Date.now() + 30 * 60_000 };
  return token.valor;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Hasta cuando no conviene llamar: se llena con x-rate-limit-reset cuando
// quedan pocas llamadas en la ventana o la API responde 429.
let pausaHasta = 0;

async function paginaVentas(
  clientId: string,
  body: any,
  pagina: number,
  reintento = false,
): Promise<{ filas: any[]; paginas: number }> {
  if (pausaHasta > Date.now()) await esperar(pausaHasta - Date.now());
  const url = `${BASE_URL}/api/v1/MovimientoInventario/Ventas?pagina=${pagina}&cantidadRegistroPagina=${POR_PAGINA}`;
  const token = await obtenerToken(reintento);
  // Una carga completa son miles de llamadas: un corte de red o un 5xx
  // puntual (visto: ConnectTimeoutError a los 20 min) no debe tirar todo.
  let res: Response | undefined;
  for (let intento = 1; ; intento++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-ClientId": clientId,
          pagina: String(pagina),
          cantidadPaginas: String(POR_PAGINA),
        },
        body: JSON.stringify(body),
      });
      if (res.status < 500 || intento >= 10) break;
    } catch (e) {
      if (intento >= 10) throw e;
    }
    // 30 s, 60 s... ~27 min en total: los cortes de ptyapi duran minutos.
    await esperar(30_000 * intento);
  }
  const reset = Date.parse(res.headers.get("x-rate-limit-reset") || "");
  const quedanHeader = res.headers.get("x-rate-limit-remaining");
  const quedan = quedanHeader == null ? Infinity : Number(quedanHeader);
  if (res.status === 429 || quedan <= 1) {
    pausaHasta = (Number.isFinite(reset) ? reset : Date.now() + 60_000) + 1000;
    if (res.status === 429) return paginaVentas(clientId, body, pagina, reintento);
  }
  if (res.status === 401 && !reintento) return paginaVentas(clientId, body, pagina, true);
  const data: any = await res.json().catch(() => null);
  if (!res.ok || data?.error) {
    throw new Error(`Smartbit Ventas fallo (${res.status}): ${data?.message || "sin detalle"}`);
  }
  return {
    filas: Array.isArray(data) ? data : [],
    paginas: Number(res.headers.get("cantidadPaginas")) || 1,
  };
}

function diaMas(fecha: string, n: number): string {
  const d = new Date(`${fecha}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function rangosMensuales(desde: string, hasta: string): [string, string][] {
  const out: [string, string][] = [];
  let ini = desde;
  while (ini <= hasta) {
    const d = new Date(`${ini}T00:00:00Z`);
    const finMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const fin = finMes < hasta ? finMes : hasta;
    out.push([ini, fin]);
    ini = diaMas(fin, 1);
  }
  return out;
}

async function todasLasPaginas(clientId: string, body: any): Promise<any[]> {
  const filas: any[] = [];
  for (let pagina = 1, total = 1; pagina <= total; pagina++) {
    const r = await paginaVentas(clientId, body, pagina);
    filas.push(...r.filas);
    total = r.paginas;
    if (r.filas.length === 0) break;
  }
  return filas;
}

const sumaVenta = (filas: any[]) =>
  filas.reduce((a, f) => a + (f.detalle || []).reduce((b: number, d: any) => b + (Number(d.venta) || 0), 0), 0);

/**
 * Detalle de ventas de [ini, fin] que cuadra con el total agrupado que calcula
 * la propia API para esa ventana. Dos trampas de la API (vistas con Panama,
 * 2026-09-28):
 *  - Pagina en ~600 renglones sin orden estable: con muchas paginas repite y
 *    salta renglones (marzo 2026, 12 paginas: 16 diferencias entre corridas).
 *    Por eso se verifica y se reintenta.
 *  - El filtro de fecha no usa la fecha que devuelve: para datos viejos, una
 *    ventana de UN dia devuelve casi nada (junio 2019 dia por dia: 126
 *    renglones; el mes: 2781 y cuadra con el agrupado). Ventanas contiguas de
 *    varios dias si reparten bien (dos quincenas = el mes exacto), asi que si
 *    un mes no cuadra se parte en mitades, nunca en dias sueltos.
 */
// Desde aqui los registros de Smartbit (Panama) traen hora real y se consultan
// dia por dia desde las 00:00; antes estan a las 00:00:00 exactas y un dia
// suelto no sirve (ver ventasVerificadas). Visto en los datos: nov-2023 dia
// por dia = 0 renglones, dic-2023 = 3.451.
const POR_DIA_DESDE = process.env.SMARTBIT_POR_DIA_DESDE || "2023-12-01";

async function ventasVerificadas(
  sede: { clientId: string; idSucursal: number },
  ini: string,
  fin: string,
  nivel = 0,
): Promise<any[]> {
  const cuerpo = (agrupado: boolean) => ({
    idSucursal: sede.idSucursal,
    agrupaSucursal: agrupado,
    agrupaCliente: false,
    agrupaAgrupadores: false,
    agruparVendedor: false,
    agrupaArticulo: false,
    // Datos viejos: el filtro es "mayor que fechaInicial" (estricto) sobre un
    // timestamp y los registros estan a las 00:00:00 exactas; con
    // `${ini}T00:00:00` se perdia el primer dia de cada ventana (feb 2021:
    // 49.687,38). Datos recientes: con el dia anterior entra ese dia entero.
    fecha: {
      fechaInicial: ini >= POR_DIA_DESDE ? `${ini}T00:00:00` : `${diaMas(ini, -1)}T23:59:59`,
      fechaFinal: `${fin}T23:59:59`,
    },
  });
  const esperado = sumaVenta(await todasLasPaginas(sede.clientId, cuerpo(true)));
  let mejor: any[] = [];
  for (let intento = 0; intento < 3; intento++) {
    const filas = await todasLasPaginas(sede.clientId, cuerpo(false));
    if (Math.abs(sumaVenta(filas) - esperado) < 0.05) return filas;
    if (Math.abs(sumaVenta(filas) - esperado) < Math.abs(sumaVenta(mejor) - esperado)) mejor = filas;
  }
  const dias = (Date.parse(fin) - Date.parse(ini)) / 864e5 + 1;
  if (nivel < 2 && dias >= 8) {
    const mitad = diaMas(ini, Math.floor(dias / 2) - 1);
    return [
      ...(await ventasVerificadas(sede, ini, mitad, nivel + 1)),
      ...(await ventasVerificadas(sede, diaMas(mitad, 1), fin, nivel + 1)),
    ];
  }
  // Sin cortar toda la carga por una ventana: se deja la mas cercana y se avisa.
  console.warn(
    `[smartbit] ${ini} a ${fin}: el detalle no cuadra con el agrupado (${sumaVenta(mejor).toFixed(2)} vs ${esperado.toFixed(2)})`,
  );
  return mejor;
}

/**
 * Reemplaza en ventas_smartbit las ventas de una sede en [desde, hasta]
 * (recortado al dia antes del corte) con lo que devuelve Smartbit. Borra el
 * rango completo una vez y despues inserta mes a mes: un registro puede venir
 * con fecha de un mes vecino a su ventana, y un borrado por mes lo perderia.
 * Si se corta a mitad, se vuelve a correr el mismo rango.
 */
export async function importarVentasSmartbit(
  companyId: number,
  desde: string,
  hasta: string,
  alTerminarMes?: (mes: string, renglones: number) => void,
): Promise<{ meses: number; renglones: number }> {
  const sede = sedesSmartbit().find((s) => s.companyId === companyId);
  if (!sede) throw new Error(`La sede ${companyId} no esta en SMARTBIT_SEDES`);
  const rango = rangoSmartbit(desde, hasta);
  if (!rango) return { meses: 0, renglones: 0 };

  // Conexion directa (no query()): un DELETE/INSERT de miles de renglones
  // no debe pasar por la auditoria fila a fila de lib/db.ts.
  const conn = await getConnection();
  try {
    await conn.query("DELETE FROM ventas_smartbit WHERE company_id = ? AND fecha BETWEEN ? AND ?", [
      companyId,
      rango[0],
      rango[1],
    ]);

    // Recortado al largo de cada columna (sql/ventas_smartbit.sql): MySQL
    // estricto rechaza el INSERT completo si un texto sobra.
    const txt = (s: any, max: number) => (s == null || String(s).trim() === "" ? null : String(s).trim().slice(0, max));
    let renglones = 0;
    const meses = rangosMensuales(rango[0], rango[1]);
    for (const [ini, fin] of meses) {
      const filas: any[] = [];
      if (ini >= POR_DIA_DESDE) {
        for (let dia = ini; dia <= fin; dia = diaMas(dia, 1)) filas.push(...(await ventasVerificadas(sede, dia, dia)));
      } else {
        filas.push(...(await ventasVerificadas(sede, ini, fin)));
      }
      const valores = filas.flatMap((f) =>
        (f.detalle || []).map((d: any) => [
          companyId,
          String(f.fecha || ini).slice(0, 10),
          f.idSucursal ?? null,
          txt(f.sucursal, 120),
          txt(f.vendedor, 150),
          txt(f.codigoCliente, 60),
          txt(f.cliente, 255),
          txt(d.codigo, 80),
          txt(d.articulo, 255),
          txt((d.clasificadores || []).find((c: any) => (c.agrupador || "").toLowerCase() === "linea")?.descripcion, 120),
          Number(d.venta) || 0,
          Number(d.unidades) || 0,
          d.costo == null ? null : Number(d.costo),
        ]),
      );
      // Como fechaInicial es el dia anterior, en datos recientes (filtro por
      // fecha, inclusivo) la ventana trae tambien ese dia, que ya importo la
      // ventana anterior (2025: +1,66 M). En datos viejos el unico renglon con
      // fecha anterior era un repetido (31-ene-2021). Se descarta lo anterior a
      // `ini`; verificado por año contra el agrupado de la API.
      const unicos = ini >= POR_DIA_DESDE ? valores : valores.filter((v: any[]) => v[1] >= ini);
      if (unicos.length < valores.length) {
        console.warn(`[smartbit] ${ini.slice(0, 7)}: ${valores.length - unicos.length} renglones con fecha anterior a la ventana, omitidos`);
      }
      // Una fecha fuera del rango borrado duplicaria al volver a correr.
      const dentro = unicos.filter((v: any[]) => v[1] >= rango[0] && v[1] <= rango[1]);
      if (dentro.length < unicos.length) {
        console.warn(`[smartbit] ${ini.slice(0, 7)}: ${unicos.length - dentro.length} renglones con fecha fuera del rango, omitidos`);
      }
      await conn.beginTransaction();
      try {
        for (let i = 0; i < dentro.length; i += 500) {
          await conn.query(
            `INSERT INTO ventas_smartbit
               (company_id, fecha, id_sucursal, sucursal, vendedor, codigo_cliente, cliente,
                codigo_articulo, articulo, linea, venta, unidades, costo)
             VALUES ?`,
            [dentro.slice(i, i + 500)],
          );
        }
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }
      renglones += dentro.length;
      alTerminarMes?.(ini.slice(0, 7), dentro.length);
    }
    return { meses: meses.length, renglones };
  } finally {
    conn.release();
  }
}

// ---------------------------------------------------------------------------
// Marca (cruce con Odoo)
//
// Smartbit no guarda la marca: la API de ventas solo trae el clasificador
// "Linea" y los exportes de Valencia/Caracas ni eso. Como codigo_articulo es
// el default_code de Odoo, la marca se toma de product.product.x_studio_marca
// (la misma de Metas por marca) y se guarda en ventas_smartbit.marca
// (sql/ventas_smartbit_marca.sql). NULL = sin revisar; '' = revisado y el
// artículo no existe en Odoo.
// ---------------------------------------------------------------------------

const SEDES_ODOO = [9, 10, 7];

// Código de artículo comparable: mayúsculas, sin espacios, "/" como "-"
// (Smartbit "CRG-051D/CF232A" es "CRG-051D-CF232A" en Odoo).
export const normCodigo = (c: string) => String(c).trim().toUpperCase().replace(/\//g, "-");

async function productosOdoo(domain: any[]): Promise<{ codigo: string; marca: string }[]> {
  const prods =
    (await callOdooRPCEstricto<any[]>("product.product", "search_read", [domain], {
      fields: ["default_code", "x_studio_marca"],
      context: { active_test: false, allowed_company_ids: SEDES_ODOO },
    })) || [];
  return prods
    .filter((p) => p.default_code)
    .map((p) => {
      const m = Array.isArray(p.x_studio_marca) ? p.x_studio_marca[1] : p.x_studio_marca;
      return { codigo: normCodigo(p.default_code), marca: m ? String(m).toUpperCase().trim() : "Sin marca" };
    });
}

/**
 * Marca de Odoo por código de artículo, incluidos productos archivados.
 * Clave: normCodigo(). Si no hay código exacto, se acepta uno que empiece
 * igual en cualquiera de los dos sentidos ("A-CB435A-CE278A" →
 * "A-CB435A-CE278A-CE285A"; "5U0G1LT-AC8" → "5U0G1LT"; "I62" → "I62BK"), pero
 * solo si todos los candidatos son de la misma marca: solo se toma la marca.
 */
export async function marcasPorCodigo(codigos: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const todos = [...new Set(codigos.map(normCodigo))];
  for (let k = 0; k < todos.length; k += 1000) {
    const lote = todos.slice(k, k + 1000);
    // Odoo compara default_code tal cual: se piden las dos grafías.
    const variantes = [...new Set([...lote, ...codigos.filter((c) => lote.includes(normCodigo(c))).map((c) => String(c).trim())])];
    for (const p of await productosOdoo([["default_code", "in", variantes]])) mapa.set(p.codigo, p.marca);
  }

  const faltan = todos.filter((c) => !mapa.has(c) && c.length >= 3);
  for (let k = 0; k < faltan.length; k += 60) {
    const lote = faltan.slice(k, k + 60);
    // Prefijos del código cortando en cada "-" (para "5U0G1LT-AC8" → "5U0G1LT").
    const prefijos = [...new Set(lote.flatMap((c) => [...c.matchAll(/-/g)].map((m) => c.slice(0, m.index)).filter((x) => x.length >= 4)))];
    const terminos: any[] = lote.map((c) => ["default_code", "=ilike", `${c}%`]);
    if (prefijos.length) terminos.push(["default_code", "in", prefijos]);
    const domain = [...Array(terminos.length - 1).fill("|"), ...terminos];
    const candidatos = await productosOdoo(domain);
    for (const c of lote) {
      const marcas = new Set(
        candidatos.filter((p) => p.codigo.startsWith(c) || (p.codigo.length >= 4 && c.startsWith(p.codigo))).map((p) => p.marca),
      );
      if (marcas.size === 1) mapa.set(c, [...marcas][0]);
    }
  }
  return mapa;
}

/**
 * Llena ventas_smartbit.marca cruzando con Odoo. Por defecto solo los
 * renglones sin revisar (marca NULL); `todas` vuelve a cruzar todo (p. ej.
 * después de cargar productos o corregir marcas en Odoo).
 *
 * Va por db.query y no por query(): query() audita cada escritura guardando
 * las filas de antes, y aquí un UPDATE toca miles de renglones.
 */
export async function asignarMarcasSmartbit(
  todas = false,
  avance?: (hechos: number, total: number) => void,
): Promise<{ codigos: number; conMarca: number; sinMarca: number; renglones: number }> {
  const [filas] = await db.query(
    `SELECT DISTINCT codigo_articulo AS codigo FROM ventas_smartbit
      WHERE codigo_articulo IS NOT NULL AND TRIM(codigo_articulo) <> ''${todas ? "" : " AND marca IS NULL"}`,
  );
  const codigos = (filas as any[]).map((f) => String(f.codigo));
  const mapa = await marcasPorCodigo(codigos);

  // Un UPDATE por marca y lote de códigos ('' = no está en Odoo).
  const porMarca = new Map<string, string[]>();
  for (const c of codigos) {
    const marca = mapa.get(normCodigo(c)) ?? "";
    porMarca.set(marca, [...(porMarca.get(marca) || []), c]);
  }
  let renglones = 0;
  let hechos = 0;
  for (const [marca, lista] of porMarca) {
    for (let k = 0; k < lista.length; k += 500) {
      const lote = lista.slice(k, k + 500);
      const [r] = await db.query("UPDATE ventas_smartbit SET marca = ? WHERE codigo_articulo IN (?)", [marca, lote]);
      renglones += (r as any).affectedRows || 0;
      hechos += lote.length;
      avance?.(hechos, codigos.length);
    }
  }
  const sinMarca = porMarca.get("")?.length || 0;
  return { codigos: codigos.length, conMarca: codigos.length - sinMarca, sinMarca, renglones };
}
