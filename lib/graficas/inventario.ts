import { almacenSede, cachear, catalogo, costos, diaCaracas, diasEntre, disponible, hoyCaracas, leerTodo, transito, ultimaVenta } from "@/lib/compras/datosOdoo";
import { FIN_CARGA_INICIAL, TRAMOS, tramoDe, type Tramo } from "@/lib/gerente-marca/tipos";
import {
  COLOR_SEDE, ESTADO, NOMBRE_SEDE, PALETA, RAMPA, agregarRuta, bloque, detalleDe, MAX_DETALLE, r2, topConOtros,
  type Arbol,
  type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Inventario de hoy (no depende del mes) en el almacén principal de cada sede
 * (`MAIN_WAREHOUSE_BY_COMPANY` de Compras): Central en Valencia y Panamá,
 * Principal en Caracas. Stock y tránsito de lib/compras/datosOdoo.ts, en
 * unidades y al costo de la sede. Antigüedad por la fecha de entrada de cada
 * quant, en los tramos del Gerente de Marca; la carga inicial de Odoo va aparte.
 */

type Medida = { v: number; u: number };
const vacia = (): Medida => ({ v: 0, u: 0 });

/**
 * Valor al costo y unidades por tramo de antigüedad de una sede: cada quant del
 * almacén con su `in_date` en día de Caracas, igual que la Antigüedad del
 * Gerente de Marca (lib/gerente-marca/datos.ts).
 */
function antiguedad(cid: number): Promise<Record<Tramo, Medida>> {
  return cachear(`graf|antig|${cid}|${hoyCaracas()}`, async () => {
    const [almacen, costo] = await Promise.all([almacenSede(cid), costos(cid)]);
    const quants = await leerTodo(
      "stock.quant",
      [["location_id", "in", almacen.ubicaciones], ["company_id", "=", cid], ["quantity", ">", 0]],
      ["product_id", "quantity", "in_date"],
    );
    const hoy = hoyCaracas();
    const out = Object.fromEntries(TRAMOS.map((t) => [t.id, vacia()])) as Record<Tramo, Medida>;
    for (const q of quants) {
      const id = q.product_id?.[0];
      const unidades = Number(q.quantity) || 0;
      if (!id || unidades <= 0 || !q.in_date) continue;
      const dias = Math.max(0, diasEntre(diaCaracas(q.in_date), hoy));
      const t = out[tramoDe(dias, String(q.in_date).slice(0, 10) < FIN_CARGA_INICIAL)];
      t.u += unidades;
      t.v += unidades * (costo.get(id) || 0);
    }
    return out;
  });
}

/** Tramos de días desde la última venta del producto en la sede (todo el stock disponible). */
const BUCKETS_DORMIDO = [
  { id: "0-30", etiqueta: "Vendido en 30 días", max: 30 },
  { id: "31-60", etiqueta: "31-60 días", max: 60 },
  { id: "61-90", etiqueta: "61-90 días", max: 90 },
  { id: "91-180", etiqueta: "91-180 días", max: 180 },
  { id: "181-365", etiqueta: "181-365 días", max: 365 },
  { id: "365+", etiqueta: "Más de un año", max: Infinity },
  { id: "nuevo", etiqueta: "Sin venta, llegó hace ≤30 días", max: -1 },
  { id: "nunca", etiqueta: "Nunca vendido", max: -1 },
];

const sumar = (mapa: Map<string, Medida>, clave: string, v: number, u: number) => {
  const m = mapa.get(clave) ?? vacia();
  m.v += v;
  m.u += u;
  mapa.set(clave, m);
};

/** Barras horizontales de una sola serie, en monto y en unidades (cada medida con su propio top). */
function barrasDoble(
  id: string, titulo: string, mapa: Map<string, Medida>, max: number, otros: string, color: string,
  descripcion?: string, productos?: Productos, queOtros?: string,
): Grafica {
  const filas = (k: "v" | "u") => [...mapa].map(([etiqueta, m]) => ({ etiqueta, valor: k === "u" ? Math.round(m.u) : m.v }));
  const datos = topConOtros(filas("v"), max, otros);
  const datosU = topConOtros(filas("u"), max, otros);
  return {
    id, titulo, descripcion, tipo: "barras_h", formato: "usd",
    datos,
    series: [{ clave: "valor", etiqueta: "Inventario", color }],
    detalle: productos && detalleDe(datos, productos.v, SOLO_PRODUCTOS, queOtros),
    alterna: { etiqueta: "Unidades", formato: "num", datos: datosU, detalle: productos && detalleDe(datosU, productos.u, SOLO_PRODUCTOS, queOtros, Math.round) },
  };
}

/** Productos de cada barra, en monto y en unidades (para el clic). */
type Productos = { v: Arbol; u: Arbol };
const SOLO_PRODUCTOS = [{ que: "Productos", max: MAX_DETALLE }];
const nuevosProductos = (): Productos => ({ v: new Map(), u: new Map() });
const sumarProducto = (p: Productos, barra: string, nombre: string, v: number, u: number) => {
  agregarRuta(p.v, [barra, nombre], v);
  agregarRuta(p.u, [barra, nombre], u);
};

export async function graficasInventario(cids: number[], sede: string, mes: string): Promise<DatosArea> {
  const avisos: string[] = [];
  const kpis: Kpi[] = [];
  const graficas: Grafica[] = [];

  const base = await bloque(avisos, "el stock", async () => {
    const cat = await catalogo();
    const porSede = await Promise.all(cids.map(async (cid) => {
      const [almacen, costo, llegando] = await Promise.all([almacenSede(cid), costos(cid), transito(cid)]);
      return { cid, almacen, costo, llegando };
    }));
    return { cat, porSede };
  });

  // "Valencia · Central": el almacén que se está mostrando.
  const nombre: Record<number, string> = Object.fromEntries(cids.map((c) => [c, NOMBRE_SEDE[c]]));

  if (base) {
    const { cat, porSede } = base;
    for (const { cid, almacen } of porSede) nombre[cid] = `${NOMBRE_SEDE[cid]} · ${almacen.nombre}`;
    const total = vacia();
    const reservado = vacia();
    const llegando = vacia();
    // Un producto en varias sedes cuenta una vez.
    const skus = new Set<number>();
    const sinCosto = new Set<number>();
    const porMarca = new Map<string, Record<number, Medida>>();
    const porCategoria = new Map<string, Medida>();
    const porProducto = new Map<string, Medida>();
    const llegandoMarca = new Map<string, Medida>();
    const prodMarca = nuevosProductos();
    const prodCategoria = nuevosProductos();
    const prodLlegando = nuevosProductos();
    const porSedeMedida: Record<number, { disponible: Medida; reservado: Medida; llegando: Medida }> = {};

    for (const { cid, almacen, costo, llegando: llega } of porSede) {
      const s0 = { disponible: vacia(), reservado: vacia(), llegando: vacia() };
      for (const [id, s] of almacen.stock) {
        if (s.fisico <= 0) continue;
        const p = cat.get(id);
        const c = costo.get(id) || 0;
        if (!c) sinCosto.add(id);
        const v = s.fisico * c;
        total.v += v;
        total.u += s.fisico;
        reservado.v += s.reservado * c;
        reservado.u += s.reservado;
        skus.add(id);
        s0.disponible.v += (s.fisico - s.reservado) * c;
        s0.disponible.u += s.fisico - s.reservado;
        s0.reservado.v += s.reservado * c;
        s0.reservado.u += s.reservado;
        const marca = p?.marca || "SIN MARCA";
        const m = porMarca.get(marca) ?? {};
        m[cid] = m[cid] ?? vacia();
        m[cid].v += v;
        m[cid].u += s.fisico;
        porMarca.set(marca, m);
        const nombreProd = p ? `${p.codigo} · ${p.nombre}` : `Producto ${id}`;
        sumar(porCategoria, p?.categoria || "Sin categoría", v, s.fisico);
        sumar(porProducto, nombreProd, v, s.fisico);
        sumarProducto(prodMarca, marca, nombreProd, v, s.fisico);
        sumarProducto(prodCategoria, p?.categoria || "Sin categoría", nombreProd, v, s.fisico);
      }
      for (const [id, q] of llega) {
        const v = q * (costo.get(id) || 0);
        llegando.v += v;
        llegando.u += q;
        s0.llegando.v += v;
        s0.llegando.u += q;
        const p = cat.get(id);
        sumar(llegandoMarca, p?.marca || "SIN MARCA", v, q);
        sumarProducto(prodLlegando, p?.marca || "SIN MARCA", p ? `${p.codigo} · ${p.nombre}` : `Producto ${id}`, v, q);
      }
      porSedeMedida[cid] = s0;
    }

    const almacenes = porSede.map((x) => nombre[x.cid]).join(", ");
    kpis.push({ id: "valor", etiqueta: "Inventario al costo", valor: r2(total.v), formato: "usd", nota: "hoy" });
    kpis.push({ id: "unidades", etiqueta: "Unidades en almacén", valor: Math.round(total.u), formato: "num", nota: "hoy" });
    kpis.push({ id: "skus", etiqueta: "Productos con stock", valor: skus.size, formato: "num", nota: "hoy" });
    kpis.push({ id: "reservado", etiqueta: "Reservado para pedidos", valor: r2(reservado.v), formato: "usd", nota: `${Math.round(reservado.u).toLocaleString("en-US")} unidades` });
    kpis.push({ id: "llegando", etiqueta: "Por llegar (al costo)", valor: r2(llegando.v), formato: "usd", nota: `${Math.round(llegando.u).toLocaleString("en-US")} unidades` });
    if (sinCosto.size) avisos.push(`${sinCosto.size} productos con stock no tienen costo en Odoo: cuentan en unidades pero no en monto.`);
    avisos.push("El inventario es el de hoy: no cambia con el mes elegido.");

    const filaSede = (k: "v" | "u") => cids.map((c) => ({
      etiqueta: nombre[c],
      disponible: k === "u" ? Math.round(porSedeMedida[c].disponible.u) : r2(porSedeMedida[c].disponible.v),
      reservado: k === "u" ? Math.round(porSedeMedida[c].reservado.u) : r2(porSedeMedida[c].reservado.v),
      llegando: k === "u" ? Math.round(porSedeMedida[c].llegando.u) : r2(porSedeMedida[c].llegando.v),
    }));
    graficas.push({
      id: "inv_sede",
      titulo: "Inventario por sede",
      descripcion: `Almacén ${almacenes}: disponible, reservado para pedidos y lo que viene en órdenes de compra. Sin exhibición, mal estado, demo ni consumo interno.`,
      tipo: "apiladas_h",
      formato: "usd",
      datos: filaSede("v"),
      series: [
        { clave: "disponible", etiqueta: "Disponible", color: PALETA[0] },
        { clave: "reservado", etiqueta: "Reservado", color: PALETA[1] },
        { clave: "llegando", etiqueta: "Por llegar", color: PALETA[2] },
      ],
      alterna: { etiqueta: "Unidades", formato: "num", datos: filaSede("u") },
    });

    // Las 12 marcas que más pesan (en monto o en unidades); el resto en "Otras marcas", por sede.
    const filasMarca = (k: "v" | "u") => {
      const marcas = [...porMarca].map(([marca, s]) => ({ marca, s, total: Object.values(s).reduce((a, b) => a + b[k], 0) }))
        .sort((a, b) => b.total - a.total);
      const otras: Record<number, number> = {};
      for (const x of marcas.slice(12)) for (const [c, m] of Object.entries(x.s)) otras[Number(c)] = (otras[Number(c)] || 0) + m[k];
      const filas = marcas.slice(0, 12).map((x) => ({ etiqueta: x.marca, s: Object.fromEntries(Object.entries(x.s).map(([c, m]) => [c, m[k]])) as Record<number, number> }));
      if (marcas.length > 12) filas.push({ etiqueta: "Otras marcas", s: otras });
      const redondeo = k === "u" ? Math.round : r2;
      return filas.map((f) => ({ etiqueta: f.etiqueta, ...Object.fromEntries(cids.map((c) => [String(c), redondeo(f.s[c] || 0)])) }));
    };
    graficas.push({
      id: "inv_marca",
      titulo: "Inventario por marca",
      tipo: "apiladas_h",
      formato: "usd",
      datos: filasMarca("v"),
      series: cids.map((c) => ({ clave: String(c), etiqueta: nombre[c], color: COLOR_SEDE[c] })),
      detalle: detalleDe(filasMarca("v"), prodMarca.v, SOLO_PRODUCTOS, "Marcas"),
      alterna: { etiqueta: "Unidades", formato: "num", datos: filasMarca("u"), detalle: detalleDe(filasMarca("u"), prodMarca.u, SOLO_PRODUCTOS, "Marcas", Math.round) },
    });
    graficas.push(barrasDoble("inv_categoria", "Inventario por categoría", porCategoria, 12, "Otras categorías", PALETA[2], undefined, prodCategoria, "Categorías"));
    graficas.push({
      ...barrasDoble("inv_llegando", "Por llegar, por marca", llegandoMarca, 10, "Otras marcas", PALETA[2], "Recepciones de órdenes de compra pendientes.", prodLlegando, "Marcas"),
      vacio: "No hay órdenes de compra por recibir.",
    });
    const productos = barrasDoble("inv_productos", "Top 15 productos", porProducto, 15, "Otros", PALETA[0]);
    graficas.push({
      ...productos,
      ancho: 2,
      datos: productos.datos.slice(0, 15),
      alterna: { ...productos.alterna!, datos: productos.alterna!.datos.slice(0, 15) },
    });
  }

  const [antig, dormido] = await Promise.all([
    bloque(avisos, "la antigüedad del inventario", () => Promise.all(cids.map(antiguedad))),
    bloque(avisos, "la última venta de cada producto", () => Promise.all(cids.map(async (cid) => {
      const [almacen, costo, ultima] = await Promise.all([almacenSede(cid), costos(cid), ultimaVenta(cid)]);
      return { almacen, costo, ultima };
    }))),
  ]);

  if (antig) {
    const filas = (k: "v" | "u") => TRAMOS.map((t) => ({
      etiqueta: t.label,
      ...Object.fromEntries(cids.map((c, i) => [String(c), k === "u" ? Math.round(antig[i][t.id].u) : r2(antig[i][t.id].v)])),
    }));
    graficas.push({
      id: "inv_antiguedad",
      titulo: "Antigüedad del inventario",
      descripcion: "Según cuándo entró. «Antes de Odoo» es la carga inicial de abril 2026: su fecha real se perdió.",
      tipo: "apiladas",
      formato: "usd",
      datos: filas("v"),
      series: cids.map((c) => ({ clave: String(c), etiqueta: nombre[c], color: COLOR_SEDE[c] })),
      alterna: { etiqueta: "Unidades", formato: "num", datos: filas("u") },
    });
  }

  if (dormido) {
    const hoy = hoyCaracas();
    const cat = base?.cat ?? (await catalogo());
    const valores = Object.fromEntries(BUCKETS_DORMIDO.map((b) => [b.id, vacia()]));
    const prodDormido = nuevosProductos();
    for (const { almacen, costo, ultima } of dormido) {
      for (const [id, s] of almacen.stock) {
        const u = disponible(s);
        if (u <= 0) continue;
        const venta = ultima.get(id);
        const nuevo = !venta && !!s.enStockDesde && diasEntre(s.enStockDesde, hoy) <= 30;
        const b = venta
          ? BUCKETS_DORMIDO.find((x) => x.max >= 0 && diasEntre(venta, hoy) <= x.max)!
          : BUCKETS_DORMIDO.find((x) => x.id === (nuevo ? "nuevo" : "nunca"))!;
        const v = u * (costo.get(id) || 0);
        valores[b.id].v += v;
        valores[b.id].u += u;
        const p = cat.get(id);
        sumarProducto(prodDormido, b.etiqueta, p ? `${p.codigo} · ${p.nombre}` : `Producto ${id}`, v, u);
      }
    }
    const dormidoValor = valores["181-365"].v + valores["365+"].v + valores.nunca.v;
    kpis.push({ id: "dormido", etiqueta: "Capital dormido", valor: r2(dormidoValor), formato: "usd", mejor: "baja", nota: "disponible sin venderse en 6 meses o nunca" });
    const datosV = BUCKETS_DORMIDO.map((b) => ({ etiqueta: b.etiqueta, valor: r2(valores[b.id].v) }));
    const datosU = BUCKETS_DORMIDO.map((b) => ({ etiqueta: b.etiqueta, valor: Math.round(valores[b.id].u) }));
    graficas.push({
      id: "inv_dormido",
      titulo: "Inventario por días sin vender",
      descripcion: "Todo el stock disponible (sin lo reservado), según la última venta del producto en la sede (Odoo o Smartbit).",
      tipo: "barras",
      formato: "usd",
      ancho: 2,
      datos: datosV,
      series: [{ clave: "valor", etiqueta: "Inventario", color: PALETA[0] }],
      colorPorFila: [ESTADO.bien, RAMPA[2], RAMPA[4], ESTADO.aviso, ESTADO.serio, ESTADO.critico, RAMPA[1], "#8c222b"],
      detalle: detalleDe(datosV, prodDormido.v, SOLO_PRODUCTOS),
      alterna: { etiqueta: "Unidades", formato: "num", datos: datosU, detalle: detalleDe(datosU, prodDormido.u, SOLO_PRODUCTOS, undefined, Math.round) },
    });
  }

  return { area: "inventario", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
