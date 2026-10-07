import { requireRoles, requireSession } from "@/lib/auth/roles";
import { borrarManual, guardarManual, obtenerManual, puedeVer } from "@/lib/manuales/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET: el manual, si el rol puede verlo. PUT / DELETE: solo SuperAdmin.
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  const manual = id ? await obtenerManual(id) : null;
  // 404 también sin permiso: no se cuenta qué manuales existen para otros roles.
  if (!manual || !puedeVer(manual, String(auth.payload?.role ?? "")))
    return NextResponse.json({ error: "Manual no encontrado" }, { status: 404 });
  return NextResponse.json({ manual });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id || !(await obtenerManual(id))) return NextResponse.json({ error: "Manual no encontrado" }, { status: 404 });
  try {
    await guardarManual(id, await request.json(), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Manual no encontrado" }, { status: 404 });
  await borrarManual(id);
  return NextResponse.json({ ok: true });
}
