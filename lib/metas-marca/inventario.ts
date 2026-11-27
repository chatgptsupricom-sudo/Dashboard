import { callOdooRPC } from "@/lib/odoo";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { almacenSede, disponible as disponibleDe } from "@/lib/compras/datosOdoo";
import { claveMarca, SIN_MARCA } from "./marcas";
import { partnersIntercompania } from "@/lib/intercompania";
import { leerProductos } from "./odoo";
import { hoyCaracas, isoDia } from "./servicio";

/**
 * Inventario por marca para la meta en unidades de Metas por marca.
 *
 * - Stock = disponible hoy (existencia − reservado) en el almacén principal de
 *   la sede: `almacenSede` de Compras (Existencias + Entrada; el reservado del
 *   traslado Entrada → Existencias no cuenta). No cuenta Exhibición, Mal
 *   estado, Demo, RMA ni Tránsito. La marca trae además existencia y reservado.
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
  /** Disponible hoy (existencia − reservado): con esto se calcula la meta en unidades. */
  unidades: number;
  /** Unidades físicas en el almacén principal (incluye lo reservado). */
  existencia: number;
  /** Reservado para pedidos. */
  reservado: number;
  valor: number;
  productos: number;
  /** Parte del valor que sale del costo (productos sin venta en 12 meses). */
  valorAlCosto: number;
  productosAlCosto: number;
  productosSinPrecio: number;
}

export interface InventarioSede {
  companyId: number;
  /** Nombre del almacén principal. */
  ubicacion: string;
  /** Ubicaciones internas del almacén principal (las de `almacenSede`). */
  ubicaciones: number[];
  /** Las de Entrada (dentro de `ubicaciones`): su reservado no cuenta. */
  ubicacionesEntrada: number[];
  fecha: string;
  productos: ProductoInventario[];
  porMarca: Map<string, InventarioMarca>;
  /** Quants con cantidad negativa (se toman como 0): error de inventario en Odoo. */
  negativos: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Ubicaciones de Entrada del almacén principal (su reservado no cuenta, como en `almacenSede`). */
async function ubicacionesEntrada(companyId: number): Promise<number[]> {
  const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
  if (!warehouseId) return [];
  const wh = await callOdooRPC<any[]>("stock.warehouse", "search_read", [[["id", "=", warehouseId]]], {
    fields: ["wh_input_stock_loc_id"], limit: 1,
  });
  if (!Array.isArray(wh)) throw new Error("Odoo no respondió stock.warehouse");
  const entrada = wh[0]?.wh_input_stock_loc_id?.[0];
  if (!entrada) return [];
  const ids = await callOdooRPC<number[]>("stock.location", "search", [[["id", "child_of", entrada]]]);
  if (!Array.isArray(ids)) throw new Error("Odoo no respondió las ubicaciones de Entrada");
  return ids;
}

/** Productos cuya cantidad total en el almacén es negativa (`almacenSede` los toma como 0). */
async function productosNegativos(companyId: number, ubicaciones: number[]): Promise<number> {
  if (!ubicaciones.length) return 0;
  const dominio = [["location_id", "in", ubicaciones], ["company_id", "=", companyId]];
  const conNegativo = await callOdooRPC<any[]>("stock.quant", "read_group", [[...dominio, ["quantity", "<", 0]], ["quantity:sum"], ["product_id"]], { lazy: false });
  if (!Array.isArray(conNegativo)) throw new Error("Odoo no respondió stock.quant");
  const ids = conNegativo.map((g) => g.product_id?.[0]).filter(Boolean);
  if (!ids.length) return 0;
  const sumas = await callOdooRPC<any[]>("stock.quant", "read_group", [[...dominio, ["product_id", "in", ids]], ["quantity:sum"], ["product_id"]], { lazy: false });
  if (!Array.isArray(sumas)) throw new Error("Odoo no respondió stock.quant");
  return sumas.filter((g) => (Number(g.quantity) || 0) < 0).length;
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

  const [almacen, ic, entrada] = await Promise.all([almacenSede(companyId), partnersIntercompania(), ubicacionesEntrada(companyId)]);
  const negativos = await productosNegativos(companyId, almacen.ubicaciones);

  // Mismo stock que Compras: existencia (negativos = 0) y reservado sin el de Entrada.
  const stock = new Map<number, { cantidad: number; reservado: number }>();
  for (const [id, s] of almacen.stock) {
    if (s.fisico > 0) stock.set(id, { cantidad: s.fisico, reservado: s.reservado });
  }
  const conExistencia = [...stock.keys()];
  const conStock = [...almacen.stock.entries()].filter(([, s]) => disponibleDe(s) > 0).map(([id]) => id);

  const icIds = [...ic.keys()];
  const [info, p3, p12] = await Promise.all([
    leerProductos(conExistencia),
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
  const nuevaMarca = (clave: string, marcaOdoo: string): InventarioMarca => ({
    clave, marca: marcaOdoo.trim() || clave, unidades: 0, existencia: 0, reservado: 0, valor: 0, productos: 0,
    valorAlCosto: 0, productosAlCosto: 0, productosSinPrecio: 0,
  });
  // Existencia y reservado de la marca cuentan también lo que está todo reservado.
  for (const id of conExistencia) {
    const s = stock.get(id)!;
    const p = info.get(id);
    const clave = p?.marcaId ? claveMarca(p.marca) : SIN_MARCA;
    const m = porMarca.get(clave) ?? nuevaMarca(clave, p?.marca || "");
    m.existencia += s.cantidad;
    m.reservado += s.reservado;
    porMarca.set(clave, m);
  }
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
    const m = porMarca.get(clave) ?? nuevaMarca(clave, p?.marca || "");
    m.unidades += disponible;
    m.valor += valor;
    m.productos++;
    if (fuente === "costo") { m.valorAlCosto += valor; m.productosAlCosto++; }
    if (fuente === "sin_precio") m.productosSinPrecio++;
    porMarca.set(clave, m);
  }
  for (const m of porMarca.values()) {
    m.unidades = r2(m.unidades);
    m.existencia = r2(m.existencia);
    m.reservado = r2(m.reservado);
    m.valor = r2(m.valor);
    m.valorAlCosto = r2(m.valorAlCosto);
  }

  return {
    companyId, ubicacion: almacen.nombre, ubicaciones: almacen.ubicaciones, ubicacionesEntrada: entrada,
    fecha: hasta, productos, porMarca, negativos,
  };
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
      x.existencia = r2(x.existencia + m.existencia);
      x.reservado = r2(x.reservado + m.reservado);
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
