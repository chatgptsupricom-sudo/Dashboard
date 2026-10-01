import {
  almacenables,
  cachear,
  costos,
  diaCaracas,
  diaLocal,
  diasEntre,
  hoyCaracas,
  inicioDiaUtc,
  leerTodo,
  sumarDias,
  ultimaVenta,
  type ProductoCompras,
} from "@/lib/compras/datosOdoo";
import {
  historialStock,
  recepcionesPorDia,
  sumaEntre,
  ultimoDiaConVenta,
  ventasPorDia,
  type HistorialStock,
} from "@/lib/compras/historial";
import { callOdooRPC } from "@/lib/odoo";

/**
 * KPIs de Compras del Stoplight, semana por semana, y el detalle de cada uno
 * (modal). La grilla y el modal salen de la misma lectura (`baseCompras`),
 * así no se contradicen.
 *
 * Cada semana se mide a su cierre (el último día, o hoy si está en curso)
 * con el stock de ESE día, reconstruido desde los movimientos de Odoo. Antes
 * todas las semanas usaban el stock de hoy, la variación de costo era un solo
 * número repetido y la caché no distinguía el mes: un mes pasado mostraba los
 * datos del mes actual.
 *
 * 1. Variación del costo de compra: lo que se pagó en la semana contra el
 *    precio promedio ponderado de lo comprado en los 90 días previos al mes.
 *    (base − pagado) ÷ base, ponderado por lo comprado: positivo = se compró
 *    más barato.
 * 2. Rotación saludable (sell-through a 90 días): unidades vendidas en los 90
 *    días al cierre ÷ (esas unidades + stock al cierre).
 * 3. % de quiebre: SKU-días sin stock ÷ SKU-días de productos con venta en los
 *    90 días al cierre.
 * 4. Inventario con más de 90 días: valor del stock que no entró en los
 *    últimos 90 días (FIFO: lo que queda es lo último que se recibió) ÷ valor
 *    del stock, a costo.
 *
 * Ventas con las reglas de Compras (sin COGS, notas de crédito restan, sin
 * intercompañía); stock y recepciones del almacén principal.
 */

export interface ComprasKpisRaw {
  semanaVarCosto: (number | null)[];
  semanaRotacion: (number | null)[];
  semanaQuiebre: (number | null)[];
  semanaInv90: (number | null)[];
}

interface SemanaIso {
  ini: string;
  fin: string;
  /** Día al que se mide: el fin, o hoy si la semana está en curso. null = semana futura. */
  corte: string | null;
}

interface LineaCompra {
  productoId: number;
  dia: string;
  /** Recibido + por recibir: una orden recibida y devuelta al proveedor pesa 0. */
  cantidad: number;
  /** Precio unitario neto de descuento (price_subtotal ÷ product_qty), en USD. */
  precio: number;
}

interface BaseCompras {
  hoy: string;
  semanas: SemanaIso[];
  productos: ProductoCompras[];
  costo: Map<number, number>;
  stock: HistorialStock;
  ventas: Map<number, Map<string, number>>;
  recepciones: Map<number, Map<string, number>>;
  compras: LineaCompra[];
  /** Precio base por producto: promedio ponderado de los 90 días previos al mes. */
  precioBase: Map<number, number>;
  ultima: Map<number, string>;
}

const VENTANA = 90;

/** Líneas de compra confirmadas de la sede con su cantidad efectiva. */
async function leerCompras(companyId: number, desde: string, hasta: string): Promise<LineaCompra[]> {
  const lineas = await leerTodo(
    "purchase.order.line",
    [
      ["state", "=", "purchase"],
      ["company_id", "=", companyId],
      ["product_id", "!=", false],
      ["product_id.type", "!=", "service"],
      ["order_id.date_approve", ">=", inicioDiaUtc(desde)],
      ["order_id.date_approve", "<", inicioDiaUtc(sumarDias(hasta, 1))],
    ],
    ["product_id", "product_qty", "qty_received", "price_subtotal", "date_approve"],
  );
  const pendiente = new Map<number, number>();
  for (let i = 0; i < lineas.length; i += 2000) {
    const g = await callOdooRPC<any[]>("stock.move", "read_group", [
      [["purchase_line_id", "in", lineas.slice(i, i + 2000).map((l) => l.id)], ["state", "not in", ["draft", "done", "cancel"]]],
      ["product_uom_qty:sum"],
      ["purchase_line_id"],
    ], { lazy: false });
    if (!Array.isArray(g)) throw new Error("Odoo no respondió las recepciones pendientes");
    for (const x of g) if (x.purchase_line_id) pendiente.set(x.purchase_line_id[0], Number(x.product_uom_qty) || 0);
  }
  const out: LineaCompra[] = [];
  for (const l of lineas) {
    const pedida = Number(l.product_qty) || 0;
    const cantidad = (Number(l.qty_received) || 0) + (pendiente.get(l.id) ?? 0);
    if (pedida <= 0 || cantidad <= 0 || !l.date_approve) continue;
    const precio = (Number(l.price_subtotal) || 0) / pedida;
    if (precio <= 0) continue;
    out.push({ productoId: l.product_id[0], dia: diaCaracas(l.date_approve), cantidad, precio });
  }
  return out;
}

