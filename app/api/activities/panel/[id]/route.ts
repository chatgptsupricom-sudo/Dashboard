// Panel de actividades: cambiar (cualquier campo, solo lo que venga) y borrar.
import { requireSession } from "@/lib/auth/roles";
import { actualizar, alcanceDe, borrar, ErrorActividad } from "@/lib/actividades/datos";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function error(e: unknown) {
  if (e instanceof ErrorActividad) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error("[activities/panel/id]", e);
  return NextResponse.json({ error: "Error en actividades" }, { status: 500 });
}

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  try {
    const id = Number((await params).id);
    if (!id) return NextResponse.json({ error: "Actividad inválida" }, { status: 400 });
    const body = await req.json().catch(() => ({}));
    const actividad = await actualizar(alcanceDe(auth.payload), id, body ?? {});
    return NextResponse.json({ actividad });
  } catch (e) {
    return error(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;
  try {
    const id = Number((await params).id);
    if (!id) return NextResponse.json({ error: "Actividad inválida" }, { status: 400 });
    await borrar(alcanceDe(auth.payload), id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return error(e);
  }
}
