import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { cachear, catalogo, dominioVentas, hoyCaracas, idsPorCodigo } from "@/lib/compras/datosOdoo";
import { CORTE_ODOO, SQL_SIN_INTERCOMPANIA, rangoSmartbit } from "@/lib/smartbit";
import { contarDiasUtiles } from "@/lib/feriados";
import {
  COLOR_SEDE, GRIS, NOMBRE_SEDE, PALETA, agregarRuta, bloque, detalleDe, etiquetaMes, finDeMes, mesesHasta, r2, topConOtros, variacion,
  MAX_DETALLE, type Arbol, type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Ventas: USD sin IVA, notas de crédito restan, sin servicios ni
 * intercompañía. Desde el corte (abril 2026), Odoo (`dominioVentas` de
 * Compras, la regla de Reportes de BI). Antes, Smartbit en la MySQL con el
 * criterio de Recompra (lib/adminleads/recompra.ts): por sede y día, la
 * cabecera de factura del Excel "Ventas / Devoluciones"
 * (`ventas_smartbit_facturas`) si ese día está cargado y, si no, el histórico
 * por artículo (`ventas_smartbit`). Los productos, marcas y categorías de
 * Smartbit salen siempre del histórico por artículo (la cabecera no trae
 * productos).
 */

const MESES_SERIE = 24;

/**
 * Fuera del ranking de vendedores, no del total: "Asistente de Ventas",
 * Dameris y Hercilio Camacho no son vendedores (mismo criterio que el Agente
 * IA), "Local" y "Caja" son el mostrador de Smartbit, y Bladimir Vasquez dejó
 * de vender (VENDEDORES_RETIRADOS de lib/vendedores/retirados.ts, que la rama
 * Dario todavía no tiene). Por nombre, porque Smartbit no trae id.
 */
const NO_VENDEDORES = ["asistente", "dameris", "hercilio", "bladimir vasquez", "local", "caja"];
/**
 * Un cliente cuenta una vez aunque compre en dos sedes (en Odoo cada sede tiene
 * su contacto) o aparezca en Smartbit y en Odoo: por nombre sin mayúsculas,
 * acentos ni signos.
 */
const claveCliente = (nombre: string) =>
  nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

const noEsVendedor = (nombre: string) => {
  const n = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  return NO_VENDEDORES.some((x) => n.includes(x));
};

/* -------------------------------------------------------------------- Odoo */

async function agrupar(domain: any[], groupby: string[]): Promise<any[]> {
  const r = await callOdooRPC<any[]>("account.move.line", "read_group", [domain, ["balance:sum"], groupby], { lazy: false });
  if (!Array.isArray(r)) throw new Error("Odoo no respondió las ventas");
  return r;
}

const rango = (g: any, campo: string) => String(g.__range?.[campo]?.from || "");

/** Tramo de [desde, hasta] que cae en Odoo (desde el corte), o null. */
function rangoOdoo(desde: string, hasta: string): [string, string] | null {
  const ini = desde < CORTE_ODOO ? CORTE_ODOO : desde;
  return ini <= hasta ? [ini, hasta] : null;
}

/** Venta por mes "YYYY-MM" o por día "YYYY-MM-DD" de una sede en Odoo. */
function porFechaOdoo(cid: number, desde: string, hasta: string, por: "month" | "day"): Promise<Record<string, number>> {
  return cachear(`graf|vodoo|${cid}|${desde}|${hasta}|${por}`, async () => {
    const r = rangoOdoo(desde, hasta);
    if (!r) return {};
    const campo = `invoice_date:${por}`;
    const grupos = await agrupar([...(await dominioVentas(cid)), ["invoice_date", ">=", r[0]], ["invoice_date", "<=", r[1]]], [campo]);
    const out: Record<string, number> = {};
    for (const g of grupos) out[rango(g, campo).slice(0, por === "month" ? 7 : 10)] = -(Number(g.balance) || 0);
    return out;
  });
}

/* ---------------------------------------------------------------- Smartbit */

// Las ventas del mostrador ("Local") a clientes de afuera sí cuentan en el total,
// como en Odoo desde el corte; solo salen del ranking de vendedores (NO_VENDEDORES).
// Por eso aquí no va SQL_SIN_VENDEDOR_LOCAL, a diferencia de los dashboards de
// lib/smartbit.ts. Ojo: casi todo lo que factura "Local" en Valencia es a Supricom
// CCS (intercompañía) y eso sigue fuera por SQL_SIN_INTERCOMPANIA.
const SIN_GRUPO_FACTURAS = SQL_SIN_INTERCOMPANIA.replace("codigo_cliente", "rif");
const SIN_GRUPO_ARTICULOS = SQL_SIN_INTERCOMPANIA;

type FilaSmartbit = { cid: number; clave: string; venta: number; documentos: number };
type Clave = "mes" | "dia" | "cliente" | "vendedor";

const CLAVE_SQL: Record<Clave, (t: string) => string> = {
  mes: (t) => `DATE_FORMAT(${t}fecha, '%Y-%m')`,
  dia: (t) => `DATE_FORMAT(${t}fecha, '%Y-%m-%d')`,
  cliente: (t) => `COALESCE(NULLIF(TRIM(${t}cliente), ''), '(sin cliente)')`,
  vendedor: (t) => `COALESCE(NULLIF(TRIM(${t}vendedor), ''), 'Sin vendedor')`,
};

/**
 * Venta de Smartbit (antes del corte) agrupada por `clave`, por sede.
 * `documentos` = facturas (sin devoluciones) o, en los días sin cabecera,
 * compras (cliente + día).
 */
function ventasSmartbit(cids: number[], desde: string, hasta: string, clave: Clave): Promise<FilaSmartbit[]> {
  return cachear(`graf|vsb|${cids.join(",")}|${desde}|${hasta}|${clave}`, async () => {
    const r = rangoSmartbit(desde, hasta);
    if (!r) return [];
    const sedes = cids.map(() => "?").join(",");
    const fila = (x: any): FilaSmartbit => ({ cid: Number(x.cid), clave: String(x.clave), venta: Number(x.venta) || 0, documentos: Number(x.documentos) || 0 });
    let facturas: any[] = [];
    let conFacturas = true;
    try {
      facturas = (await query(
        `SELECT company_id AS cid, ${CLAVE_SQL[clave]("")} AS clave, SUM(venta) AS venta, SUM(venta > 0) AS documentos
           FROM ventas_smartbit_facturas
          WHERE company_id IN (${sedes}) AND fecha BETWEEN ? AND ? AND ${SIN_GRUPO_FACTURAS}
          GROUP BY company_id, clave`,
        [...cids, r[0], r[1]],
      )).rows;
    } catch (e: any) {
      // Sin la tabla (nadie subió el Excel) todo sale del histórico por artículo.
      console.error("[graficas] ventas_smartbit_facturas:", e?.message);
      conFacturas = false;
    }
    const articulos = (await query(
      `SELECT v.company_id AS cid, ${CLAVE_SQL[clave]("v.")} AS clave, SUM(v.venta) AS venta,
              COUNT(DISTINCT CASE WHEN v.venta > 0 THEN CONCAT(COALESCE(v.cliente, ''), '|', v.fecha) END) AS documentos
         FROM ventas_smartbit v
         ${conFacturas ? "LEFT JOIN (SELECT DISTINCT company_id, fecha FROM ventas_smartbit_facturas) d ON d.company_id = v.company_id AND d.fecha = v.fecha" : ""}
        WHERE v.company_id IN (${sedes}) AND v.fecha BETWEEN ? AND ? ${conFacturas ? "AND d.fecha IS NULL" : ""}
          AND ${SIN_GRUPO_ARTICULOS.replace(/\b(cliente|codigo_cliente|vendedor)\b/g, "v.$1")}
        GROUP BY v.company_id, clave`,
      [...cids, r[0], r[1]],
    )).rows;
    return [...facturas.map(fila), ...articulos.map(fila)];
  });
}

/** Línea de venta agrupada: quién compró, quién vendió y qué. */
type Linea = { cliente: string; vendedor: string; vendedorId: number | null; id: number | null; codigo: string; nombre: string; venta: number };

/** Líneas de Smartbit (histórico por artículo) antes del corte. */
function lineasSmartbit(cids: number[], desde: string, hasta: string): Promise<Linea[]> {
  return cachear(`graf|lsb|${cids.join(",")}|${desde}|${hasta}`, async () => {
    const r = rangoSmartbit(desde, hasta);
    if (!r) return [];
    const { rows } = await query(
      `SELECT ${CLAVE_SQL.cliente("")} AS cliente, ${CLAVE_SQL.vendedor("")} AS vendedor,
              codigo_articulo AS codigo, MAX(articulo) AS nombre, SUM(venta) AS venta
         FROM ventas_smartbit
        WHERE company_id IN (${cids.map(() => "?").join(",")}) AND fecha BETWEEN ? AND ? AND ${SIN_GRUPO_ARTICULOS}
        GROUP BY cliente, vendedor, codigo_articulo`,
      [...cids, r[0], r[1]],
    );
    return rows.map((x: any) => ({
      cliente: String(x.cliente), vendedor: String(x.vendedor), vendedorId: null, id: null,
      codigo: String(x.codigo || ""), nombre: String(x.nombre || x.codigo || "Sin nombre"), venta: Number(x.venta) || 0,
    }));
  });
}

/* ------------------------------------------------------------ por sede/mes */

/** Total por mes de cada sede: Smartbit antes del corte + Odoo desde el corte. */
async function seriePorSede(cids: number[], meses: string[]): Promise<Map<number, Record<string, number>>> {
  const desde = `${meses[0]}-01`;
  const hasta = finDeMes(meses[meses.length - 1]);
  const [sb, ...odoo] = await Promise.all([
    ventasSmartbit(cids, desde, hasta, "mes"),
    ...cids.map((c) => porFechaOdoo(c, desde, hasta, "month")),
  ]);
  const out = new Map<number, Record<string, number>>();
  cids.forEach((cid, i) => {
    const serie: Record<string, number> = Object.fromEntries(meses.map((m) => [m, odoo[i][m] || 0]));
    for (const f of sb) if (f.cid === cid && f.clave in serie) serie[f.clave] += f.venta;
    for (const m of meses) serie[m] = r2(serie[m]);
    out.set(cid, serie);
  });
  return out;
}

/** Venta por día de las sedes en el mes (Smartbit + Odoo). */
async function diario(cids: number[], mes: string): Promise<Map<string, number>> {
  const desde = `${mes}-01`;
  const hasta = finDeMes(mes);
  const [sb, ...odoo] = await Promise.all([
    ventasSmartbit(cids, desde, hasta, "dia"),
    ...cids.map((c) => porFechaOdoo(c, desde, hasta, "day")),
  ]);
  const out = new Map<string, number>();
  for (const f of sb) out.set(f.clave, (out.get(f.clave) || 0) + f.venta);
  for (const o of odoo) for (const [dia, v] of Object.entries(o)) out.set(dia, (out.get(dia) || 0) + v);
  return out;
}

type DetalleMes = {
  lineas: Linea[];
  /** Total por cliente y por vendedor (en Smartbit, de la cabecera donde la hay). */
  clientes: { nombre: string; venta: number }[];
  vendedores: { nombre: string; id: number | null; venta: number }[];
  documentos: number;
  /** Clientes con compra (en Odoo por id, en Smartbit por nombre). */
  compradores: Set<string>;
};

/** Lo del mes en Odoo de una sede: cada factura con sus productos. */
function detalleOdoo(cid: number, desde: string, hasta: string): Promise<DetalleMes> {
  return cachear(`graf|vdet|${cid}|${desde}|${hasta}`, async () => {
    const out: DetalleMes = { lineas: [], clientes: [], vendedores: [], documentos: 0, compradores: new Set() };
    const r = rangoOdoo(desde, hasta);
    if (!r) return out;
    const dom = [...(await dominioVentas(cid)), ["invoice_date", ">=", r[0]], ["invoice_date", "<=", r[1]]];
    const grupos = await agrupar(dom, ["move_id", "product_id"]);
    const ids = [...new Set(grupos.map((g) => g.move_id?.[0]).filter(Boolean))] as number[];
    const info = new Map<number, any>();
    for (let i = 0; i < ids.length; i += 2000) {
      const lote = await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 2000), ["move_type", "commercial_partner_id", "invoice_user_id"]]);
      if (!Array.isArray(lote)) throw new Error("Odoo no respondió las facturas");
      for (const m of lote) info.set(m.id, m);
    }
    const clientes = new Map<string, number>();
    const vendedores = new Map<string, { id: number | null; venta: number }>();
    for (const g of grupos) {
      if (!g.move_id) continue;
      const m = info.get(g.move_id[0]) || {};
      const venta = -(Number(g.balance) || 0);
      const cliente = m.commercial_partner_id ? String(m.commercial_partner_id[1] || "") : "(sin cliente)";
      const vendedor = m.invoice_user_id ? String(m.invoice_user_id[1] || "") : "Sin vendedor";
      const vendedorId = m.invoice_user_id ? Number(m.invoice_user_id[0]) : null;
      clientes.set(cliente, (clientes.get(cliente) || 0) + venta);
      const v = vendedores.get(vendedor) ?? { id: vendedorId, venta: 0 };
      v.venta += venta;
      vendedores.set(vendedor, v);
      if (g.product_id) {
        out.lineas.push({ cliente, vendedor, vendedorId, id: g.product_id[0], codigo: "", nombre: String(g.product_id[1] || ""), venta });
      }
    }
    for (const id of ids) {
      const m = info.get(id);
      if (!m || m.move_type === "out_refund") continue;
      out.documentos++;
      if (m.commercial_partner_id) out.compradores.add(claveCliente(String(m.commercial_partner_id[1] || "")));
    }
    out.clientes = [...clientes].map(([nombre, venta]) => ({ nombre, venta }));
    out.vendedores = [...vendedores].map(([nombre, v]) => ({ nombre, ...v }));
    return out;
  });
}

