import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import {
  ErrorSolicitud,
  cancelarSolicitud,
  entregarSolicitud,
  leerOrden,
  listarSolicitudes,
  revertirEntrega,
  revisarSolicitud,
} from "@/lib/adminleads/material-pop/requests";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Detalle de una solicitud, con la orden de Odoo leída en vivo. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const cids = resolveMaterialPopCids(auth.payload);
    const [solicitud] = await listarSolicitudes({ cids, id: Number(id) });
    if (!solicitud) {
      return NextResponse.json({ error: "Solicitud no encontrada" }, { status: 404 });
    }

    // La orden no se guarda, se lee cada vez: si en Odoo cambió o se anuló, el
    // adminLeads tiene que verlo como está hoy, no como estaba al solicitar.
    const orden = solicitud.odooOrderName
      ? await leerOrden(solicitud.odooOrderName, cids === null ? [7, 9, 10] : [cids])
      : null;

    return NextResponse.json({ success: true, request: solicitud, order: orden });
  } catch (error: any) {
    console.error("Error leyendo solicitud POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Aprobar, rechazar o entregar. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const solicitudId = Number(id);
    if (!Number.isInteger(solicitudId) || solicitudId <= 0) {
      return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
    }

    const body = await request.json();
    const cids = resolveMaterialPopCids(auth.payload);
    const revisorId = Number(auth.payload?.uid) || null;
    const revisorNombre = String(auth.payload?.name || "AdminLeads");
    const notas = body?.notes ? String(body.notes) : null;

    if (body?.action === "entregar") {
      const salida = await entregarSolicitud({
        id: solicitudId,
        cids,
        location: String(body?.location || "office"),
        revisorId,
        revisorNombre,
      });
      return NextResponse.json({ success: true, ...salida });
    }

    if (body?.action === "revertir") {
      await revertirEntrega({
        id: solicitudId,
        cids,
        revisorId,
        revisorNombre,
        motivo: notas,
      });
      return NextResponse.json({ success: true });
    }

    if (body?.action === "cancelar") {
      // El adminLeads cancela cualquiera de la sede; el vendedor solo las
      // propias, desde su propia ruta.
      await cancelarSolicitud({ id: solicitudId, cids, sellerUserId: null });
      return NextResponse.json({ success: true });
    }

    if (body?.action === "aprobar" || body?.action === "rechazar") {
      await revisarSolicitud({
        id: solicitudId,
        cids,
        accion: body.action,
        aprobadas: body?.approved || undefined,
        notas,
        revisorId,
        revisorNombre,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Acción no soportada" }, { status: 400 });
  } catch (error: any) {
    if (error instanceof ErrorSolicitud) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error revisando solicitud POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
