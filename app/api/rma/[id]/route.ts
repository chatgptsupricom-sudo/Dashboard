import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const caseResult = await query(
      `SELECT c.*, h.changed_by as last_changed_by, h.notes as last_change_notes, h.created_at as last_change_at
       FROM rma_cases c
       LEFT JOIN rma_history h ON h.case_id = c.id
       WHERE c.id = ? OR c.case_number = ?
       ORDER BY h.created_at DESC
       LIMIT 1`,
      [id, id]
    );

    if (caseResult.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const caseData = caseResult.rows[0];

    // Get full history
    const historyResult = await query(
      `SELECT * FROM rma_history WHERE case_id = ? ORDER BY created_at ASC`,
      [caseData.id]
    );

    return NextResponse.json({
      success: true,
      case: caseData,
      history: historyResult.rows,
    });
  } catch (error: any) {
    console.error("Error fetching RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      client_name,
      client_phone,
      product_name,
      product_serial,
      product_model,
      reported_fault,
      status,
      diagnosis,
      notes,
      company_id,
      changed_by,
      change_notes,
    } = body;

    // Check if case exists
    const existing = await query("SELECT id, status FROM rma_cases WHERE id = ?", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const oldStatus = existing.rows[0].status;

    // Build dynamic UPDATE
    const updates: string[] = [];
    const values: any[] = [];

    if (client_name !== undefined) { updates.push("client_name = ?"); values.push(client_name); }
    if (client_phone !== undefined) { updates.push("client_phone = ?"); values.push(client_phone); }
    if (product_name !== undefined) { updates.push("product_name = ?"); values.push(product_name); }
    if (product_serial !== undefined) { updates.push("product_serial = ?"); values.push(product_serial); }
    if (product_model !== undefined) { updates.push("product_model = ?"); values.push(product_model); }
    if (reported_fault !== undefined) { updates.push("reported_fault = ?"); values.push(reported_fault); }
    if (diagnosis !== undefined) { updates.push("diagnosis = ?"); values.push(diagnosis); }
    if (notes !== undefined) { updates.push("notes = ?"); values.push(notes); }
    if (company_id !== undefined) { updates.push("company_id = ?"); values.push(company_id); }

    // Status change → record in history
    if (status && status !== oldStatus) {
      updates.push("status = ?");
      values.push(status);

      await query(
        `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [id, oldStatus, status, changed_by || "Sistema", change_notes || null]
      );
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    values.push(id);
    await query(`UPDATE rma_cases SET ${updates.join(", ")} WHERE id = ?`, values);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await query("SELECT id FROM rma_cases WHERE id = ?", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    await query("DELETE FROM rma_cases WHERE id = ?", [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
