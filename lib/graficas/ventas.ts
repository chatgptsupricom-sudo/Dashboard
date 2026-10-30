import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { cachear, catalogo, dominioVentas, hoyCaracas, idsPorCodigo } from "@/lib/compras/datosOdoo";
import { CORTE_ODOO, SQL_SIN_INTERCOMPANIA, SQL_SIN_VENDEDOR_LOCAL, rangoSmartbit } from "@/lib/smartbit";
import { contarDiasUtiles } from "@/lib/feriados";
import {
  COLOR_SEDE, GRIS, NOMBRE_SEDE, PALETA, bloque, etiquetaMes, finDeMes, mesesHasta, r2, topConOtros, variacion,
  type DatosArea, type Grafica, type Kpi,
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

const SIN_GRUPO_FACTURAS = `${SQL_SIN_INTERCOMPANIA.replace("codigo_cliente", "rif")} AND ${SQL_SIN_VENDEDOR_LOCAL}`;
const SIN_GRUPO_ARTICULOS = `${SQL_SIN_INTERCOMPANIA} AND ${SQL_SIN_VENDEDOR_LOCAL}`;

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

/** Productos de Smartbit (histórico por artículo) antes del corte. */
function productosSmartbit(cids: number[], desde: string, hasta: string): Promise<{ codigo: string; nombre: string; venta: number }[]> {
  return cachear(`graf|psb|${cids.join(",")}|${desde}|${hasta}`, async () => {
    const r = rangoSmartbit(desde, hasta);
    if (!r) return [];
    const { rows } = await query(
      `SELECT codigo_articulo AS codigo, MAX(articulo) AS nombre, SUM(venta) AS venta
         FROM ventas_smartbit
        WHERE company_id IN (${cids.map(() => "?").join(",")}) AND fecha BETWEEN ? AND ? AND ${SIN_GRUPO_ARTICULOS}
        GROUP BY codigo_articulo`,
      [...cids, r[0], r[1]],
    );
    return rows.map((x: any) => ({ codigo: String(x.codigo || ""), nombre: String(x.nombre || x.codigo || "Sin nombre"), venta: Number(x.venta) || 0 }));
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
  /** id de Odoo, o null con el código de Smartbit. */
  productos: { id: number | null; codigo: string; nombre: string; venta: number }[];
  clientes: { nombre: string; venta: number }[];
  vendedores: { nombre: string; venta: number }[];
  documentos: number;
  /** Clientes con compra (en Odoo por id, en Smartbit por nombre). */
  compradores: Set<string>;
};

/** Lo del mes en Odoo de una sede: por producto y por factura (cliente y vendedor). */
function detalleOdoo(cid: number, desde: string, hasta: string): Promise<DetalleMes> {
  return cachear(`graf|vdet|${cid}|${desde}|${hasta}`, async () => {
    const out: DetalleMes = { productos: [], clientes: [], vendedores: [], documentos: 0, compradores: new Set() };
    const r = rangoOdoo(desde, hasta);
    if (!r) return out;
    const dom = [...(await dominioVentas(cid)), ["invoice_date", ">=", r[0]], ["invoice_date", "<=", r[1]]];
    const [prods, movs] = await Promise.all([agrupar(dom, ["product_id"]), agrupar(dom, ["move_id"])]);
    const ids = movs.map((g) => g.move_id?.[0]).filter(Boolean) as number[];
    const info = new Map<number, any>();
    for (let i = 0; i < ids.length; i += 2000) {
      const lote = await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 2000), ["move_type", "commercial_partner_id", "invoice_user_id"]]);
      if (!Array.isArray(lote)) throw new Error("Odoo no respondió las facturas");
      for (const m of lote) info.set(m.id, m);
    }
    const clientes = new Map<string, number>();
    const vendedores = new Map<string, number>();
    for (const g of movs) {
      if (!g.move_id) continue;
      const m = info.get(g.move_id[0]) || {};
      const venta = -(Number(g.balance) || 0);
      const cliente = m.commercial_partner_id ? String(m.commercial_partner_id[1] || "") : "(sin cliente)";
      const vendedor = m.invoice_user_id ? String(m.invoice_user_id[1] || "") : "Sin vendedor";
      clientes.set(cliente, (clientes.get(cliente) || 0) + venta);
      vendedores.set(vendedor, (vendedores.get(vendedor) || 0) + venta);
      if (m.move_type !== "out_refund") {
        out.documentos++;
        if (m.commercial_partner_id) out.compradores.add(`odoo:${m.commercial_partner_id[0]}`);
      }
    }
    out.productos = prods.filter((g) => g.product_id).map((g) => ({ id: g.product_id[0], codigo: "", nombre: String(g.product_id[1] || ""), venta: -(Number(g.balance) || 0) }));
    out.clientes = [...clientes].map(([nombre, venta]) => ({ nombre, venta }));
    out.vendedores = [...vendedores].map(([nombre, venta]) => ({ nombre, venta }));
    return out;
  });
}

