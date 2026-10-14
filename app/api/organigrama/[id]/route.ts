import { requireRoles } from "@/lib/auth/roles";
import { actualizarNodo, borrarNodo } from "@/lib/organigrama/datos";
import { ROLES_ORGANIGRAMA } from "@/lib/organigrama/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// PUT: cambia los campos que vengan (datos, actividades, superior; mover: -1|1
// lo corre entre sus hermanos). DELETE: borra el cargo y sus subordinados
// suben a su superior. SuperAdmin y rol Procesos.

export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_ORGANIGRAMA);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Cargo no encontrado" }, { status: 404 });
  try {
    await actualizarNodo(id, (await request.json()) ?? {}, String(auth.payload?.email ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_ORGANIGRAMA);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Cargo no encontrado" }, { status: 404 });
  await borrarNodo(id);
  return NextResponse.json({ ok: true });
}
