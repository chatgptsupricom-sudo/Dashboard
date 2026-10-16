import { seguimientoCliente } from "@/lib/notas-credito/cliente";
import { aplicarLimites } from "@/lib/servicio-tecnico/limites";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/credito-clientes/[token]
 * PÚBLICO: en qué va la nota de crédito que pidió el cliente, con el token
 * que recibió al enviarla. Sin montos ni notas internas: etapa, productos y,
 * al final, el número de la NC o el motivo del rechazo.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const bloqueo = aplicarLimites(request, "nc-seguimiento", [{ max: 30, ventanaSegundos: 60 }]);
  if (bloqueo) return bloqueo;
  try {
    const s = await seguimientoCliente((await params).token);
    if (!s) return NextResponse.json({ error: "No encontramos esa solicitud." }, { status: 404 });
    return NextResponse.json({ success: true, solicitud: s });
  } catch (e: any) {
    console.error("GET /api/credito-clientes/[token]:", e?.message);
    return NextResponse.json({ error: "No pudimos consultar la solicitud. Intenta de nuevo." }, { status: 500 });
  }
}
