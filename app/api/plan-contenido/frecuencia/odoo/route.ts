import { NextRequest, NextResponse } from "next/server";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { requireRoles } from "@/lib/auth/roles";
import { productosParaFrecuencia, sedeDeUsuario } from "@/lib/customView/inventarioOdoo";

export const dynamic = "force-dynamic";

/**
 * Buscador de inventario del HTML de Frecuencia CPM ("Crear CPMs").
 * GET ?tipo=categoria|producto|marca&valor=texto
 *  → { products: [{ id, sku, name, brand, stock, price }] } con stock > 0
 * en la sede del usuario (superadmin: Valencia).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads", "diseñador", ROL_BI]);
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

  const products = await productosParaFrecuencia(filtro, sedeDeUsuario(auth.payload?.cids));
  if (!products) return NextResponse.json({ error: "No se pudo conectar con Odoo" }, { status: 502 });
  return NextResponse.json({ products });
}
