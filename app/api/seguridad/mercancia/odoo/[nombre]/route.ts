import { requireSeguridad } from "@/lib/seguridad/auth";
import { buscarPickingPorNombre } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/odoo/{nombre}
 *
 * Trae de Odoo la orden de entrega y sus lineas, para prellenar la carga del
 * camion. Ej: PRIN1/OUT/05838
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nombre: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { nombre } = await params;
    const picking = await buscarPickingPorNombre(decodeURIComponent(nombre));

    if (!picking) {
      return NextResponse.json(
        { error: "No encontramos esa orden de entrega" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, picking });
  } catch (error: any) {
    console.error("Error buscando picking en Odoo:", error);
    return NextResponse.json(
      { error: "No se pudo consultar Odoo" },
      { status: 502 },
    );
  }
}
