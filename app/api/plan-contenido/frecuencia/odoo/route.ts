import { NextRequest, NextResponse } from "next/server";
import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * Buscador de inventario del HTML de Frecuencia CPM ("Crear CPMs").
 * GET ?tipo=categoria|producto|marca&valor=texto
 *  → { products: [{ id, sku, name, brand, stock, price }] } con stock > 0
 * en la sede del usuario (superadmin: Valencia).
 */
const SEDES = [9, 10, 7];

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads", "diseñador"]);
  if (auth.error) return auth.error;

  const tipo = request.nextUrl.searchParams.get("tipo");
  const valor = (request.nextUrl.searchParams.get("valor") || "").trim().slice(0, 100);
  if (!valor) return NextResponse.json({ error: "Escribe que buscar" }, { status: 400 });

  // Marca = spiff_brand_id, la misma de Metas por marca y Compras.
  const filtro: any[] =
    tipo === "categoria" ? [["categ_id.complete_name", "ilike", valor]]
    : tipo === "marca" ? [["spiff_brand_id.name", "ilike", valor]]
    : tipo === "producto" ? ["|", ["name", "ilike", valor], ["default_code", "ilike", valor]]
    : [];
  if (!filtro.length) return NextResponse.json({ error: "Tipo de busqueda invalido" }, { status: 400 });

  const cids = Number(auth.payload?.cids);
  const companyId = SEDES.includes(cids) ? cids : 9;

  const productos = await callOdooRPC<any[]>(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true], ["active", "=", true], ["type", "=", "product"], ["qty_available", ">", 0], ...filtro]],
    {
      fields: ["id", "default_code", "display_name", "spiff_brand_id", "qty_available", "company_sale_price", "list_price"],
      limit: 500,
      context: { allowed_company_ids: [companyId], lang: "es_VE" },
    },
  );
  if (!productos) return NextResponse.json({ error: "No se pudo conectar con Odoo" }, { status: 502 });

  const products = productos
    .map((p) => ({
      id: p.id,
      sku: typeof p.default_code === "string" ? p.default_code : "",
      name: p.display_name,
      brand: Array.isArray(p.spiff_brand_id) ? p.spiff_brand_id[1] : "",
      stock: Math.round(Number(p.qty_available) || 0),
      price: Math.round((Number(p.company_sale_price) || Number(p.list_price) || 0) * 100) / 100,
    }))
    .sort((a, b) => b.stock - a.stock);

  return NextResponse.json({ products });
}
