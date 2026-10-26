import { requireRoles } from "@/lib/auth/roles";
import { borrar, detalle, editar, reabrir } from "@/lib/rutagrama/datos";
import { ROLES_RUTAGRAMA } from "@/lib/rutagrama/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Un rutagrama.
//   GET                                   -> { registro }  con la firma, el token del enlace y las versiones
//   PATCH {accion: "reabrir"}             vuelve a abrir el enlace con lo último que mandó
//   PATCH {nombre?, cedula?, cargo?, sede?}  corrige la invitación
//   DELETE

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  const registro = id ? await detalle(id) : null;
  if (!registro) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  return NextResponse.json({ registro });
}

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  try {
    const b = await request.json().catch(() => ({}));
    if (b?.accion === "reabrir") await reabrir(id);
    else await editar(id, b);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  await borrar(id);
  return NextResponse.json({ ok: true });
}
