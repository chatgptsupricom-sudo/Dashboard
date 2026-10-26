import { requireRoles } from "@/lib/auth/roles";
import { avisarPersonal } from "@/lib/solicitudes-personal/aviso";
import { aprobar, editar, historial, obtener, rechazar, retirar, usuarioDe } from "@/lib/solicitudes-personal/datos";
import { ROLES_SOLICITAN, ROLES_SOLICITUDES_PERSONAL } from "@/lib/solicitudes-personal/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Una solicitud de personal.
//   GET   -> { solicitud, historial }  solo si quien llama la puede ver.
//   PUT   {campos}                     quien la pidió, mientras esté por aprobar.
//   PATCH {accion: "retirar"}          quien la pidió, mientras esté por aprobar.
//   PATCH {accion: "aprobar" | "rechazar", motivo?}  solo el SuperAdmin.

type Ctx = { params: Promise<{ id: string }> };

const fallo = (e: any) => NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });

export async function GET(request: NextRequest, { params }: Ctx) {
  const auth = await requireRoles(request, ROLES_SOLICITUDES_PERSONAL);
  if (auth.error) return auth.error;
  const id = Number((await params).id);
  const solicitud = await obtener(id, usuarioDe(auth.payload));
  if (!solicitud) return NextResponse.json({ error: "No existe o no la puedes ver" }, { status: 404 });
  return NextResponse.json({ solicitud, historial: await historial(id) });
}

export async function PUT(request: NextRequest, { params }: Ctx) {
  const auth = await requireRoles(request, ROLES_SOLICITAN);
  if (auth.error) return auth.error;
  try {
    await editar(Number((await params).id), await request.json().catch(() => ({})), usuarioDe(auth.payload));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fallo(e);
  }
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  const b = await request.json().catch(() => ({}));
  const decide = b?.accion === "aprobar" || b?.accion === "rechazar";
  // Lista vacía = solo el SuperAdmin (requireRoles lo deja pasar siempre).
  const auth = await requireRoles(request, decide ? [] : ROLES_SOLICITAN);
  if (auth.error) return auth.error;
  const id = Number((await params).id);
  const u = usuarioDe(auth.payload);
  try {
    if (b?.accion === "aprobar") {
      await aprobar(id, u);
      avisarPersonal("aprobada", id);
    } else if (b?.accion === "rechazar") {
      await rechazar(id, b?.motivo, u);
      avisarPersonal("rechazada", id);
    } else if (b?.accion === "retirar") {
      await retirar(id, u);
    } else {
      return NextResponse.json({ error: "Acción inválida" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fallo(e);
  }
}
