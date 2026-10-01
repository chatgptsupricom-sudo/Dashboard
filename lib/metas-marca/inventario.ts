import { callOdooRPC } from "@/lib/odoo";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { claveMarca, SIN_MARCA } from "./marcas";
import { partnersIntercompania } from "@/lib/intercompania";
import { leerProductos } from "./odoo";
import { hoyCaracas, isoDia } from "./servicio";

/**
 * Inventario por marca para la meta en unidades de Metas por marca.
 *
 * - Stock = disponible hoy (cantidad − reservado) en el almacén principal de
 *   la sede (`MAIN_WAREHOUSE_BY_COMPANY`, el mismo de Compras) y sus
 *   sububicaciones. No cuenta Exhibición, Mal estado, Demo, RMA ni Tránsito.
 * - Valor de cada producto = disponible × precio promedio al que se vendió
 *   (−balance ÷ unidades de facturas de cliente, sin intercompañía) en los
 *   últimos 3 meses; si no se vendió, en los últimos 12; si tampoco, al costo
 *   (`standard_price` de la sede). NO se usa el precio de lista: en Odoo está
 *   en $1 en los productos (ej. la EcoTank L3250 cuesta $185,92 y figura a $1).
 * - Meta en unidades → meta en $: la misma proporción del valor del
 *   inventario de la marca (90 de 100 unidades = 90% del valor). Así una
 *   impresora no pesa lo mismo que una cinta.
 */

export type FuentePrecio = "venta_3m" | "venta_12m" | "costo" | "sin_precio";

export interface ProductoInventario {
  productoId: number;
  codigo: string;
  producto: string;
  clave: string;
  marcaOdoo: string;
  cantidad: number;
  reservado: number;
  disponible: number;
  precio: number;
  fuente: FuentePrecio;
  valor: number;
}

export interface InventarioMarca {
  clave: string;
  marca: string;
  unidades: number;
  valor: number;
  productos: number;
  /** Parte del valor que sale del costo (productos sin venta en 12 meses). */
  valorAlCosto: number;
  productosAlCosto: number;
  productosSinPrecio: number;
}

export interface InventarioSede {
  companyId: number;
  ubicacion: string;
  ubicacionId: number | null;
  fecha: string;
  productos: ProductoInventario[];
  porMarca: Map<string, InventarioMarca>;
  /** Quants con cantidad negativa (se toman como 0): error de inventario en Odoo. */
  negativos: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

async function ubicacionPrincipal(companyId: number): Promise<{ id: number | null; nombre: string }> {
  const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
  if (!warehouseId) return { id: null, nombre: "" };
  const wh = await callOdooRPC<any[]>("stock.warehouse", "search_read", [[["id", "=", warehouseId]]], {
    fields: ["lot_stock_id"], limit: 1, context: { allowed_company_ids: [companyId] },
  });
  if (!Array.isArray(wh)) throw new Error("Odoo no respondió stock.warehouse");
  const loc = wh[0]?.lot_stock_id;
  return loc ? { id: loc[0], nombre: loc[1] || "" } : { id: null, nombre: "" };
}

/** Precio promedio vendido por producto desde `desde` (solo facturas, sin intercompañía). */
async function precioVendido(companyId: number, desde: string, hasta: string, ids: number[], icIds: number[]) {
  const precio = new Map<number, number>();
  if (!ids.length) return precio;
  const grupos = await callOdooRPC<any[]>("account.move.line", "read_group", [[
    ["move_type", "=", "out_invoice"],
    ["parent_state", "=", "posted"],
    ["company_id", "=", companyId],
    ["invoice_date", ">=", desde],
    ["invoice_date", "<=", hasta],
    ["display_type", "=", "product"],
    ["product_id", "in", ids],
    ["move_id.commercial_partner_id", "not in", icIds],
  ], ["balance:sum", "quantity:sum"], ["product_id"]], { lazy: false });
  if (!Array.isArray(grupos)) throw new Error("Odoo no respondió los precios de venta");
  for (const g of grupos) {
    const q = Number(g.quantity) || 0;
    const monto = -(Number(g.balance) || 0);
    if (g.product_id && q > 0 && monto > 0) precio.set(g.product_id[0], monto / q);
  }
  return precio;
}

async function leerInventario(companyId: number): Promise<InventarioSede> {
  const hoy = hoyCaracas();
  const hasta = isoDia(hoy);
  const menosMeses = (n: number) => isoDia(new Date(hoy.getFullYear(), hoy.getMonth() - n, hoy.getDate()));

  const [ubic, ic] = await Promise.all([ubicacionPrincipal(companyId), partnersIntercompania()]);
  const dominio: any[] = [["company_id", "=", companyId]];
  dominio.push(ubic.id ? ["location_id", "child_of", [ubic.id]] : ["location_id.usage", "=", "internal"]);
  const quants = await callOdooRPC<any[]>("stock.quant", "read_group", [dominio, ["quantity:sum", "reserved_quantity:sum"], ["product_id"]], { lazy: false });
  if (!Array.isArray(quants)) throw new Error("Odoo no respondió stock.quant");

  let negativos = 0;
  const stock = new Map<number, { cantidad: number; reservado: number }>();
  for (const q of quants) {
    if (!q.product_id) continue;
    const cantidad = Number(q.quantity) || 0;
    if (cantidad < 0) negativos++;
    stock.set(q.product_id[0], { cantidad, reservado: Number(q.reserved_quantity) || 0 });
  }
  const conStock = [...stock.entries()].filter(([, s]) => s.cantidad - s.reservado > 0).map(([id]) => id);

  const icIds = [...ic.keys()];
  const [info, p3, p12] = await Promise.all([
    leerProductos(conStock),
    precioVendido(companyId, menosMeses(3), hasta, conStock, icIds),
    precioVendido(companyId, menosMeses(12), hasta, conStock, icIds),
  ]);
  const sinVenta = conStock.filter((id) => !p3.has(id) && !p12.has(id));
  const costo = new Map<number, number>();
  for (let i = 0; i < sinVenta.length; i += 2000) {
    const r = await callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", sinVenta.slice(i, i + 2000)]]], {
      fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [companyId], active_test: false },
    });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió el costo de los productos");
    for (const p of r) costo.set(p.id, Number(p.standard_price) || 0);
  }

  const productos: ProductoInventario[] = [];
  const porMarca = new Map<string, InventarioMarca>();
  for (const id of conStock) {
    const s = stock.get(id)!;
    const p = info.get(id);
    const clave = p?.marcaId ? claveMarca(p.marca) : SIN_MARCA;
    const disponible = s.cantidad - s.reservado;
    let precio = 0;
    let fuente: FuentePrecio = "sin_precio";
    if (p3.has(id)) { precio = p3.get(id)!; fuente = "venta_3m"; }
    else if (p12.has(id)) { precio = p12.get(id)!; fuente = "venta_12m"; }
    else if ((costo.get(id) || 0) > 0) { precio = costo.get(id)!; fuente = "costo"; }
    const valor = disponible * precio;
    productos.push({
      productoId: id, codigo: p?.codigo || "", producto: p?.nombre || "", clave, marcaOdoo: p?.marca || "",
      cantidad: r2(s.cantidad), reservado: r2(s.reservado), disponible: r2(disponible), precio: r2(precio), fuente, valor: r2(valor),
    });
    const m = porMarca.get(clave) ?? {
      clave, marca: (p?.marca || "").trim() || clave, unidades: 0, valor: 0, productos: 0,
      valorAlCosto: 0, productosAlCosto: 0, productosSinPrecio: 0,
    };
    m.unidades += disponible;
    m.valor += valor;
    m.productos++;
    if (fuente === "costo") { m.valorAlCosto += valor; m.productosAlCosto++; }
    if (fuente === "sin_precio") m.productosSinPrecio++;
    porMarca.set(clave, m);
  }
  for (const m of porMarca.values()) {
    m.unidades = r2(m.unidades);
    m.valor = r2(m.valor);
    m.valorAlCosto = r2(m.valorAlCosto);
  }

  return { companyId, ubicacion: ubic.nombre, ubicacionId: ubic.id, fecha: hasta, productos, porMarca, negativos };
}

