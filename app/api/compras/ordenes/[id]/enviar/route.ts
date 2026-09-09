import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import {
  actorDePayload,
  enviarAAprobacion,
  getOrden,
} from "@/lib/compras/ordenesEstado";

// POST /api/compras/ordenes/[id]/enviar
// El creador (rol `compras`) o un superadmin manda la orden a aprobación.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const order = await getOrden(id);
    if (!order) {
      return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });
    }

    const res = await enviarAAprobacion(order, actorDePayload(auth.payload));
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: res.status });
    }
    return NextResponse.json({ success: true, order: res.order });
  } catch (error: any) {
    console.error("Error enviando orden de compra:", error);
    return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
  }
}
