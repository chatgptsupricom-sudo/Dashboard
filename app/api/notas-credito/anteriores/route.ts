import { requireNC } from "@/lib/notas-credito/acceso";
import { pasarAlFlujo } from "@/lib/notas-credito/anteriores";
import { ErrorNC } from "@/lib/notas-credito/solicitudes";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST { rma_nota_id }: pasa una solicitud pendiente de RMA al flujo (SuperAdmin o quien preaprueba en la sede). */
export async function POST(request: NextRequest) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  try {
    const body = await request.json().catch(() => ({}));
    const rmaNotaId = parseInt(String(body.rma_nota_id ?? ""), 10);
    if (!rmaNotaId) return NextResponse.json({ error: "rma_nota_id requerido" }, { status: 400 });
    const id = await pasarAlFlujo(rmaNotaId, acceso!.autor, acceso!.superadmin, getPublicOrigin(request));
    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    if (e instanceof ErrorNC) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/notas-credito/anteriores:", e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
