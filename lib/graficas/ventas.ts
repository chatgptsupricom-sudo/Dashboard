import { callOdooRPC } from "@/lib/odoo";
import { cachear, catalogo, dominioVentas, hoyCaracas } from "@/lib/compras/datosOdoo";
import { CORTE_ODOO, mensualSmartbit } from "@/lib/smartbit";
import { contarDiasUtiles } from "@/lib/feriados";
import {
  COLOR_SEDE, GRIS, NOMBRE_SEDE, PALETA, bloque, etiquetaMes, finDeMes, mesesHasta, r2, topConOtros, variacion,
  type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Ventas: USD sin IVA, notas de crédito restan, sin servicios ni
 * intercompañía (`dominioVentas` de Compras, la misma regla de Reportes de
 * BI). Antes del corte (abril 2026) solo hay el total mensual de Smartbit.
 */

const MESES_SERIE = 24;

async function agrupar(domain: any[], groupby: string[]): Promise<any[]> {
  const r = await callOdooRPC<any[]>("account.move.line", "read_group", [domain, ["balance:sum"], groupby], { lazy: false });
  if (!Array.isArray(r)) throw new Error("Odoo no respondió las ventas");
  return r;
}

const rango = (g: any, campo: string) => String(g.__range?.[campo]?.from || "");

/** Venta por mes "YYYY-MM" de una sede, Odoo desde el corte. */
function mensualOdoo(cid: number, desde: string, hasta: string): Promise<Record<string, number>> {
  const ini = desde < CORTE_ODOO ? CORTE_ODOO : desde;
  return cachear(`graf|vmes|${cid}|${ini}|${hasta}`, async () => {
    if (ini > hasta) return {};
    const grupos = await agrupar(
      [...(await dominioVentas(cid)), ["invoice_date", ">=", ini], ["invoice_date", "<=", hasta]],
      ["invoice_date:month"],
    );
    const out: Record<string, number> = {};
    for (const g of grupos) out[rango(g, "invoice_date:month").slice(0, 7)] = -(Number(g.balance) || 0);
    return out;
  });
}

/** Venta por día "YYYY-MM-DD" de las sedes en el mes. */
async function diarioOdoo(cids: number[], mes: string): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (finDeMes(mes) < CORTE_ODOO) return out;
  await Promise.all(cids.map(async (cid) => {
    const grupos = await cachear(`graf|vdia|${cid}|${mes}`, async () =>
      agrupar([...(await dominioVentas(cid)), ["invoice_date", ">=", `${mes}-01`], ["invoice_date", "<=", finDeMes(mes)]], ["invoice_date:day"]),
    );
    for (const g of grupos) {
      const dia = rango(g, "invoice_date:day").slice(0, 10);
      out.set(dia, (out.get(dia) || 0) - (Number(g.balance) || 0));
    }
  }));
  return out;
}

type DetalleMes = {
  porProducto: { id: number; nombre: string; venta: number }[];
  facturas: { id: number; venta: number; tipo: string; clienteId: number; cliente: string; vendedor: string }[];
};

/** Lo del mes por producto y por factura (con cliente y vendedor), de una sede. */
function detalleMes(cid: number, mes: string): Promise<DetalleMes> {
  return cachear(`graf|vdet|${cid}|${mes}`, async () => {
    const dom = [...(await dominioVentas(cid)), ["invoice_date", ">=", `${mes}-01`], ["invoice_date", "<=", finDeMes(mes)]];
    const [prods, movs] = await Promise.all([agrupar(dom, ["product_id"]), agrupar(dom, ["move_id"])]);
    const ids = movs.map((g) => g.move_id?.[0]).filter(Boolean) as number[];
    const info = new Map<number, any>();
    for (let i = 0; i < ids.length; i += 2000) {
      const r = await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 2000), ["move_type", "commercial_partner_id", "invoice_user_id"]]);
      if (!Array.isArray(r)) throw new Error("Odoo no respondió las facturas");
      for (const m of r) info.set(m.id, m);
    }
    return {
      porProducto: prods
        .filter((g) => g.product_id)
        .map((g) => ({ id: g.product_id[0], nombre: String(g.product_id[1] || ""), venta: -(Number(g.balance) || 0) })),
      facturas: movs.filter((g) => g.move_id).map((g) => {
        const m = info.get(g.move_id[0]) || {};
        return {
          id: g.move_id[0],
          venta: -(Number(g.balance) || 0),
          tipo: m.move_type || "",
          clienteId: m.commercial_partner_id ? m.commercial_partner_id[0] : 0,
          cliente: m.commercial_partner_id ? String(m.commercial_partner_id[1] || "") : "(sin cliente)",
          vendedor: m.invoice_user_id ? String(m.invoice_user_id[1] || "") : "Sin vendedor",
        };
      }),
    };
  });
}

