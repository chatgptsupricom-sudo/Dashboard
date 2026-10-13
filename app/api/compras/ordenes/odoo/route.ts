import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { lineasOrdenOdoo, listarOrdenesOdoo } from "@/lib/compras/ordenesOdoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/compras/ordenes/odoo         todas las purchase.order de las tres sedes
 * GET /api/compras/ordenes/odoo?id=123  líneas de esa orden
 *
 * Solo SuperAdmin: Compras solo ve las órdenes que creó en el panel.
 */
export async function GET(request: NextRequest) {
  const { error } = await requireRoles(request, []);
  if (error) return error;

  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (Number.isInteger(id) && id > 0) {
      return NextResponse.json({ success: true, lineas: await lineasOrdenOdoo(id) });
    }
    return NextResponse.json({ success: true, data: await listarOrdenesOdoo() });
  } catch (e: any) {
    console.error("Error leyendo órdenes de compra de Odoo:", e);
    return NextResponse.json({ error: e?.message || "Error leyendo Odoo" }, { status: 502 });
  }
}
