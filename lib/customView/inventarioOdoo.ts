import { almacenSede } from "@/lib/compras/datosOdoo";
import { callOdooRPC } from "@/lib/odoo";

/**
 * Productos vendibles de Odoo para los HTML de Frecuencia CPM, con el stock y
 * el precio de una sede: `{ id, sku, name, brand, stock, reservado, price }`,
 * de más a menos stock. null si Odoo no responde.
 *
 * El stock es el del almacén principal de la sede (`almacenSede` de Compras:
 * Existencias + Entrada), no el `qty_available` de la empresa, que suma Mal
 * Estado, RMA, Exhibición... `stock` = existencia (unidades físicas; la clave
 * se queda así porque los HTML subidos leen `stock`) y `reservado` = lo
 * reservado para pedidos.
 */
export async function productosParaFrecuencia(filtro: any[], companyId: number, opciones: { soloConStock?: boolean; limite?: number } = {}) {
  const limite = opciones.limite ?? 500;
  const soloConStock = opciones.soloConStock !== false;
  let almacen: Awaited<ReturnType<typeof almacenSede>>;
  try {
    almacen = await almacenSede(companyId);
  } catch (e: any) {
    console.error("[frecuencia] almacén principal:", e?.message);
    return null;
  }
  const conExistencia = [...almacen.stock.entries()].filter(([, s]) => s.fisico > 0).map(([id]) => id);
  if (soloConStock && !conExistencia.length) return [];

  const productos = await callOdooRPC<any[]>(
    "product.product",
    "search_read",
    [
      [
        ["sale_ok", "=", true],
        ["active", "=", true],
        ["type", "=", "product"],
        ...(soloConStock ? [["id", "in", conExistencia]] : []),
        ...filtro,
      ],
    ],
    {
      fields: ["id", "default_code", "display_name", "spiff_brand_id", "company_sale_price", "list_price"],
      // Con stock, la búsqueda ya está acotada a lo que hay en el almacén: se
      // lee entera y el límite se aplica después, a los de más existencia.
      ...(soloConStock ? {} : { limit: limite }),
      context: { allowed_company_ids: [companyId], lang: "es_VE" },
    },
  );
  if (!productos) return null;
  return productos
    .map((p) => {
      const s = almacen.stock.get(p.id);
      return {
        id: p.id,
        sku: typeof p.default_code === "string" ? p.default_code : "",
        name: p.display_name,
        brand: Array.isArray(p.spiff_brand_id) ? p.spiff_brand_id[1] : "",
        stock: Math.round(s?.fisico ?? 0),
        reservado: Math.round(s?.reservado ?? 0),
        price: Math.round((Number(p.company_sale_price) || Number(p.list_price) || 0) * 100) / 100,
      };
    })
    .sort((a, b) => b.stock - a.stock)
    .slice(0, limite);
}

const SEDES = [9, 10, 7];
/** Sede del usuario (superadmin y sin sede: Valencia). */
export const sedeDeUsuario = (cids: unknown) => (SEDES.includes(Number(cids)) ? Number(cids) : 9);