/** Total por mes de cada sede: Smartbit antes del corte + Odoo desde el corte. */
async function seriePorSede(cids: number[], meses: string[]): Promise<Map<number, Record<string, number>>> {
  const desde = `${meses[0]}-01`;
  const hasta = finDeMes(meses[meses.length - 1]);
  const out = new Map<number, Record<string, number>>();
  await Promise.all(cids.map(async (cid) => {
    const [sb, odoo] = await Promise.all([mensualSmartbit([cid], desde, hasta), mensualOdoo(cid, desde, hasta)]);
    const serie: Record<string, number> = {};
    for (const m of meses) serie[m] = r2((sb[m] || 0) + (odoo[m] || 0));
    out.set(cid, serie);
  }));
  return out;
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
    bloque(avisos, "la venta diaria del mes", () => diarioOdoo(cids, mes)),
    bloque(avisos, "la venta diaria del mes anterior", () => diarioOdoo(cids, mesAnterior)),
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
      const ayer = new Date(`${hoy}T12:00:00`);
      const transcurridos = contarDiasUtiles(inicio, ayer);
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
        anterior: d <= Number(finDeMes(mesAnterior).slice(8)) ? r2(acumAnt) : null,
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

  if (finDeMes(mes) < CORTE_ODOO) {
    avisos.push("Antes de abril 2026 solo está el total mensual de Smartbit: el detalle por marca, cliente y vendedor sale desde abril 2026.");
  } else {
    const detalles = await bloque(avisos, "el detalle del mes", async () => {
      const [cat, ...porSede] = await Promise.all([catalogo(), ...cids.map((c) => detalleMes(c, mes))]);
      return { cat, porSede };
    });
    if (detalles) {
      const { cat, porSede } = detalles;
      const marca = new Map<string, number>();
      const categoria = new Map<string, number>();
      const producto = new Map<string, number>();
      for (const d of porSede) {
        for (const p of d.porProducto) {
          const c = cat.get(p.id);
          const nombre = c ? `${c.codigo} · ${c.nombre}` : p.nombre;
          marca.set(c?.marca || "SIN MARCA", (marca.get(c?.marca || "SIN MARCA") || 0) + p.venta);
          categoria.set(c?.categoria || "Sin categoría", (categoria.get(c?.categoria || "Sin categoría") || 0) + p.venta);
          producto.set(nombre, (producto.get(nombre) || 0) + p.venta);
        }
      }
      const cliente = new Map<string, number>();
      const vendedor = new Map<string, number>();
      const clientes = new Set<number>();
      let facturas = 0;
      for (const d of porSede) {
        for (const f of d.facturas) {
          cliente.set(f.cliente, (cliente.get(f.cliente) || 0) + f.venta);
          vendedor.set(f.vendedor, (vendedor.get(f.vendedor) || 0) + f.venta);
          if (f.tipo !== "out_refund") {
            facturas++;
            if (f.clienteId) clientes.add(f.clienteId);
          }
        }
      }
      const totalMes = [...marca.values()].reduce((s, v) => s + v, 0);
      kpis.push({ id: "clientes", etiqueta: "Clientes que compraron", valor: clientes.size, formato: "num" });
      kpis.push({ id: "facturas", etiqueta: "Facturas", valor: facturas, formato: "num" });
      kpis.push({ id: "ticket", etiqueta: "Ticket promedio", valor: facturas ? r2(totalMes / facturas) : null, formato: "usd" });

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
  }

  return { area: "ventas", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
