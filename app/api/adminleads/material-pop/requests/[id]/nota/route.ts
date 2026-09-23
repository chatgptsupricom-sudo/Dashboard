import { query } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { listarSolicitudes } from "@/lib/adminleads/material-pop/requests";
import { notaEntregaHtml } from "@/lib/adminleads/material-pop/notaEntrega";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Nota de entrega imprimible de una solicitud aprobada o entregada.
 *
 * Devuelve HTML, no JSON: se abre en una pestaña y el navegador imprime o
 * guarda como PDF.
 */
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
    if (solicitud.status !== "aprobada" && solicitud.status !== "entregada") {
      return NextResponse.json(
        { error: "La nota se emite cuando la solicitud está aprobada" },
        { status: 400 },
      );
    }

    // De dónde salió el material. Si ya se entregó, la ubicación real la dicen
    // los movimientos; si está aprobada, la elige quien emite la nota y por
    // defecto es el almacén.
    let origen = (new URL(request.url).searchParams.get("origen") || "").trim();
    if (solicitud.status === "entregada" && solicitud.movementGroupId) {
      const salidas = await query(
        `SELECT location FROM pop_movements
         WHERE movement_group_id = ? AND type = 'exit' LIMIT 1`,
        [solicitud.movementGroupId],
      );
      origen = salidas.rows?.[0]?.location || origen;
    }
    if (origen !== "office" && origen !== "warehouse") origen = "warehouse";

    const html = notaEntregaHtml({
      codigo: solicitud.code,
      cliente: solicitud.clientName,
      vendedor: solicitud.sellerName,
      autorizadoPor: solicitud.reviewedByName || "",
      fecha: solicitud.reviewedAt,
      ordenOdoo: solicitud.odooOrderName,
      condicion:
        solicitud.deliveryCondition === "al_comprar"
          ? "Contra la compra del cliente"
          : "Entrega inmediata",
      observaciones: [solicitud.notes, solicitud.reviewNotes].filter(Boolean).join(" · ") || null,
      // Solo lo aprobado: lo pedido de más no sale del almacén.
      items: solicitud.items
        .filter((it) => (it.approvedQuantity ?? 0) > 0)
        .map((it) => ({
          code: it.code,
          name: it.name,
          brand: it.brand,
          quantity: it.approvedQuantity ?? 0,
        })),
      origen,
    });

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Error generando la nota de entrega:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
