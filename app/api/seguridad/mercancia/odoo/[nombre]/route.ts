import { requireSeguridad } from "@/lib/seguridad/auth";
import {
  buscarFacturaCompra,
  buscarPickingPorNombre,
} from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/odoo/{nombre}?tipo=ingreso|egreso
 *
 * Trae de Odoo el documento con el que viaja la mercancia y sus lineas, para
 * prellenar el acta. Cada flujo llega con el suyo:
 *
 *   egreso  -> orden de despacho (stock.picking). Ej: PRIN1/OUT/05838
 *   ingreso -> factura de la orden de compra (account.move). Ej: FACTU/2026/08/0064
 *
 * Por defecto busca la orden de despacho, que era el unico caso al principio.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ nombre: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { nombre } = await params;
    const tipo = new URL(request.url).searchParams.get("tipo");
    const buscado = decodeURIComponent(nombre);

    const picking =
      tipo === "ingreso"
        ? await buscarFacturaCompra(buscado)
        : await buscarPickingPorNombre(buscado);

    if (!picking) {
      return NextResponse.json(
        {
          error:
            tipo === "ingreso"
              ? "No encontramos esa factura de compra"
              : "No encontramos esa orden de despacho",
        },
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
