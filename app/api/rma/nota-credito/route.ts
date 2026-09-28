import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { getPublicOrigin } from "@/lib/publicOrigin";
import { NextRequest, NextResponse } from "next/server";
import {
  contarPendientes,
  ErrorNota,
  hayColumnaItemNota,
  listarNotas,
  solicitarNotaCredito,
  type EstadoNota,
} from "@/lib/rma/notaCredito";

const ESTADOS: EstadoNota[] = ["pendiente", "aprobada", "rechazada"];

/**
 * GET
 *  ?conteo=1                 solicitudes esperando al Super Admin (sidebar).
 *  ?lista=1[&estado=...]     solicitudes con su caso y producto.
 *  ?case_id=[&item_id=]      la última nota de ese caso / producto.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);

    if (searchParams.get("conteo") === "1") {
      return NextResponse.json({ success: true, pendientes: await contarPendientes() });
    }

    if (searchParams.get("lista") === "1") {
      const estado = searchParams.get("estado") as EstadoNota | null;
      const notas = await listarNotas(estado && ESTADOS.includes(estado) ? estado : null);
      return NextResponse.json({ success: true, notas });
    }

    const caseId = searchParams.get("case_id");
    const itemId = parseInt(searchParams.get("item_id") || "", 10) || null;
    if (!caseId) {
      return NextResponse.json({ error: "case_id required" }, { status: 400 });
    }

    // Con producto: la nota de ese producto. Sin él, la última del caso
    // (envíos de un producto: las nuevas llevan su item_id, las viejas no).
    const porItem = await hayColumnaItemNota();
    if (itemId && !porItem) {
      return NextResponse.json({ success: true, nota: null });
    }
    const result = await query(
      `SELECT nc.*, c.case_number, c.hardware, c.brand, c.model, c.invoice_number,
              c.client_name, c.serial_quantity, c.reported_fault, c.diagnosis, c.status
       FROM rma_notas_credito nc
       JOIN rma_cases c ON c.id = nc.case_id
       WHERE nc.case_id = ?${porItem ? (itemId ? " AND nc.item_id = ?" : "") : ""}
       ORDER BY nc.id DESC`,
      porItem && itemId ? [parseInt(caseId, 10), itemId] : [parseInt(caseId, 10)]
    );

    return NextResponse.json({ success: true, nota: result.rows[0] || null });
  } catch (error: any) {
    console.error("GET /api/rma/nota-credito error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST: RMA solicita una nota de crédito (caso, producto y motivo). Queda
 * pendiente hasta que el Super Admin la decida (PUT /api/rma/nota-credito/[id]).
 */
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const caseId = parseInt(String(body.case_id ?? ""), 10);
    if (!caseId) {
      return NextResponse.json({ error: "case_id required" }, { status: 400 });
    }

    const images = Array.isArray(body.images)
      ? body.images
          .filter((i: any) => i && typeof i.url === "string" && i.url.startsWith("data:image/"))
          .slice(0, 10)
          .map((i: any) => ({ name: String(i.name || "imagen").slice(0, 200), url: i.url }))
      : [];

    const { id } = await solicitarNotaCredito({
      caseId,
      itemId: parseInt(String(body.item_id ?? ""), 10) || null,
      motivo: String(body.motivo ?? ""),
      observations: body.observations ? String(body.observations) : null,
      images: images.length ? images : null,
      opciones: {
        autor: auth.payload?.name || auth.payload?.email || "RMA",
        origenPeticion: getPublicOrigin(request),
      },
    });

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    if (error instanceof ErrorNota) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("POST /api/rma/nota-credito error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
