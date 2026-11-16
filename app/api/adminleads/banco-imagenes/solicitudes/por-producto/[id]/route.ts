import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { ErrorFlyer, descartarPendiente } from "@/lib/banco-imagenes/solicitudes";
import { avisarAvance } from "@/lib/banco-imagenes/avisoSolicitud";
import { ROLES_ADMIN_FLYERS, nombreDe } from "@/lib/banco-imagenes/accesoSolicitudes";

export const dynamic = "force-dynamic";

/** `{ accion: "descartar", nota }`: el producto no se hará, en todas las solicitudes que lo piden. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, ROLES_ADMIN_FLYERS);
  if (auth.error) return auth.error;
  try {
    const pendienteId = Number((await params).id);
    const body = await request.json();
    if (!Number.isInteger(pendienteId) || pendienteId <= 0 || body?.accion !== "descartar") {
      return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }
    const r = await descartarPendiente({ pendienteId, nota: String(body?.nota || ""), usuario: nombreDe(auth.payload) });
    avisarAvance(r, getPublicOrigin(request));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof ErrorFlyer) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Descartar flyer por producto:", e);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
