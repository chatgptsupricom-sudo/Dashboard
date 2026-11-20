import { NextRequest, NextResponse } from "next/server";
import { ROLES_SOLICITUDES } from "@/lib/rotacion-inventario/acceso";
import { alcanceRotacion, sedesPedidas } from "@/lib/rotacion-inventario/alcance";
import { ErrorSolicitud, agregarProductos, envioPorN8n, listarSolicitudes } from "@/lib/rotacion-inventario/solicitudes";

export const dynamic = "force-dynamic";

/**
 * GET /api/rotacion-inventario/solicitudes?sede=9|10|7|todas — solicitudes de
 * apoyo a las marcas (el Gerente de Marca, solo las de sus marcas).
 * POST {sede, productos: [ids]} — agrega esos productos a la solicitud "por
 * enviar" de su marca (Compras, Gerente de Marca y SuperAdmin).
 */
export async function GET(request: NextRequest) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  const sedes = sedesPedidas(a, request.nextUrl.searchParams.get("sede"));
  if (!sedes.length) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  try {
    return NextResponse.json({ solicitudes: await listarSolicitudes(sedes, a.marcas), envioPorCorreo: envioPorN8n() });
  } catch (e: any) {
    console.error("[rotacion-inventario/solicitudes]", e?.message);
    return NextResponse.json({ error: "No se pudo leer la base del panel." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const a = await alcanceRotacion(request, ROLES_SOLICITUDES);
  if (a.error) return a.error;
  const body = await request.json().catch(() => ({}));
  const sede = Number(body.sede);
  let ids: number[] = (Array.isArray(body.productos) ? body.productos : []).map(Number).filter((n: number) => n > 0);
  if (!a.sedesPermitidas.includes(sede) || !ids.length) return NextResponse.json({ error: "Elige la sede y los productos." }, { status: 400 });
  if (a.productos) ids = ids.filter((id) => a.productos!.has(id));
  try {
    const solicitudes = await agregarProductos(sede, ids, a.usuario);
    return NextResponse.json({ ok: true, solicitudes });
  } catch (e: any) {
    if (e instanceof ErrorSolicitud) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[rotacion-inventario/solicitudes] POST:", e?.message);
    return NextResponse.json({ error: "No se pudo crear la solicitud." }, { status: 500 });
  }
}
