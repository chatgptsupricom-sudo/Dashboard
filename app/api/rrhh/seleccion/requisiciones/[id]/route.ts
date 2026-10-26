import { requireRoles } from "@/lib/auth/roles";
import { borrarRequisicion, editarRequisicion } from "@/lib/seleccion/datos";
import { cambioDeRequisicion, estadoGuardado, solicitudDeRequisicion } from "@/lib/solicitudes-personal/datos";
import { ESTADOS_CON_MOTIVO } from "@/lib/solicitudes-personal/tipos";
import { ROLES_SELECCION } from "@/lib/seleccion/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

// PUT (la requisición entera; motivo_estado al pausarla o cancelarla) / DELETE (solo sin
// candidatos y si no nació de una solicitud de personal). RRHH y SuperAdmin.
export async function PUT(request: NextRequest, ctx: Ctx) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  const id = await idDe(ctx);
  if (!id) return NextResponse.json({ error: "Requisición no encontrada" }, { status: 404 });
  try {
    const b = await request.json().catch(() => ({}));
    const antes = await estadoGuardado(id);
    const motivo = String(b?.motivo_estado ?? "").trim();
    // El gerente que la pidió ve por qué se pausó o canceló su búsqueda.
    if (b?.estado !== antes && ESTADOS_CON_MOTIVO.includes(b?.estado) && !motivo && (await solicitudDeRequisicion(id))) {
      throw new Error("Escribe el motivo: lo ve el gerente que pidió el cargo.");
    }
    await editarRequisicion(id, b);
    await cambioDeRequisicion(id, antes, b?.estado, motivo, String(auth.payload?.name ?? auth.payload?.email ?? ""));
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
    const sp = await solicitudDeRequisicion(id);
    if (sp) throw new Error(`Nació de la solicitud de personal SP-${sp}: cancélala en vez de borrarla.`);
    await borrarRequisicion(id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo borrar" }, { status: 400 });
  }
}
