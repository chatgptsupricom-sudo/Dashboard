import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    const caseResult = await query(
      `SELECT * FROM rma_cases WHERE id = ? OR case_number = ?`,
      [id, id]
    );

    if (caseResult.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const caseData = caseResult.rows[0];

    const historyResult = await query(
      `SELECT * FROM rma_history WHERE case_id = ? ORDER BY created_at ASC`,
      [caseData.id]
    );

    let adjuntos: any[] = [];
    try {
      const adjuntosResult = await query(
        `SELECT id, filename, mime, size, created_at, tracking_token
         FROM rma_ticket_adjuntos
         WHERE ticket_id = ?
         ORDER BY created_at ASC`,
        [caseData.id]
      );
      adjuntos = adjuntosResult.rows.map((row: any) => ({
        id: row.id,
        filename: row.filename,
        mime: row.mime,
        size: row.size,
        created_at: row.created_at,
        url: row.tracking_token
          ? `/api/servicio-tecnico/ticket/adjuntos/${row.tracking_token}/${row.id}`
          : null,
      }));
    } catch (adjErr: any) {
      console.warn("rma_ticket_adjuntos no disponible:", adjErr?.message);
      adjuntos = [];
    }

    return NextResponse.json({
      success: true,
      case: caseData,
      history: historyResult.rows,
      adjuntos,
    });
  } catch (error: any) {
    console.error("Error fetching RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      product_code,
      hardware,
      brand,
      model,
      invoice_number,
      client_name,
      client_phone,
      serial_quantity,
      reported_fault,
      status,
      diagnosis,
      notes,
      company_id,
      changed_by,
      change_notes,
    } = body;

    const existing = await query("SELECT id, status FROM rma_cases WHERE id = ?", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const oldStatus = existing.rows[0].status;

    const updates: string[] = [];
    const values: any[] = [];

    if (product_code !== undefined) { updates.push("product_code = ?"); values.push(product_code); }
    if (hardware !== undefined) { updates.push("hardware = ?"); values.push(hardware); }
    if (brand !== undefined) { updates.push("brand = ?"); values.push(brand); }
    if (model !== undefined) { updates.push("model = ?"); values.push(model); }
    if (invoice_number !== undefined) { updates.push("invoice_number = ?"); values.push(invoice_number); }
    if (client_name !== undefined) { updates.push("client_name = ?"); values.push(client_name); }
    if (client_phone !== undefined) { updates.push("client_phone = ?"); values.push(client_phone); }
    if (serial_quantity !== undefined) { updates.push("serial_quantity = ?"); values.push(serial_quantity); }
    if (reported_fault !== undefined) { updates.push("reported_fault = ?"); values.push(reported_fault); }
    if (diagnosis !== undefined) { updates.push("diagnosis = ?"); values.push(diagnosis); }
    if (notes !== undefined) { updates.push("notes = ?"); values.push(notes); }
    if (company_id !== undefined) { updates.push("company_id = ?"); values.push(company_id); }

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

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
