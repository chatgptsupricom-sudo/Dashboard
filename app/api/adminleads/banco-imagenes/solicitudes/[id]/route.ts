import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/publicOrigin";
import {
  ErrorFlyer,
  agregarItems,
  aprobarSolicitud,
  descartarItem,
  rechazarSolicitud,
} from "@/lib/banco-imagenes/solicitudes";
import { avisarAvance, avisarFlyer } from "@/lib/banco-imagenes/avisoSolicitud";
import { ROLES_ADMIN_FLYERS, nombreDe, sedeDe } from "@/lib/banco-imagenes/accesoSolicitudes";

export const dynamic = "force-dynamic";

/** accion: aprobar | rechazar (motivo) | descartar_item (item_id, nota) | agregar_items (productos[]) */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRoles(request, ROLES_ADMIN_FLYERS);
  if (auth.error) return auth.error;
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    const body = await request.json();
    const cids = sedeDe(auth.payload);
    const usuario = nombreDe(auth.payload);
    const origen = getPublicOrigin(request);

    switch (body?.accion) {
      case "aprobar": {
        const r = await aprobarSolicitud({ id, cids, usuario });
        avisarFlyer(r.completada ? "completada" : "aprobada", id, origen);
        return NextResponse.json({ success: true, ...r });
      }
      case "rechazar":
        await rechazarSolicitud({ id, cids, motivo: String(body?.motivo || ""), usuario });
        avisarFlyer("rechazada", id, origen);
        return NextResponse.json({ success: true });
      case "descartar_item": {
        const r = await descartarItem({
          solicitudId: id,
          itemId: Number(body?.item_id),
          cids,
          nota: String(body?.nota || ""),
          usuario,
        });
        avisarAvance(r, origen);
        return NextResponse.json({ success: true });
      }
      case "agregar_items":
        await agregarItems({
          id,
          cids,
          productos: Array.isArray(body?.productos) ? body.productos.map(Number) : [],
          usuario,
        });
        return NextResponse.json({ success: true });
      default:
        return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
    }
  } catch (e: any) {
    if (e instanceof ErrorFlyer) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("Solicitud de flyer (admin):", e);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
