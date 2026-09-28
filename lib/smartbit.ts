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

import { getConnection, query } from "@/lib/db";

export const CORTE_ODOO = process.env.SMARTBIT_CORTE || "2026-04-01";

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

function filtroBase(
  cids: number[],
  rango: [string, string],
  excluir?: Exclusiones,
): Filtro {
  let sql = `company_id IN (${cids.map(() => "?").join(",")}) AND fecha BETWEEN ? AND ?`;
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
 * los vendedores se devuelven todos y cada ruta aplica sus exclusiones.
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
        AND COALESCE(cliente,'') NOT LIKE '%supricom%'
        AND COALESCE(cliente,'') NOT LIKE '%office solution%'
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
  const res = await fetch(`${BASE_URL}/api/v1/User/Login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: process.env.SMARTBIT_EMAIL, password: process.env.SMARTBIT_PASSWORD }),
  });
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
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await obtenerToken(reintento)}`,
      "X-ClientId": clientId,
      pagina: String(pagina),
      cantidadPaginas: String(POR_PAGINA),
    },
    body: JSON.stringify(body),
  });
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

function diasDe(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let d = desde; d <= hasta; ) {
    out.push(d);
    const sig = new Date(`${d}T00:00:00Z`);
    sig.setUTCDate(sig.getUTCDate() + 1);
    d = sig.toISOString().slice(0, 10);
  }
  return out;
}

function rangosMensuales(desde: string, hasta: string): [string, string][] {
  const out: [string, string][] = [];
  let ini = desde;
  while (ini <= hasta) {
    const d = new Date(`${ini}T00:00:00Z`);
    const finMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const fin = finMes < hasta ? finMes : hasta;
    out.push([ini, fin]);
    const sig = new Date(`${fin}T00:00:00Z`);
    sig.setUTCDate(sig.getUTCDate() + 1);
    ini = sig.toISOString().slice(0, 10);
  }
  return out;
}

/**
 * Reemplaza en ventas_smartbit las ventas de una sede en [desde, hasta]
 * (recortado al dia antes del corte) con lo que devuelve Smartbit. Va mes a
 * mes, cada mes en su transaccion: se puede reintentar sin duplicar.
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

  let renglones = 0;
  const meses = rangosMensuales(rango[0], rango[1]);
  for (const [ini, fin] of meses) {
    // Dia por dia: la API corta las paginas en ~600 renglones sin orden
    // estable, y con muchas paginas repite y salta renglones (marzo 2026 de
    // Panama, 12 paginas: 16 diferencias entre dos corridas). Un dia casi
    // siempre cabe en una pagina.
    const filas: any[] = [];
    for (const dia of diasDe(ini, fin)) {
      const body = {
        idSucursal: sede.idSucursal,
        agrupaSucursal: false,
        agrupaCliente: false,
        agrupaAgrupadores: false,
        agruparVendedor: false,
        agrupaArticulo: false,
        fecha: { fechaInicial: `${dia}T00:00:00`, fechaFinal: `${dia}T23:59:59` },
      };
      for (let pagina = 1, total = 1; pagina <= total; pagina++) {
        const r = await paginaVentas(sede.clientId, body, pagina);
        filas.push(...r.filas);
        total = r.paginas;
        if (r.filas.length === 0) break;
      }
    }

    // Recortado al largo de cada columna (sql/ventas_smartbit.sql): MySQL
    // estricto rechaza el INSERT completo si un texto sobra.
    const txt = (s: any, max: number) => (s == null || String(s).trim() === "" ? null : String(s).trim().slice(0, max));
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

    // Conexion directa (no query()): un DELETE/INSERT de miles de renglones
    // no debe pasar por la auditoria fila a fila de lib/db.ts.
    const conn = await getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        "DELETE FROM ventas_smartbit WHERE company_id = ? AND fecha BETWEEN ? AND ?",
        [companyId, ini, fin],
      );
      for (let i = 0; i < valores.length; i += 500) {
        await conn.query(
          `INSERT INTO ventas_smartbit
             (company_id, fecha, id_sucursal, sucursal, vendedor, codigo_cliente, cliente,
              codigo_articulo, articulo, linea, venta, unidades, costo)
           VALUES ?`,
          [valores.slice(i, i + 500)],
        );
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
    renglones += valores.length;
    alTerminarMes?.(ini.slice(0, 7), valores.length);
  }
  return { meses: meses.length, renglones };
}
