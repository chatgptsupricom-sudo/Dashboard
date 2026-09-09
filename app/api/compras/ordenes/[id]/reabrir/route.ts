import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import {
  actorDePayload,
  getOrden,
  reabrirOrden,
} from "@/lib/compras/ordenesEstado";

// POST /api/compras/ordenes/[id]/reabrir
// Solo superadmin: deshace una aprobación (aprobada -> borrador).
// Body opcional: { reason?: string }.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const reason: string | null = body?.reason ?? body?.motivo ?? null;

    const order = await getOrden(id);
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const res = await reabrirOrden(order, actorDePayload(auth.payload), reason);
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    return NextResponse.json({ success: true, order: res.order });
  } catch (error: any) {
    console.error("Error reabriendo orden de compra:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
