import { callOdooRPCEstricto } from "@/lib/odoo";
import { productoPorRenglon, productosDeLaOc } from "@/lib/recepcion/odoo";

/**
 * Seriales que faltan para cargar en Odoo una recepcion ya cerrada.
 *
 * Un packing list sin codigos se cuenta escribiendo la cantidad (no se sabe
 * que renglon lleva serial). Despues de cruzarlo con Odoo (cruceIa.ts), los
 * productos que alla llevan serial no se pueden cargar sin uno por unidad:
 * `cargarRecepciones` lo rechaza ("en Odoo lleva serial y se contaron N con
 * M serial(es)"). Aca se dice que renglones pueden recibir esos seriales con
 * la recepcion cerrada:
 *  - la carga en Odoo fallo (`odoo_estado = 'error'`), o se cargo pero
 *    quedaron renglones sin producto (`odoo_resultado.sin_producto`);
 *  - el renglon tiene producto de Odoo con `tracking != 'none'` y algo
 *    recibido;
 *  - ese producto todavia no esta en `odoo_resultado.cargado`: lo cargado no
 *    se toca.
 * La cantidad ya esta cerrada: solo se suman seriales hasta
 * `cantidad_recibida`, sin cambiarla.
 */

export type RenglonSinSeriales = {
  item_id: number;
  codigo: string | null;
  producto: string;
  /** Lo recibido (cerrado): cuantos seriales tiene que tener. */
  cantidad: number;
  pistoleados: number;
  /** cantidad - pistoleados (negativo si sobran). */
  faltan: number;
};

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function resultadoDe(json: unknown): { cargado: Record<string, unknown>; sin_producto: string[] } {
  try {
    const v = typeof json === "string" && json ? JSON.parse(json) : null;
    return {
      cargado: v?.cargado && typeof v.cargado === "object" ? v.cargado : {},
      sin_producto: Array.isArray(v?.sin_producto) ? v.sin_producto : [],
    };
  } catch {
    return { cargado: {}, sin_producto: [] };
  }
}

/** La recepcion esta cerrada y su carga en Odoo puede seguir. */
export function abiertaParaSeriales(rec: any): boolean {
  if (rec?.etapa !== "cerrado" || !Number(rec.odoo_purchase_order_id)) return false;
  if (rec.odoo_estado === "error") return true;
  return rec.odoo_estado === "cargado" && resultadoDe(rec.odoo_resultado).sin_producto.length > 0;
}

// Producto y tracking de cada renglon: se pregunta a Odoo en cada lectura de
// la pistola, asi que se guarda un rato. La llave cambia si a un renglon se le
// cruza otro producto.
const cache = new Map<string, { hasta: number; valor: Map<number, { pid: number; conSerial: boolean }> }>();
const DURA_MS = 5 * 60_000;

async function productoConSerial(rec: any, items: any[]): Promise<Map<number, { pid: number; conSerial: boolean }>> {
  const poId = Number(rec.odoo_purchase_order_id);
  const llave = `${rec.id}:${poId}:${items.map((i) => `${i.id}/${i.odoo_product_id || ""}/${i.codigo || ""}`).join(",")}`;
  const ya = cache.get(llave);
  if (ya && ya.hasta > Date.now()) return ya.valor;

  const productoDe = await productoPorRenglon(items, await productosDeLaOc(poId));
  const pids = [...new Set(productoDe.values())];
  const productos = pids.length
    ? await callOdooRPCEstricto<any[]>("product.product", "read", [pids, ["tracking"]], { context: { active_test: false } })
    : [];
  const conSerial = new Set((productos || []).filter((p) => p.tracking && p.tracking !== "none").map((p) => Number(p.id)));
  const valor = new Map<number, { pid: number; conSerial: boolean }>();
  for (const [itemId, pid] of productoDe) valor.set(itemId, { pid, conSerial: conSerial.has(pid) });

  for (const [k, v] of cache) if (v.hasta <= Date.now()) cache.delete(k);
  cache.set(llave, { hasta: Date.now() + DURA_MS, valor });
  return valor;
}

/**
 * Renglones de la recepcion (`cargarRecepcion`) que pueden recibir seriales
 * con la recepcion cerrada. Vacio si la recepcion no esta en ese caso. Los
 * que ya tienen todos sus seriales tambien van (faltan = 0): se pueden quitar
 * los mal pistoleados.
 */
export async function renglonesSinSeriales(datos: { recepcion: any; items: any[] }): Promise<RenglonSinSeriales[]> {
  const rec = datos.recepcion;
  if (!abiertaParaSeriales(rec)) return [];
  const cargado = resultadoDe(rec.odoo_resultado).cargado;
  // Lo de otra factura (factura_aparte) no se carga aca: no pide seriales.
  const recibidos = datos.items.filter((i) => Number(i.cantidad_recibida || 0) > 0 && !i.factura_aparte);
  if (recibidos.length === 0) return [];
  const producto = await productoConSerial(rec, recibidos);
  return recibidos
    .filter((i) => {
      const p = producto.get(Number(i.id));
      return p?.conSerial && !cargado[String(p.pid)];
    })
    .map((i) => {
      const cantidad = r3(Number(i.cantidad_recibida));
      const pistoleados = (i.seriales || []).length;
      return {
        item_id: Number(i.id),
        codigo: i.codigo ?? null,
        producto: String(i.producto || ""),
        cantidad,
        pistoleados,
        faltan: r3(cantidad - pistoleados),
      };
    });
}