const cache = new Map<number, { vence: number; valor: Promise<InventarioSede> }>();

/** Inventario de la sede, con caché de 10 min (`refrescar` la salta). */
export function inventarioSede(companyId: number, refrescar = false): Promise<InventarioSede> {
  const x = cache.get(companyId);
  if (!refrescar && x && x.vence > Date.now()) return x.valor;
  const valor = leerInventario(companyId);
  const entrada = { vence: Date.now() + 10 * 60 * 1000, valor };
  cache.set(companyId, entrada);
  valor.catch(() => { if (cache.get(companyId) === entrada) cache.delete(companyId); });
  return valor;
}

export interface StockSede {
  companyId: number;
  ubicacion: string;
  unidades: number;
  valor: number;
  productos: number;
  marcas: number;
  valorAlCosto: number;
  negativos: number;
}

/** Totales del stock disponible hoy de la sede (todas las marcas, incluido Sin marca). */
export function stockSede(inv: InventarioSede): StockSede {
  let unidades = 0, valor = 0, valorAlCosto = 0;
  for (const m of inv.porMarca.values()) { unidades += m.unidades; valor += m.valor; valorAlCosto += m.valorAlCosto; }
  const marcas = [...inv.porMarca.keys()].filter((k) => k !== SIN_MARCA).length;
  return {
    companyId: inv.companyId, ubicacion: inv.ubicacion, unidades: r2(unidades), valor: r2(valor),
    productos: inv.productos.length, marcas, valorAlCosto: r2(valorAlCosto), negativos: inv.negativos,
  };
}

/** Inventario por marca sumado entre sedes. */
export async function inventarioPorMarca(sedes: number[], refrescar = false): Promise<Map<string, InventarioMarca>> {
  const todos = await Promise.all(sedes.map((s) => inventarioSede(s, refrescar)));
  if (todos.length === 1) return todos[0].porMarca;
  const suma = new Map<string, InventarioMarca>();
  for (const inv of todos) {
    for (const m of inv.porMarca.values()) {
      const x = suma.get(m.clave);
      if (!x) { suma.set(m.clave, { ...m }); continue; }
      x.unidades = r2(x.unidades + m.unidades);
      x.valor = r2(x.valor + m.valor);
      x.productos += m.productos;
      x.valorAlCosto = r2(x.valorAlCosto + m.valorAlCosto);
      x.productosAlCosto += m.productosAlCosto;
      x.productosSinPrecio += m.productosSinPrecio;
    }
  }
  return suma;
}

export { metaDesdeUnidades } from "./unidades";