/** Lo del mes en Smartbit de las sedes. */
async function detalleSmartbit(cids: number[], desde: string, hasta: string): Promise<DetalleMes> {
  const [clientes, vendedores, productos] = await Promise.all([
    ventasSmartbit(cids, desde, hasta, "cliente"),
    ventasSmartbit(cids, desde, hasta, "vendedor"),
    productosSmartbit(cids, desde, hasta),
  ]);
  return {
    productos: productos.map((p) => ({ id: null, ...p })),
    clientes: clientes.map((f) => ({ nombre: f.clave, venta: f.venta })),
    vendedores: vendedores.map((f) => ({ nombre: f.clave, venta: f.venta })),
    documentos: clientes.reduce((s, f) => s + f.documentos, 0),
    compradores: new Set(clientes.filter((f) => f.venta > 0).map((f) => `sb:${f.clave.toLowerCase()}`)),
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
      if (transcurridos > 0) {
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
    const compradores = new Set<string>();
    let documentos = 0;
    const sumar = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) || 0) + v);
    for (const d of partes) {
      for (const p of d.productos) {
        // Smartbit trae el código: se busca en Odoo para su marca y categoría.
        const c = cat.get(p.id ?? porCodigo.get(p.codigo.trim().toUpperCase()) ?? -1);
        sumar(marca, c?.marca || "SIN MARCA", p.venta);
        sumar(categoria, c?.categoria || "Sin categoría", p.venta);
        sumar(producto, c ? `${c.codigo} · ${c.nombre}` : `${p.codigo ? `${p.codigo} · ` : ""}${p.nombre}`, p.venta);
      }
      for (const x of d.clientes) sumar(cliente, x.nombre, x.venta);
      for (const x of d.vendedores) sumar(vendedor, x.nombre, x.venta);
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
    const barra = (id: string, titulo: string, filas: { etiqueta: string; valor: number }[], color: string, descripcion?: string): Grafica => ({
      id, titulo, descripcion, tipo: "barras_h", formato: "usd", datos: filas,
      series: [{ clave: "valor", etiqueta: "Venta", color }],
    });
    graficas.push(barra("venta_marca", "Venta por marca", topConOtros(aFilas(marca), 12, "Otras marcas"), PALETA[0], `${etiquetaMes(mes)}, sin IVA.`));
    graficas.push(barra("venta_categoria", "Venta por categoría", topConOtros(aFilas(categoria), 12, "Otras categorías"), PALETA[2]));
    graficas.push(barra("venta_clientes", "Top 10 clientes", topConOtros(aFilas(cliente), 10, "Resto de clientes").slice(0, 10), PALETA[6]));
    graficas.push(barra("venta_vendedor", "Venta por vendedor", topConOtros(aFilas(vendedor), 15, "Otros vendedores"), PALETA[1]));
    graficas.push({ ...barra("venta_productos", "Top 15 productos", topConOtros(aFilas(producto), 15).slice(0, 15), PALETA[0]), ancho: 2 });
  }

  return { area: "ventas", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