/** Lo del mes en Smartbit de las sedes. */
async function detalleSmartbit(cids: number[], desde: string, hasta: string): Promise<DetalleMes> {
  const [clientes, vendedores, lineas] = await Promise.all([
    ventasSmartbit(cids, desde, hasta, "cliente"),
    ventasSmartbit(cids, desde, hasta, "vendedor"),
    lineasSmartbit(cids, desde, hasta),
  ]);
  return {
    lineas,
    clientes: clientes.map((f) => ({ nombre: f.clave, venta: f.venta })),
    vendedores: vendedores.map((f) => ({ nombre: f.clave, id: null, venta: f.venta })),
    documentos: clientes.reduce((s, f) => s + f.documentos, 0),
    compradores: new Set(clientes.filter((f) => f.venta > 0).map((f) => claveCliente(f.clave))),
  };
}

const suma = (series: Map<number, Record<string, number>>, mes: string) =>
  [...series.values()].reduce((s, x) => s + (x[mes] || 0), 0);

export async function graficasVentas(cids: number[], sede: string, mes: string): Promise<DatosArea> {
  const avisos: string[] = [];
  const kpis: Kpi[] = [];
  const graficas: Grafica[] = [];
  const hoy = hoyCaracas();
  const mesAnterior = mesesHasta(mes, 2)[0];
  const enCurso = hoy.slice(0, 7) === mes;

  // Serie de 24 meses + los 12 de antes para comparar contra el año anterior.
  const meses = mesesHasta(mes, MESES_SERIE);
  const mesesAnio = mesesHasta(mes, 12);
  const mesesPrevios = mesesHasta(mesesHasta(mes, 13)[0], 12);
  const todos = [...new Set([...mesesPrevios, ...meses])].sort();

  const [series, diaActual, diaAnterior] = await Promise.all([
    bloque(avisos, "la venta mensual", () => seriePorSede(cids, todos)),
    bloque(avisos, "la venta diaria del mes", () => diario(cids, mes)),
    bloque(avisos, "la venta diaria del mes anterior", () => diario(cids, mesAnterior)),
  ]);

  if (series) {
    const venta = suma(series, mes);
    const ventaAnt = suma(series, mesAnterior);
    const ventaAnio = suma(series, mesesPrevios[mesesPrevios.length - 1]);
    kpis.push({ id: "venta_mes", etiqueta: "Venta del mes", valor: r2(venta), formato: "usd", delta: variacion(venta, ventaAnt), referencia: "vs mes anterior" });
    kpis.push({
      id: "venta_anio", etiqueta: "Crecimiento anual", valor: variacion(venta, ventaAnio), formato: "pct",
      nota: `contra ${etiquetaMes(mesesPrevios[mesesPrevios.length - 1])}`,
    });
    const acumulado = mesesAnio.filter((m) => m.slice(0, 4) === mes.slice(0, 4)).reduce((s, m) => s + suma(series, m), 0);
    const acumuladoAnt = mesesPrevios.filter((m) => m.slice(0, 4) === String(Number(mes.slice(0, 4)) - 1) && m.slice(5) <= mes.slice(5))
      .reduce((s, m) => s + suma(series, m), 0);
    kpis.push({ id: "venta_ytd", etiqueta: `Acumulado ${mes.slice(0, 4)}`, valor: r2(acumulado), formato: "usd", delta: variacion(acumulado, acumuladoAnt), referencia: "vs mismo período del año pasado" });

    if (enCurso) {
      const [a, m] = mes.split("-").map(Number);
      const inicio = new Date(a, m - 1, 1);
      const transcurridos = contarDiasUtiles(inicio, new Date(`${hoy}T12:00:00`));
      const totales = contarDiasUtiles(inicio, new Date(a, m, 0));
      // El último día hábil la proyección ya es la venta: no se muestra.
      if (transcurridos > 0 && transcurridos < totales) {
        kpis.push({ id: "proyeccion", etiqueta: "Proyección de cierre", valor: r2((venta / transcurridos) * totales), formato: "usd", delta: variacion((venta / transcurridos) * totales, ventaAnt), referencia: "vs mes anterior", nota: `${transcurridos} de ${totales} días hábiles` });
      }
    }

    graficas.push({
      id: "venta_mensual",
      titulo: "Venta mensual por sede",
      descripcion: `Últimos ${MESES_SERIE} meses. Antes de abril 2026, Smartbit; desde ahí, Odoo.`,
      tipo: "apiladas",
      formato: "usd",
      ancho: 2,
      datos: meses.map((m) => ({ etiqueta: etiquetaMes(m), ...Object.fromEntries(cids.map((c) => [String(c), series.get(c)?.[m] ?? 0])) })),
      series: cids.map((c) => ({ clave: String(c), etiqueta: NOMBRE_SEDE[c], color: COLOR_SEDE[c] })),
    });
    graficas.push({
      id: "venta_vs_anio",
      titulo: "Este año contra el anterior",
      descripcion: "Cada mes contra el mismo mes doce meses antes.",
      tipo: "lineas",
      formato: "usd",
      datos: mesesAnio.map((m, i) => ({ etiqueta: etiquetaMes(m).slice(0, 3), actual: r2(suma(series, m)), anterior: r2(suma(series, mesesPrevios[i])) })),
      series: [
        { clave: "actual", etiqueta: "Últimos 12 meses", color: PALETA[0] },
        { clave: "anterior", etiqueta: "12 meses antes", color: GRIS, punteada: true },
      ],
    });
    if (cids.length > 1) {
      graficas.push({
        id: "venta_participacion",
        titulo: "Participación por sede",
        descripcion: `Venta de ${etiquetaMes(mes)}.`,
        tipo: "dona",
        formato: "usd",
        datos: cids.map((c) => ({ etiqueta: NOMBRE_SEDE[c], valor: series.get(c)?.[mes] ?? 0 })),
        series: [{ clave: "valor", etiqueta: "Venta", color: PALETA[0] }],
        colorPorFila: cids.map((c) => COLOR_SEDE[c]),
      });
    }
  }

  if (diaActual && diaAnterior) {
    const dias = Number(finDeMes(mes).slice(8));
    const diasAnt = Number(finDeMes(mesAnterior).slice(8));
    let acum = 0;
    let acumAnt = 0;
    const datos = [];
    for (let d = 1; d <= 31; d++) {
      const dd = String(d).padStart(2, "0");
      acumAnt += diaAnterior.get(`${mesAnterior}-${dd}`) || 0;
      const fecha = `${mes}-${dd}`;
      acum += diaActual.get(fecha) || 0;
      datos.push({
        etiqueta: String(d),
        actual: d <= dias && fecha <= hoy ? r2(acum) : null,
        anterior: d <= diasAnt ? r2(acumAnt) : null,
      });
    }
    graficas.push({
      id: "venta_ritmo",
      titulo: "Ritmo del mes",
      descripcion: "Venta acumulada día a día contra el mes anterior.",
      tipo: "area",
      formato: "usd",
      datos,
      series: [
        { clave: "actual", etiqueta: etiquetaMes(mes), color: PALETA[0] },
        { clave: "anterior", etiqueta: etiquetaMes(mesAnterior), color: GRIS, punteada: true },
      ],
    });
  }

  const desde = `${mes}-01`;
  const hasta = finDeMes(mes);
  const detalles = await bloque(avisos, "el detalle del mes", async () => {
    const [cat, porCodigo, sb, ...odoo] = await Promise.all([
      catalogo(),
      idsPorCodigo(),
      detalleSmartbit(cids, desde, hasta),
      ...cids.map((c) => detalleOdoo(c, desde, hasta)),
    ]);
    return { cat, porCodigo, partes: [sb, ...odoo] };
  });
  if (detalles) {
    const { cat, porCodigo, partes } = detalles;
    const marca = new Map<string, number>();
    const categoria = new Map<string, number>();
    const producto = new Map<string, number>();
    const cliente = new Map<string, number>();
    const vendedor = new Map<string, number>();
    // Lo que compone cada barra, para el clic: marca/categoría/cliente → productos,
    // vendedor → clientes → productos, producto → clientes.
    const arbolMarca: Arbol = new Map();
    const arbolCategoria: Arbol = new Map();
    const arbolCliente: Arbol = new Map();
    const arbolVendedor: Arbol = new Map();
    const arbolProducto: Arbol = new Map();
    const compradores = new Set<string>();
    let documentos = 0;
    const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
    for (const d of partes) {
      for (const l of d.lineas) {
        // Smartbit trae el código: se busca en Odoo para su marca y categoría.
        const c = cat.get(l.id ?? porCodigo.get(l.codigo.trim().toUpperCase()) ?? -1);
        const m = c?.marca || "SIN MARCA";
        const k = c?.categoria || "Sin categoría";
        const p = c ? `${c.codigo} · ${c.nombre}` : `${l.codigo ? `${l.codigo} · ` : ""}${l.nombre}`;
        sumar(marca, m, l.venta);
        sumar(categoria, k, l.venta);
        sumar(producto, p, l.venta);
        agregarRuta(arbolMarca, [m, p], l.venta);
        agregarRuta(arbolCategoria, [k, p], l.venta);
        agregarRuta(arbolCliente, [l.cliente, p], l.venta);
        if (!noEsVendedor(l.vendedor)) agregarRuta(arbolVendedor, [l.vendedor, l.cliente, p], l.venta);
        agregarRuta(arbolProducto, [p, l.cliente], l.venta);
      }
      for (const x of d.clientes) sumar(cliente, x.nombre, x.venta);
      // El ranking es de vendedores: sin "Asistente de Ventas", Dameris ni los retirados (su venta sigue en el total).
      for (const x of d.vendedores) if (!noEsVendedor(x.nombre)) sumar(vendedor, x.nombre, x.venta);
      for (const x of d.compradores) compradores.add(x);
      documentos += d.documentos;
    }
    const totalMes = [...cliente.values()].reduce((s, v) => s + v, 0);
    kpis.push({ id: "clientes", etiqueta: "Clientes que compraron", valor: compradores.size, formato: "num" });
    kpis.push({ id: "facturas", etiqueta: "Facturas", valor: documentos, formato: "num" });
    kpis.push({ id: "ticket", etiqueta: "Ticket promedio", valor: documentos ? r2(totalMes / documentos) : null, formato: "usd" });
    if (desde < CORTE_ODOO) {
      avisos.push("Antes de abril 2026 los datos son de Smartbit. Las facturas salen del Excel «Ventas / Devoluciones» donde está cargado y, si no, cada cliente por día cuenta como una compra; marcas y categorías se buscan en Odoo por el código del artículo.");
    }

    const aFilas = (m: Map<string, number>) => [...m].map(([etiqueta, valor]) => ({ etiqueta, valor }));
    const productos = [{ que: "Productos", max: MAX_DETALLE }];
    const barra = (
      id: string, titulo: string, filas: { etiqueta: string; valor: number }[], color: string,
      arbol: Arbol, niveles: { que: string; max: number }[], otros?: string, descripcion?: string,
    ): Grafica => ({
      id, titulo, descripcion, tipo: "barras_h", formato: "usd", datos: filas,
      series: [{ clave: "valor", etiqueta: "Venta", color }],
      detalle: detalleDe(filas, arbol, niveles, otros),
    });
    graficas.push(barra("venta_marca", "Venta por marca", topConOtros(aFilas(marca), 12, "Otras marcas"), PALETA[0], arbolMarca, productos, "Marcas", `${etiquetaMes(mes)}, sin IVA.`));
    graficas.push(barra("venta_categoria", "Venta por categoría", topConOtros(aFilas(categoria), 12, "Otras categorías"), PALETA[2], arbolCategoria, productos, "Categorías"));
    graficas.push(barra("venta_clientes", "Top 10 clientes", topConOtros(aFilas(cliente), 10, "Resto de clientes").slice(0, 10), PALETA[6], arbolCliente, productos));
    // Vendedor → sus clientes → lo que le compró cada uno (menos filas por nivel: son dos niveles).
    graficas.push(barra("venta_vendedor", "Venta por vendedor", topConOtros(aFilas(vendedor), 15, "Otros vendedores"), PALETA[1], arbolVendedor,
      [{ que: "Clientes", max: 25 }, { que: "Productos", max: 15 }], "Vendedores",
      "Sin Asistente de Ventas, Dameris, Hercilio ni vendedores retirados."));
    graficas.push({ ...barra("venta_productos", "Top 15 productos", topConOtros(aFilas(producto), 15).slice(0, 15), PALETA[0], arbolProducto, [{ que: "Clientes", max: MAX_DETALLE }]), ancho: 2 });
  }

  return { area: "ventas", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
