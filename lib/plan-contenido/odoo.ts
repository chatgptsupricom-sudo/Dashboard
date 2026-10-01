// ============================================================
// PLAN DE CONTENIDO — Helper para búsqueda de productos Odoo
// ============================================================

import { callOdooRPC } from "@/lib/odoo";
import type { OdooProduct, OdooProductsRequest } from "./types";

// Almacén principal por empresa (igual que en adminleads/catalogo)
const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = {
  9: 9, // Valencia
  10: 10, // Caracas
};

/**
 * Busca productos en Odoo por marca, categoría o nombre.
 */
export async function searchOdooProducts(
  request: OdooProductsRequest,
): Promise<OdooProduct[]> {
  const sede = request.sede || 9;
  const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[sede];

  // Obtener ubicación del almacén
  let locationIds: number[] = [];
  if (warehouseId) {
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "=", warehouseId]]],
      { fields: ["id", "lot_stock_id"], limit: 1 },
    );
    const locId = warehouseData?.[0]?.lot_stock_id?.[0];
    if (locId) locationIds = [locId];
  }

  // Construir dominio de búsqueda
  let domain: any[] = [
    ["sale_ok", "=", true],
    ["active", "=", true],
    ["type", "=", "product"],
  ];

  if (request.tipo === "marca") {
    domain.push(["x_studio_marca", "ilike", request.valor]);
  } else if (request.tipo === "categoria") {
    // Buscar categoría por nombre
    const categs = await callOdooRPC<any[]>(
      "product.category",
      "search_read",
      [["name", "ilike", request.valor]],
      { fields: ["id", "name"], limit: 1 },
    );
    if (categs && categs.length > 0) {
      domain.push(["categ_id", "=", categs[0].id]);
    }
  } else if (request.tipo === "producto") {
    domain.push(["name", "ilike", request.valor]);
  }

  // Buscar productos
  const productos = await callOdooRPC<any[]>(
    "product.product",
    "search_read",
    [domain],
    {
      fields: [
        "id",
        "display_name",
        "name",
        "default_code",
        "categ_id",
        "x_studio_marca",
        "company_sale_price",
      ],
      limit: 5000,
      order: "name asc",
      context: { allowed_company_ids: [sede], lang: "es_VE" },
    },
  );

  if (!productos || productos.length === 0) return [];

  // Obtener stock
  const productIds = productos.map((p: any) => p.id);
  const stockDomain: any[] = [["product_id", "in", productIds]];
  if (locationIds.length > 0) {
    stockDomain.push(["location_id", "child_of", locationIds]);
  } else {
    stockDomain.push(["location_id.usage", "=", "internal"]);
  }

  const stockData = await callOdooRPC<any[]>(
    "stock.quant",
    "search_read",
    [stockDomain],
    {
      fields: ["product_id", "quantity"],
      context: { allowed_company_ids: [sede] },
    },
  );

  // Mapear stock por producto
  const stockMap: Record<number, number> = {};
  if (stockData) {
    stockData.forEach((s: any) => {
      const pid = Array.isArray(s.product_id) ? s.product_id[0] : s.product_id;
      stockMap[pid] = Math.floor(s.quantity || 0);
    });
  }

  // Formatear resultados
  return productos.map((p: any) => ({
    id: p.id,
    sku: p.default_code || `ID-${p.id}`,
    name: p.display_name || p.name,
    brand: p.x_studio_marca || "Sin marca",
    stock: stockMap[p.id] || 0,
    price: p.company_sale_price || 0,
    category: p.categ_id ? p.categ_id[1] : "",
  }));
}
