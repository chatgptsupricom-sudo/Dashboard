import { requireRoles } from "@/lib/auth/roles";
import { entrevistaDelGerente, usuarioDe } from "@/lib/solicitudes-personal/datos";
import { ROLES_SOLICITAN } from "@/lib/solicitudes-personal/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// PATCH {entrevista_tecnica_fecha?, entrevista_tecnica?, entrevista_tecnica_concepto?}
//   El gerente que pidió el cargo anota la entrevista técnica de un candidato de
//   su proceso; el cambio queda en el historial del candidato en Selección.

type Ctx = { params: Promise<{ id: string; cid: string }> };

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const auth = await requireRoles(request, ROLES_SOLICITAN);
  if (auth.error) return auth.error;
  const { id, cid } = await params;
  try {
    await entrevistaDelGerente(Number(id), Number(cid), await request.json().catch(() => ({})), usuarioDe(auth.payload));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
