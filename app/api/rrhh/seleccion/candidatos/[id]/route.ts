import { requireRoles } from "@/lib/auth/roles";
import { borrarCandidato, editarCandidato, historialCandidato } from "@/lib/seleccion/datos";
import { revisarCubierta } from "@/lib/solicitudes-personal/datos";
import { ROLES_SELECCION } from "@/lib/seleccion/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET -> { historial }  cada cambio del candidato (seleccion_eventos)
// PATCH {campo: valor, ...} -> { candidato }  solo los campos que vienen
// DELETE

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  return NextResponse.json({ historial: await historialCandidato(id) });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  try {
    const candidato = await editarCandidato(id, await request.json().catch(() => ({})), String(auth.payload?.email ?? ""));
    await revisarCubierta(candidato.requisicion_id, String(auth.payload?.name ?? auth.payload?.email ?? ""));
    return NextResponse.json({ candidato });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Candidato no encontrado" }, { status: 404 });
  await borrarCandidato(id);
  return NextResponse.json({ ok: true });
}
