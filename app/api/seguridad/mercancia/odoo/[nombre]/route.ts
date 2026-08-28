import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  buscarFacturaCompra,
  buscarFacturaVenta,
} from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/odoo/{nombre}?tipo=ingreso|egreso
 *
 * Trae de Odoo el documento con el que viaja la mercancia y sus lineas, para
 * prellenar el acta. Los dos flujos trabajan por factura, no por el
 * picking/orden de despacho — el almacen no maneja ese documento en el dia a
 * dia:
 *
 *   egreso  -> factura de venta (account.move, out_invoice). Ej: FACTU/2026/08/0064
 *   ingreso -> factura de la orden de compra (account.move, in_invoice). Ej: FACTU/2026/08/0064
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
    // Almacen solo busca facturas de venta para el egreso.
    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    if (tipo === "ingreso" && rol !== "seguridad" && rol !== "superadmin") {
      return NextResponse.json(
        { error: "El ingreso de mercancia lo registra Seguridad" },
        { status: 403 },
      );
    }

    const factura =
      tipo === "ingreso"
        ? await buscarFacturaCompra(buscado, cids)
        : await buscarFacturaVenta(buscado, cids);

    if (!factura) {
      return NextResponse.json(
        {
          error:
            tipo === "ingreso"
              ? "No encontramos esa factura de compra"
              : "No encontramos esa factura de venta",
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, picking: factura });
  } catch (error: any) {
    console.error("Error buscando factura en Odoo:", error);
    return NextResponse.json(
      { error: "No se pudo consultar Odoo" },
      { status: 502 },
    );
  }
}
