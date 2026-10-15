import { callOdooRPC } from "@/lib/odoo";

/**
 * Productos vendibles de Odoo para los HTML de Frecuencia CPM, con el stock y
 * el precio de una sede: `{ id, sku, name, brand, stock, price }`, de más a
 * menos stock. null si Odoo no responde.
 */
export async function productosParaFrecuencia(filtro: any[], companyId: number, opciones: { soloConStock?: boolean; limite?: number } = {}) {
  const productos = await callOdooRPC<any[]>(
    "product.product",
    "search_read",
    [
      [
        ["sale_ok", "=", true],
        ["active", "=", true],
        ["type", "=", "product"],
        ...(opciones.soloConStock === false ? [] : [["qty_available", ">", 0]]),
        ...filtro,
      ],
    ],
    {
      fields: ["id", "default_code", "display_name", "spiff_brand_id", "qty_available", "company_sale_price", "list_price"],
      limit: opciones.limite ?? 500,
      context: { allowed_company_ids: [companyId], lang: "es_VE" },
    },
  );
  if (!productos) return null;
  return productos
    .map((p) => ({
      id: p.id,
      sku: typeof p.default_code === "string" ? p.default_code : "",
      name: p.display_name,
      brand: Array.isArray(p.spiff_brand_id) ? p.spiff_brand_id[1] : "",
      stock: Math.round(Number(p.qty_available) || 0),
      price: Math.round((Number(p.company_sale_price) || Number(p.list_price) || 0) * 100) / 100,
    }))
    .sort((a, b) => b.stock - a.stock);
}

const SEDES = [9, 10, 7];
/** Sede del usuario (superadmin y sin sede: Valencia). */
export const sedeDeUsuario = (cids: unknown) => (SEDES.includes(Number(cids)) ? Number(cids) : 9);
