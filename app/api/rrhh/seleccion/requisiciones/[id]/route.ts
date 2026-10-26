import { requireRoles } from "@/lib/auth/roles";
import { borrarRequisicion, editarRequisicion } from "@/lib/seleccion/datos";
import { ROLES_SELECCION } from "@/lib/seleccion/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// PUT (la requisición entera) / DELETE (solo sin candidatos). RRHH y SuperAdmin.
export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Requisición no encontrada" }, { status: 404 });
  try {
    await editarRequisicion(id, await request.json().catch(() => ({})));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Requisición no encontrada" }, { status: 404 });
  try {
    await borrarRequisicion(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo borrar" }, { status: 400 });
  }
}
