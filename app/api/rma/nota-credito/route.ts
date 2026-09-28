import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

let hayItemId = false;

/**
 * Si ya se corrió sql/rma_notas_credito_item.sql (nota de crédito por
 * producto, issue #331). Se cachea solo el "sí".
 */
async function hayColumnaItem(): Promise<boolean> {
  if (hayItemId) return true;
  try {
    const r = await query("SHOW COLUMNS FROM rma_notas_credito LIKE 'item_id'");
    hayItemId = (r.rows as any[]).length > 0;
  } catch {
    hayItemId = false;
  }
  return hayItemId;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get("case_id");
    const itemId = parseInt(searchParams.get("item_id") || "", 10) || null;

    if (!caseId) {
      return NextResponse.json({ error: "case_id required" }, { status: 400 });
    }

    // Con producto: la nota de ese producto. Sin él, la del caso completo
    // (las de antes de #331, y las de envíos de un producto).
    const porItem = await hayColumnaItem();
    if (itemId && !porItem) {
      return NextResponse.json({ success: true, nota: null });
    }
    const result = await query(
      `SELECT nc.*, c.case_number, c.hardware, c.brand, c.model, c.invoice_number,
              c.client_name, c.serial_quantity, c.reported_fault, c.diagnosis, c.status
       FROM rma_notas_credito nc
       JOIN rma_cases c ON c.id = nc.case_id
       WHERE nc.case_id = ?${porItem ? (itemId ? " AND nc.item_id = ?" : " AND nc.item_id IS NULL") : ""}
       ORDER BY nc.id DESC`,
      porItem && itemId ? [parseInt(caseId, 10), itemId] : [parseInt(caseId, 10)]
    );

    return NextResponse.json({ success: true, nota: result.rows[0] || null });
  } catch (error: any) {
    console.error("GET /api/rma/nota-credito error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { case_id, detail, observations, images, created_by } = body;
    const itemId = parseInt(String(body.item_id ?? ""), 10) || null;

    if (!case_id) {
      return NextResponse.json({ error: "case_id required" }, { status: 400 });
    }

    const imagesJson = images ? JSON.stringify(images) : null;
    const autor = auth.payload?.name || created_by || "Usuario Actual";

    if (itemId) {
      if (!(await hayColumnaItem())) {
        return NextResponse.json(
          { error: "Falta correr la migración sql/rma_notas_credito_item.sql" },
          { status: 409 },
        );
      }
      const item = await query(`SELECT id FROM rma_case_items WHERE id = ? AND case_id = ?`, [itemId, case_id]);
      if (!(item.rows as any[]).length) {
        return NextResponse.json({ error: "Producto no encontrado en este caso" }, { status: 404 });
      }
    }

    const result = itemId
      ? await query(
          `INSERT INTO rma_notas_credito (case_id, item_id, detail, observations, images, created_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [case_id, itemId, detail || null, observations || null, imagesJson, autor]
        )
      : await query(
          `INSERT INTO rma_notas_credito (case_id, detail, observations, images, created_by)
           VALUES (?, ?, ?, ?, ?)`,
          [case_id, detail || null, observations || null, imagesJson, autor]
        );

    return NextResponse.json({ success: true, id: result.rows.insertId });
  } catch (error: any) {
    console.error("POST /api/rma/nota-credito error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
