import { NextRequest, NextResponse } from "next/server";
import { ROLES_SOLICITUDES } from "@/lib/rotacion-inventario/acceso";
import { alcanceRotacion, puedeVerSolicitud } from "@/lib/rotacion-inventario/alcance";
import { ErrorSolicitud, enviarSolicitud, leerSolicitud } from "@/lib/rotacion-inventario/solicitudes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST {para, cc, asunto, mensaje} — manda la solicitud a la marca por el flujo
 * de n8n con el Excel adjunto. Con `{manual: true}` solo la marca como enviada
 * (se mandó por otro lado).
 */
export async function POST(request: NextRequest, ctx: Ctx) {
  const a = await alcanceRotacion(request, ROLES_SOLICITUDES);
  if (a.error) return a.error;
  const id = Number((await ctx.params).id);
  const s = id > 0 ? await leerSolicitud(id) : null;
  if (!s || !puedeVerSolicitud(a, s)) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  try {
    await enviarSolicitud(
      s.id,
      {
        para: String(body.para ?? ""),
        cc: String(body.cc ?? ""),
        asunto: String(body.asunto ?? ""),
        mensaje: String(body.mensaje ?? ""),
        manual: !!body.manual,
      },
      a.usuario,
    );
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof ErrorSolicitud) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[rotacion-inventario/enviar]", e?.message);
    return NextResponse.json({ error: "No se pudo enviar." }, { status: 500 });
  }
}