function baseCompras(companyId: number, semanasLocales: { inicio: Date; fin: Date }[]): Promise<BaseCompras> {
  const hoy = hoyCaracas();
  const semanas: SemanaIso[] = semanasLocales.map((s) => {
    const ini = diaLocal(s.inicio);
    const fin = diaLocal(s.fin);
    return { ini, fin, corte: ini > hoy ? null : fin < hoy ? fin : hoy };
  });
  const primero = semanas[0]?.ini ?? hoy;
  const ultimo = [...semanas].reverse().find((s) => s.corte)?.corte ?? hoy;
  const llave = `stoplight|${companyId}|${primero}|${semanas[semanas.length - 1]?.fin}|${hoy}`;

  return cachear(llave, async () => {
    const [productos, costo, stock, ventas, recepciones, compras, ultima] = await Promise.all([
      almacenables(),
      costos(companyId),
      historialStock(companyId, primero, hoy),
      ventasPorDia(companyId, sumarDias(primero, -120), ultimo).then((v) => v.porProducto),
      recepcionesPorDia(companyId, sumarDias(primero, -181)),
      leerCompras(companyId, sumarDias(primero, -VENTANA), ultimo),
      ultimaVenta(companyId),
    ]);

    const acumulado = new Map<number, { monto: number; cantidad: number }>();
    for (const l of compras) {
      if (l.dia >= primero) continue;
      const a = acumulado.get(l.productoId) ?? { monto: 0, cantidad: 0 };
      a.monto += l.precio * l.cantidad;
      a.cantidad += l.cantidad;
      acumulado.set(l.productoId, a);
    }
    const precioBase = new Map([...acumulado].map(([id, a]) => [id, a.monto / a.cantidad]));

    return { hoy, semanas, productos, costo, stock, ventas, recepciones, compras, precioBase, ultima };
  });
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

/** Venta neta de los `dias` días que terminan en `corte` (sin negativos). */
const ventaVentana = (b: BaseCompras, id: number, corte: string, dias = VENTANA) =>
  Math.max(0, sumaEntre(b.ventas.get(id), sumarDias(corte, -(dias - 1)), corte));

// --- KPI 1 ---------------------------------------------------------------
function variacionCosto(b: BaseCompras, desde: string, hasta: string) {
  let base = 0;
  let pagado = 0;
  for (const l of b.compras) {
    if (l.dia < desde || l.dia > hasta) continue;
    const ref = b.precioBase.get(l.productoId);
    if (!ref) continue;
    base += ref * l.cantidad;
    pagado += l.precio * l.cantidad;
  }
  return base > 0 ? Math.round(((base - pagado) / base) * 1000) / 10 : null;
}

// --- KPI 2 ---------------------------------------------------------------
function sellThrough(b: BaseCompras, corte: string, dias = VENTANA) {
  let vendido = 0;
  let stock = 0;
  for (const p of b.productos) {
    vendido += ventaVentana(b, p.id, corte, dias);
    stock += b.stock.stockAlCierre(p.id, corte);
  }
  return pct(vendido, vendido + stock);
}

// --- KPI 3 ---------------------------------------------------------------
/** Días sin stock de un producto en [desde, hasta]. */
function diasSinStock(b: BaseCompras, id: number, desde: string, hasta: string) {
  let n = 0;
  for (let d = desde; d <= hasta; d = sumarDias(d, 1)) if (b.stock.stockAlCierre(id, d) <= 0) n++;
  return n;
}

function quiebreSemana(b: BaseCompras, s: SemanaIso) {
  if (!s.corte) return { sinStock: 0, elegibles: 0 };
  const dias = diasEntre(s.ini, s.corte) + 1;
  let sinStock = 0;
  let elegibles = 0;
  for (const p of b.productos) {
    if (ventaVentana(b, p.id, s.corte) <= 0) continue;
    elegibles += dias;
    sinStock += diasSinStock(b, p.id, s.ini, s.corte);
  }
  return { sinStock, elegibles };
}

// --- KPI 4 ---------------------------------------------------------------
/**
 * Unidades del stock al cierre que tienen más de 90 días (FIFO por
 * recepción): el stock menos lo recibido en los últimos 90 días. Cada día
 * cuenta neto de lo devuelto al proveedor ese día, como las bandas del modal.
 */
function unidadesMayor90(b: BaseCompras, id: number, corte: string, stock: number) {
  const desde = sumarDias(corte, -(VENTANA - 1));
  let recibido = 0;
  for (const [d, q] of b.recepciones.get(id) ?? []) if (q > 0 && d >= desde && d <= corte) recibido += q;
  return Math.max(0, stock - recibido);
}

function inventario90(b: BaseCompras, corte: string) {
  let total = 0;
  let viejo = 0;
  for (const p of b.productos) {
    const c = b.costo.get(p.id) ?? 0;
    const s = b.stock.stockAlCierre(p.id, corte);
    if (s <= 0 || c <= 0) continue;
    total += s * c;
    viejo += unidadesMayor90(b, p.id, corte, s) * c;
  }
  return pct(viejo, total);
}

export async function computeComprasKpis(
  companyId: number,
  semanas: { inicio: Date; fin: Date; diasUtiles: number }[],
): Promise<ComprasKpisRaw> {
  const vacio = Array(semanas.length).fill(null);
  try {
    const b = await baseCompras(companyId, semanas);
    return {
      semanaVarCosto: b.semanas.map((s) => (s.corte ? variacionCosto(b, s.ini, s.corte) : null)),
      semanaRotacion: b.semanas.map((s) => (s.corte ? sellThrough(b, s.corte) : null)),
      semanaQuiebre: b.semanas.map((s) => {
        const q = quiebreSemana(b, s);
        return pct(q.sinStock, q.elegibles);
      }),
      semanaInv90: b.semanas.map((s) => (s.corte ? inventario90(b, s.corte) : null)),
    };
  } catch (e: any) {
    console.error("Error calculando KPIs de Compras:", e?.message);
    return { semanaVarCosto: vacio, semanaRotacion: vacio, semanaQuiebre: vacio, semanaInv90: vacio };
  }
}

// ---------------------------------------------------------------------------
// Detalle (modal del Stoplight)
// ---------------------------------------------------------------------------

export type KpiCompras = "variacion_costo" | "rotacion" | "quiebre" | "inventario_90";

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function detalleKpiCompras(
  companyId: number,
  semanasLocales: { inicio: Date; fin: Date }[],
  kpi: KpiCompras,
): Promise<any> {
  const b = await baseCompras(companyId, semanasLocales);
  const conCorte = b.semanas.filter((s) => s.corte);
  const primero = b.semanas[0]?.ini ?? b.hoy;
  const corte = conCorte.length ? conCorte[conCorte.length - 1].corte! : null;
  const porId = new Map(b.productos.map((p) => [p.id, p]));
  const fila = (p: ProductoCompras) => ({ id: p.id, sku: p.codigo, nombre: p.nombre, categoria: p.categoria });
  if (!corte) return { kpi, resumen: {}, items: [] };

  /** Última venta hasta el corte (en la ventana leída, o la última conocida si es anterior). */
  const ultimaHasta = (id: number) => {
    const enVentana = ultimoDiaConVenta(b.ventas.get(id), corte);
    if (enVentana) return enVentana;
    const u = b.ultima.get(id);
    return u && u <= corte ? u : null;
  };

  if (kpi === "variacion_costo") {
    const porProducto = new Map<number, { monto: number; cantidad: number; ultima: string }>();
    for (const l of b.compras) {
      if (l.dia < primero || l.dia > corte) continue;
      const a = porProducto.get(l.productoId) ?? { monto: 0, cantidad: 0, ultima: l.dia };
      a.monto += l.precio * l.cantidad;
      a.cantidad += l.cantidad;
      if (l.dia > a.ultima) a.ultima = l.dia;
      porProducto.set(l.productoId, a);
    }
    const items = [...porProducto]
      .map(([id, a]) => {
        const p = porId.get(id);
        const base = b.precioBase.get(id);
        if (!p || !base) return null;
        const actual = a.monto / a.cantidad;
        return {
          ...fila(p),
          costoBase: r2(base),
          costoActual: r2(actual),
          variacion: r2(((base - actual) / base) * 100),
          stock: b.stock.stockAlCierre(id, corte),
          ahorroUnitario: r2(base - actual),
          totalComprado3m: Math.round(a.cantidad),
          ultimaCompra: a.ultima,
          ahorroTotal: r2((base - actual) * a.cantidad),
        };
      })
      .filter(Boolean)
      .sort((x: any, y: any) => Math.abs(y.variacion) - Math.abs(x.variacion));
    return {
      kpi,
      titulo: "Variación del costo de compra",
      resumen: {
        totalProductos: items.length,
        promedioVariacion: variacionCosto(b, primero, corte) ?? 0,
        ahorroTotalEstimado: r2(items.reduce((s: number, i: any) => s + i.ahorroTotal, 0)),
        metodo: "Precio pagado en el mes vs. promedio ponderado de lo comprado en los 90 días anteriores, ponderado por lo comprado",
      },
      items,
    };
  }

  if (kpi === "rotacion") {
    const items = b.productos
      .map((p) => {
        const stock = b.stock.stockAlCierre(p.id, corte);
        const ventas = ventaVentana(b, p.id, corte);
        if (stock <= 0 && ventas <= 0) return null;
        const c = b.costo.get(p.id) ?? 0;
        const u = ultimaHasta(p.id);
        const recepciones = b.recepciones.get(p.id);
        let ultimaRecepcion: string | null = null;
        if (recepciones) for (const [d, q] of recepciones) if (q > 0 && d <= corte && (!ultimaRecepcion || d > ultimaRecepcion)) ultimaRecepcion = d;
        const st = ventas + stock > 0 ? Math.round((ventas / (ventas + stock)) * 100) : 0;
        return {
          ...fila(p),
          stock,
          costo: c,
          valorStock: r2(stock * c),
          ventasTotales: Math.round(ventas),
          sellThrough: st,
          diasSinVenta: u ? diasEntre(u, corte) : null,
          diasSinRecepcion: ultimaRecepcion ? diasEntre(ultimaRecepcion, corte) : null,
          ultimoMovimiento: u ?? "Sin ventas",
          ultimaRecepcion: ultimaRecepcion ?? "—",
          rotaSaludablemente: st >= 70,
        };
      })
      .filter(Boolean)
      .sort((x: any, y: any) => x.sellThrough - y.sellThrough);
    const conStock = items.filter((i: any) => i.stock > 0);
    const saludables = conStock.filter((i: any) => i.rotaSaludablemente).length;
    return {
      kpi,
      titulo: "Rotación saludable de compras",
      resumen: {
        totalConStock: conStock.length,
        saludables,
        noSaludables: conStock.length - saludables,
        sellThroughGeneral: sellThrough(b, corte) ?? 0,
        sellThroughPorPlazo: Object.fromEntries([30, 60, 90, 120].map((d) => [d, sellThrough(b, corte, d) ?? 0])),
        metodo: "Sell-through: unidades vendidas en los 90 días al cierre ÷ (vendidas + stock al cierre)",
      },
      items,
    };
  }

  if (kpi === "quiebre") {
    // Días sin stock sumados en las semanas en que el producto tenía demanda,
    // igual que la grilla.
    const acumulado = new Map<number, { sinStock: number; elegibles: number }>();
    let totalSinStock = 0;
    let totalElegibles = 0;
    for (const s of conCorte) {
      const dias = diasEntre(s.ini, s.corte!) + 1;
      for (const p of b.productos) {
        if (ventaVentana(b, p.id, s.corte!) <= 0) continue;
        const sin = diasSinStock(b, p.id, s.ini, s.corte!);
        const a = acumulado.get(p.id) ?? { sinStock: 0, elegibles: 0 };
        a.sinStock += sin;
        a.elegibles += dias;
        acumulado.set(p.id, a);
        totalSinStock += sin;
        totalElegibles += dias;
      }
    }
    const items = [...acumulado]
      .map(([id, a]) => {
        const p = porId.get(id)!;
        const stock = b.stock.stockAlCierre(id, corte);
        const demandaDiaria = ventaVentana(b, id, corte) / VENTANA;
        const diasHastaQuiebre = demandaDiaria > 0 ? Math.floor(stock / demandaDiaria) : null;
        const estado = stock <= 0 ? "QUIEBRE TOTAL" : diasHastaQuiebre !== null && diasHastaQuiebre <= 7 ? "RIESGO ALTO" : "OK";
        return {
          ...fila(p),
          stock,
          demandaMensual: Math.round(demandaDiaria * 30),
          demandaDiaria: r2(demandaDiaria),
          diasHastaQuiebre: diasHastaQuiebre === null ? "Sin riesgo" : diasHastaQuiebre,
          diasSinStockEstimado: a.sinStock,
          costo: b.costo.get(id) ?? 0,
          estado,
        };
      })
      .sort((x: any, y: any) => {
        const orden: Record<string, number> = { "QUIEBRE TOTAL": 0, "RIESGO ALTO": 1, OK: 2 };
        return orden[x.estado] - orden[y.estado] || y.diasSinStockEstimado - x.diasSinStockEstimado;
      });
    return {
      kpi,
      titulo: "Porcentaje de quiebre de inventario",
      resumen: {
        totalConDemanda: items.length,
        enQuiebre: items.filter((i) => i.estado === "QUIEBRE TOTAL").length,
        enRiesgo: items.filter((i) => i.estado === "RIESGO ALTO").length,
        porcentaje: pct(totalSinStock, totalElegibles) ?? 0,
        totalDiasSinStock: totalSinStock,
        totalDiasElegibles: totalElegibles,
        metodo: "Días sin stock ÷ días de productos con venta en los 90 días anteriores, con el stock de cada día",
      },
      items,
    };
  }

  // inventario_90: el stock al cierre repartido por antigüedad (FIFO: lo que
  // queda es lo último que se recibió).
  const bandas = [
    { label: "0-30 días", min: 0, max: 30 },
    { label: "31-60 días", min: 31, max: 60 },
    { label: "61-90 días", min: 61, max: 90 },
    { label: "91-120 días", min: 91, max: 120 },
    { label: "121-180 días", min: 121, max: 180 },
    { label: ">180 días", min: 181, max: Infinity },
  ].map((x) => ({ ...x, valor: 0, cantidad: 0 }));
  const bandaDe = (edad: number) => bandas.find((x) => edad >= x.min && edad <= x.max) ?? bandas[bandas.length - 1];

  let total = 0;
  const items = b.productos
    .map((p) => {
      const stock = b.stock.stockAlCierre(p.id, corte);
      if (stock <= 0) return null;
      const c = b.costo.get(p.id) ?? 0;
      const recepciones = [...(b.recepciones.get(p.id) ?? new Map<string, number>())]
        .filter(([d, q]) => d <= corte && q > 0)
        .sort((x, y) => (x[0] < y[0] ? 1 : -1));
      let resto = stock;
      let edadMax = 0;
      for (const [d, q] of recepciones) {
        if (resto <= 0) break;
        const u = Math.min(resto, q);
        const edad = diasEntre(d, corte);
        bandaDe(edad).valor += u * c;
        resto -= u;
        edadMax = edad;
      }
      // Lo que no alcanza a cubrirse con recepciones de los últimos 180 días es más viejo.
      if (resto > 0) {
        bandaDe(181).valor += resto * c;
        edadMax = 181;
      }
      bandaDe(edadMax).cantidad += 1;
      total += stock * c;
      const mayor90 = unidadesMayor90(b, p.id, corte, stock);
      const u = ultimaHasta(p.id);
      return {
        ...fila(p),
        stock,
        costo: c,
        valorInventario: r2(stock * c),
        unidadesMayor90: Math.round(mayor90),
        valorMayor90: r2(mayor90 * c),
        banda: bandaDe(edadMax).label,
        ultimoMovimiento: recepciones[0]?.[0] ?? "Sin recepción en 180 días",
        diasSinVenta: u ? diasEntre(u, corte) : null,
        esEstancado: mayor90 > 0,
      };
    })
    .filter(Boolean)
    .sort((x: any, y: any) => y.valorMayor90 - x.valorMayor90);

  const valorEstancado = items.reduce((s: number, i: any) => s + (i.costo > 0 ? i.valorMayor90 : 0), 0);
  return {
    kpi,
    titulo: "Inventario con más de 90 días",
    resumen: {
      totalProductos: items.length,
      productosEstancados: items.filter((i: any) => i.esEstancado).length,
      valorTotalInventario: r2(total),
      valorEstancado: r2(valorEstancado),
      porcentaje: inventario90(b, corte) ?? 0,
      bandas: bandas.map((x) => ({
        label: x.label,
        min: x.min,
        valor: r2(x.valor),
        cantidad: x.cantidad,
        porcentaje: total > 0 ? Math.round((x.valor / total) * 100) : 0,
      })),
      metodo: "Antigüedad FIFO por recepción de compra (lo que queda es lo último que entró), valorizado a costo",
    },
    items,
  };
}
