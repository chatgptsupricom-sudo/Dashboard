import { query } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { listarSolicitudes } from "@/lib/adminleads/material-pop/requests";
import { notaEntregaHtml, type ItemNota } from "@/lib/adminleads/material-pop/notaEntrega";
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
    // defecto es la oficina (C7), como en la pantalla.
    let origen = (new URL(request.url).searchParams.get("origen") || "").trim();
    if (origen !== "office" && origen !== "warehouse") origen = "office";

    // Solo lo aprobado: lo pedido de más no sale del almacén.
    let items: ItemNota[] = solicitud.items
      .filter((it) => (it.approvedQuantity ?? 0) > 0)
      .map((it) => ({
        code: it.code,
        name: it.name,
        brand: it.brand,
        quantity: it.approvedQuantity ?? 0,
      }));
    // Ya entregada: lo que salió y de dónde, por producto y ubicación. Un
    // producto puede haber salido partido entre Oficina y Almacén.
    if (solicitud.status === "entregada" && solicitud.movementGroupId) {
      const salidas = await query(
        `SELECT m.location, SUM(m.quantity) AS quantity, p.code, p.name, p.brand
         FROM pop_movements m
         JOIN pop_products p ON p.id = m.product_id
         WHERE m.movement_group_id = ? AND m.type = 'exit'
         GROUP BY p.id, p.code, p.name, p.brand, m.location
         ORDER BY p.name ASC, m.location ASC`,
        [solicitud.movementGroupId],
      );
      if (salidas.rows?.length) {
        items = salidas.rows.map((f: any) => ({
          code: f.code,
          name: f.name,
          brand: f.brand,
          quantity: Number(f.quantity) || 0,
          location: f.location,
        }));
      }
    }

    // Uso interno sale como una salida de uso interno: destino = para qué es,
    // y lo recibe quien lo pidió.
    const interno = solicitud.usoInterno;
    const html = notaEntregaHtml({
      codigo: solicitud.code,
      tipoSalida: interno ? "uso_interno" : "cliente",
      destino: interno ? solicitud.notes : null,
      entregadoA: interno ? solicitud.sellerName : null,
      cliente: solicitud.clientName,
      vendedor: solicitud.sellerName,
      autorizadoPor: solicitud.reviewedByName || "",
      fecha: solicitud.reviewedAt,
      ordenOdoo: solicitud.odooOrderName,
      condicion: interno
        ? null
        : solicitud.deliveryCondition === "al_comprar"
          ? "Contra la compra del cliente"
          : "Entrega inmediata",
      observaciones: (interno
        ? [solicitud.reviewNotes]
        : [solicitud.notes, solicitud.reviewNotes]
      ).filter(Boolean).join(" · ") || null,
      items,
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
