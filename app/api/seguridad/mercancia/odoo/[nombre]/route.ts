import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
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
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { nombre } = await params;
    const tipo = new URL(request.url).searchParams.get("tipo");
    const buscado = decodeURIComponent(nombre);

    // El ingreso (factura de compra) sigue siendo exclusivo de Seguridad —
    // Almacen solo busca ordenes de despacho para el egreso.
    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    if (tipo === "ingreso" && rol !== "seguridad" && rol !== "superadmin") {
      return NextResponse.json(
        { error: "El ingreso de mercancia lo registra Seguridad" },
        { status: 403 },
      );
    }

    const picking =
      tipo === "ingreso"
        ? await buscarFacturaCompra(buscado, cids)
        : await buscarPickingPorNombre(buscado, cids);

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
