import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaParaBI } from "@/lib/intercompania";
import { clasificarClientes, estadoClasificacionClientes, listarClientes } from "@/lib/inteligencia-negocio/clasificacion/clientes";
import { editarCliente, ErrorDatos } from "@/lib/inteligencia-negocio/clasificacion/datos";
import { hayIA } from "@/lib/inteligencia-negocio/clasificacion/ia";
import { instagramValido, normalizarInstagram } from "@/lib/inteligencia-negocio/clasificacion/tipos";
import { SEDES_REPORTES, mesValido } from "@/lib/inteligencia-negocio/reportes";

export const dynamic = "force-dynamic";

/**
 * Clasificación de clientes por actividad comercial (lib/inteligencia-negocio/clasificacion/clientes.ts).
 * GET ?empresa=venezuela|valencia|caracas&mes=YYYY-MM[,YYYY-MM...]: clientes que compraron, con su mezcla y clasificación
 *     (?estado=1: solo el avance de la IA).
 * POST {ids}: clasifica con IA en segundo plano.
 * PATCH {id, instagram?, actividad?, detalle?}: Instagram del cliente o corrección manual.
 * Inteligencia de Negocio escribe aquí: la clasificación es suya (`escribeBI`).
 */
async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  // ?estado=1: solo el avance de la IA, para seguirlo sin releer Odoo.
  if (sp.get("estado")) return NextResponse.json({ success: true, data: { estado: estadoClasificacionClientes() } });
  const empresa = (sp.get("empresa") || "venezuela").toLowerCase();
  const companyIds = SEDES_REPORTES[empresa];
  if (!companyIds) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const meses =(sp.get("mes") || "").split(",").map((m) => m.trim()).filter(Boolean);
  if (meses.length === 0 || meses.length > 36 || !meses.every(mesValido)) {
    return NextResponse.json({ error: "Meses inválidos" }, { status: 400 });
  }

  try {
    const clientes = await listarClientes(companyIds, meses);
    return NextResponse.json({ success: true, data: { empresa, meses, clientes, estado: estadoClasificacionClientes(), hayIA: hayIA() } });
  } catch (e: any) {
    console.error("[bi-clasificacion/clientes]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}

// Inteligencia de Negocio: sin intercompañía (lib/intercompania.ts).
export const GET = conSinIntercompaniaParaBI(leerGET);

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  if (!hayIA()) return NextResponse.json({ error: "No hay IA configurada en el servidor" }, { status: 503 });
  const body = await request.json().catch(() => ({}));
  const ids = Array.isArray(body?.ids) ? [...new Set(body.ids.map(Number).filter((n: number) => Number.isInteger(n) && n > 0))] as number[] : [];
  if (ids.length === 0 || ids.length > 3000) return NextResponse.json({ error: "Clientes inválidos" }, { status: 400 });
  try {
    const iniciados = await clasificarClientes(ids);
    if (iniciados === null) return NextResponse.json({ error: "Ya hay una clasificación corriendo" }, { status: 409 });
    return NextResponse.json({ success: true, data: { iniciados, estado: estadoClasificacionClientes() } });
  } catch (e: any) {
    console.error("[bi-clasificacion/clientes POST]", e?.message);
    return NextResponse.json({ error: "No se pudo empezar la clasificación" }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Cliente inválido" }, { status: 400 });
  let instagram: string | undefined;
  if (body?.instagram !== undefined) {
    instagram = normalizarInstagram(body.instagram);
    if (instagram && !instagramValido(instagram)) return NextResponse.json({ error: "Usuario de Instagram inválido" }, { status: 400 });
  }
  try {
    await editarCliente(id, { instagram, actividad: body?.actividad, detalle: body?.detalle }, String(auth.payload?.email ?? ""));
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e instanceof ErrorDatos) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("[bi-clasificacion/clientes PATCH]", e?.message);
    return NextResponse.json({ error: "No se pudo guardar" }, { status: 500 });
  }
}
