import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { ventasDelProducto } from "@/lib/inteligencia-negocio/porLlegar";

export const dynamic = "force-dynamic";

const SEDES = new Set([7, 9, 10]);

/**
 * GET /api/inteligencia-negocio/por-llegar/ventas?producto=<id>&sede=9|10|7
 * Detalle de las ventas de un producto en la sede: Odoo desde el corte y
 * Smartbit antes (lib/inteligencia-negocio/porLlegar.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const producto = Number(sp.get("producto"));
  const sede = Number(sp.get("sede"));
  if (!Number.isInteger(producto) || producto <= 0 || !SEDES.has(sede)) {
    return NextResponse.json({ error: "Producto o sede inválidos" }, { status: 400 });
  }

  try {
    const ventas = await ventasDelProducto(sede, producto);
    return NextResponse.json({ success: true, data: { ventas } });
  } catch (e: any) {
    console.error("[bi-por-llegar/ventas]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}
