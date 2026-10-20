import { idValido, lectorDe, requireEditorPoliticas, requireLectorPoliticas } from "@/lib/politicas/acceso";
import { borrarPolitica, guardarPolitica, obtenerPolitica } from "@/lib/politicas/datos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };
const noEncontrada = () => NextResponse.json({ error: "Política no encontrada" }, { status: 404 });

// GET (quien la puede ver) / PUT / DELETE (Procesos y SuperAdmin) de una política.
export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireLectorPoliticas(request);
  if (auth.error) return auth.error;
  const id = idValido((await ctx.params).id);
  const politica = id ? await obtenerPolitica(lectorDe(auth.payload), id) : null;
  return politica ? NextResponse.json({ politica }) : noEncontrada();
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireEditorPoliticas(request);
  if (auth.error) return auth.error;
  const id = idValido((await ctx.params).id);
  if (!id || !(await obtenerPolitica(lectorDe(auth.payload), id))) return noEncontrada();
  try {
    await guardarPolitica(id, await request.json(), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const auth = await requireEditorPoliticas(request);
  if (auth.error) return auth.error;
  const id = idValido((await ctx.params).id);
  if (!id) return noEncontrada();
  await borrarPolitica(id);
  return NextResponse.json({ ok: true });
}
