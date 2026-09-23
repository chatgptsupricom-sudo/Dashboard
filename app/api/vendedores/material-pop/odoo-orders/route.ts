import { requireVendedorValencia } from "@/lib/adminleads/material-pop/auth";
import { leerOrden, ordenesDeVendedor } from "@/lib/adminleads/material-pop/requests";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Órdenes de Odoo del vendedor, para adjuntar a una solicitud sin tener que
 * copiar el número a mano. Con `name` devuelve una sola, con sus renglones.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireVendedorValencia(request);
    if (auth.error) return auth.error;

    const cids = Number(auth.payload?.cids) || 9;
    const { searchParams } = new URL(request.url);
    const name = (searchParams.get("name") || "").trim();

    if (name) {
      const orden = await leerOrden(name, [cids]);
      if (!orden) {
        return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
      }
      return NextResponse.json({ success: true, order: orden });
    }

    const partnerId = Number(searchParams.get("clientId")) || null;
    const orders = await ordenesDeVendedor({
      companyIds: [cids],
      // Solo las suyas: el vendedor adjunta su propia venta.
      odooUserId: Number(auth.payload?.uid) || null,
      partnerId,
    });

    return NextResponse.json({ success: true, orders });
  } catch (error: any) {
    console.error("Error listando órdenes de Odoo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
