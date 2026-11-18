import { NextRequest, NextResponse } from "next/server";
import { alcanceRotacion, puedeVerSolicitud } from "@/lib/rotacion-inventario/alcance";
import { ErrorSolicitud, actualizarSolicitud, detalleSolicitud, envioPorN8n, leerSolicitud } from "@/lib/rotacion-inventario/solicitudes";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const idDe = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  return Number.isInteger(id) && id > 0 ? id : null;
};

/** GET: la solicitud con sus productos, cómo va la liquidación y el historial. */
export async function GET(request: NextRequest, ctx: Ctx) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  const id = await idDe(ctx);
  const det = id ? await detalleSolicitud(id) : null;
  if (!det || !puedeVerSolicitud(a, det.solicitud)) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  return NextResponse.json({ ...det, envioPorCorreo: envioPorN8n(), puedeGestionar: a.puedeGestionarSolicitudes });
}

/** PATCH: respuesta de la marca, apoyo, acción acordada, estado y, por producto, apoyo / remate / acción. */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const a = await alcanceRotacion(request, { soloEdita: true });
  if (a.error) return a.error;
  const id = await idDe(ctx);
  const s = id ? await leerSolicitud(id) : null;
  if (!s || !puedeVerSolicitud(a, s)) return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  try {
    const cambios = await actualizarSolicitud(s.id, body, a.usuario);
    return NextResponse.json({ ok: true, cambios });
  } catch (e: any) {
    if (e instanceof ErrorSolicitud) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[rotacion-inventario/solicitudes] PATCH:", e?.message);
    return NextResponse.json({ error: "No se pudo guardar." }, { status: 500 });
  }
}
