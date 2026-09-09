import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import {
  actorDePayload,
  getOrden,
  rechazarOrden,
} from "@/lib/compras/ordenesEstado";

// POST /api/compras/ordenes/[id]/rechazar
// Solo superadmin. Body: { reason: string } (motivo obligatorio).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason: string = body?.reason ?? body?.motivo ?? "";

    const order = await getOrden(id);
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const res = await rechazarOrden(order, actorDePayload(auth.payload), reason);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    return NextResponse.json({ success: true, order: res.order });
  } catch (error: any) {
    console.error("Error rechazando orden de compra:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
