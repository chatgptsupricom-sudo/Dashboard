import { puedeVerSede, requireNC } from "@/lib/notas-credito/acceso";
import { detalle, ejecutarAccion, ErrorNC, obtener, permisosSobre } from "@/lib/notas-credito/solicitudes";
import type { AccionNC } from "@/lib/notas-credito/tipos";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ACCIONES: AccionNC[] = [
  "preaprobar", "aprobar", "rechazar", "factura", "crear_odoo", "guardar_borrador", "publicar", "vincular", "sincronizar",
];

type Ctx = { params: Promise<{ id: string }> };

/** GET: la solicitud con su historial, la NC de Odoo y qué puede hacer la sesión. */
export async function GET(request: NextRequest, { params }: Ctx) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  const id = parseInt((await params).id, 10);
  try {
    const sol = await obtener(id);
    if (!sol || !puedeVerSede(acceso!, sol.company_id)) {
      return NextResponse.json({ error: "Nota de crédito no encontrada" }, { status: 404 });
    }
    const d = await detalle(id, getPublicOrigin(request));
    if (!d) return NextResponse.json({ error: "Nota de crédito no encontrada" }, { status: 404 });
    return NextResponse.json({ success: true, ...d, puede: await permisosSobre(d.solicitud, acceso!.autor) });
  } catch (e: any) {
    console.error(`GET /api/notas-credito/${id}:`, e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}

/** POST { accion, ... }: un paso del flujo. Cada acción vuelve a chequear quién la hace. */
export async function POST(request: NextRequest, { params }: Ctx) {
  const { acceso, error } = await requireNC(request);
  if (error) return error;
  const id = parseInt((await params).id, 10);
  try {
    const body = await request.json().catch(() => ({}));
    const accion = body.accion as AccionNC;
    if (!ACCIONES.includes(accion)) return NextResponse.json({ error: "Acción desconocida" }, { status: 400 });
    const sol = await obtener(id);
    if (!sol || !puedeVerSede(acceso!, sol.company_id)) {
      return NextResponse.json({ error: "Nota de crédito no encontrada" }, { status: 404 });
    }
    const extra = await ejecutarAccion(id, accion, body, acceso!.autor, getPublicOrigin(request));
    return NextResponse.json({ success: true, ...extra });
  } catch (e: any) {
    if (e instanceof ErrorNC) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
    console.error(`POST /api/notas-credito/${id}:`, e?.message);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
