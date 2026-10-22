import { requireRoles } from "@/lib/auth/roles";
import { borrarFlujograma, guardarFlujograma, obtenerFlujograma } from "@/lib/flujogramas/datos";
import { ROLES_FLUJOGRAMAS } from "@/lib/flujogramas/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// GET / PUT (el flujograma entero) / DELETE. SuperAdmin y rol Procesos.
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_FLUJOGRAMAS);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  const flujograma = id ? await obtenerFlujograma(id) : null;
  if (!flujograma) return NextResponse.json({ error: "Flujograma no encontrado" }, { status: 404 });
  return NextResponse.json({ flujograma });
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_FLUJOGRAMAS);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id || !(await obtenerFlujograma(id)))
    return NextResponse.json({ error: "Flujograma no encontrado" }, { status: 404 });
  try {
    await guardarFlujograma(id, await request.json(), String(auth.payload?.email ?? ""));
    return NextResponse.json({ flujograma: await obtenerFlujograma(id) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_FLUJOGRAMAS);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Flujograma no encontrado" }, { status: 404 });
  await borrarFlujograma(id);
  return NextResponse.json({ ok: true });
}
