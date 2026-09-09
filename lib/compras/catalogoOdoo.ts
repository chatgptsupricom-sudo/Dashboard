import { callOdooRPC } from "@/lib/odoo";

export type CatalogoProducto = {
  id: number;
  default_code: string;
  name: string;
  standard_price: number;
  uom: string;
};

export type PrecioProveedor = { price: number; min_qty: number };

/**
 * Busqueda de productos por codigo o nombre para el autocompletar del
 * formulario de orden de compra. Mismo guard de largo minimo que
 * app/api/rma/products/route.ts -- sin eso, un termino vacio o de 1
 * caracter dispara un search_read sin filtro real sobre todo el catalogo.
 */
export async function searchProducts(
  term: string,
  companies: number[],
  limit = 20,
): Promise<CatalogoProducto[]> {
  const q = term.trim();
  if (q.length < 2) return [];

  const domain: any[] = [
    "|",
    ["default_code", "ilike", q],
    ["name", "ilike", q],
  ];

  const products = await callOdooRPC<any[]>(
    "product.product",
    "search_read",
    [domain],
    {
      fields: ["id", "default_code", "name", "standard_price", "uom_id"],
      limit,
      context: companies.length > 0 ? { allowed_company_ids: companies } : undefined,
    },
  );

  return (products || []).map((p: any) => ({
    id: p.id,
    default_code: p.default_code || "",
    name: p.name || "",
    standard_price: p.standard_price || 0,
    uom: Array.isArray(p.uom_id) ? p.uom_id[1] : "",
  }));
}

/**
 * Precios de un proveedor para un set de productos (product.supplierinfo),
 * para autocompletar `unit_price` al armar las lineas de la orden.
 *
 * product.supplierinfo se puede fijar a nivel de variante (`product_id`) o
 * de plantilla (`product_tmpl_id`, aplica a todas sus variantes) -- por eso
 * hace falta resolver primero el `product_tmpl_id` de cada `productId` para
 * poder encontrar tambien los precios fijados a nivel de plantilla. Si un
 * producto tiene registro por variante Y por plantilla, gana el de variante
 * (mas especifico), igual que hace Odoo.
 */
export async function getSupplierPrices(
  productIds: number[],
  supplierId: number,
): Promise<Record<number, PrecioProveedor>> {
  if (productIds.length === 0) return {};

  const products = await callOdooRPC<any[]>(
    "product.product",
    "search_read",
    [[["id", "in", productIds]]],
    { fields: ["id", "product_tmpl_id"], limit: 0 },
  );

  const tmplIdByProduct: Record<number, number> = {};
  const productIdsByTmpl: Record<number, number[]> = {};
  (products || []).forEach((p: any) => {
    const tmplId = Array.isArray(p.product_tmpl_id) ? p.product_tmpl_id[0] : null;
    if (!tmplId) return;
    tmplIdByProduct[p.id] = tmplId;
    (productIdsByTmpl[tmplId] ||= []).push(p.id);
  });
  const tmplIds = Object.keys(productIdsByTmpl).map(Number);

  const domain: any[] = [
    ["partner_id", "=", supplierId],
    "|",
    ["product_id", "in", productIds],
    ["product_tmpl_id", "in", tmplIds],
  ];

  const supplierInfo = await callOdooRPC<any[]>(
    "product.supplierinfo",
    "search_read",
    [domain],
    { fields: ["product_id", "product_tmpl_id", "price", "min_qty"], limit: 0 },
  );

  const result: Record<number, PrecioProveedor> = {};
  const porPlantilla: Record<number, PrecioProveedor> = {};

  (supplierInfo || []).forEach((info: any) => {
    const precio: PrecioProveedor = {
      price: Number(info.price || 0),
      min_qty: Number(info.min_qty || 0),
    };
    const variantId = Array.isArray(info.product_id) ? info.product_id[0] : null;
    const tmplId = Array.isArray(info.product_tmpl_id) ? info.product_tmpl_id[0] : null;

    if (variantId) {
      result[variantId] = precio;
    } else if (tmplId) {
      porPlantilla[tmplId] = precio;
    }
  });

  // Rellenar con el precio de plantilla los productos que no tuvieron uno
  // especifico por variante.
  for (const productId of productIds) {
    if (result[productId]) continue;
    const tmplId = tmplIdByProduct[productId];
    if (tmplId && porPlantilla[tmplId]) {
      result[productId] = porPlantilla[tmplId];
    }
  }

  return result;
}
