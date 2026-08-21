import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const caseId = searchParams.get("case_id");

    if (!caseId) {
      return NextResponse.json({ error: "case_id required" }, { status: 400 });
    }

    const result = await query(
      `SELECT nc.*, c.case_number, c.hardware, c.brand, c.model, c.invoice_number,
              c.client_name, c.serial_quantity, c.reported_fault, c.diagnosis, c.status
       FROM rma_notas_credito nc
       JOIN rma_cases c ON c.id = nc.case_id
       WHERE nc.case_id = ?`,
      [parseInt(caseId, 10)]
    );

    return NextResponse.json({ success: true, nota: result.rows[0] || null });
  } catch (error: any) {
    console.error("GET /api/rma/nota-credito error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { case_id, detail, observations, images, created_by } = body;

    if (!case_id) {
      return NextResponse.json({ error: "case_id required" }, { status: 400 });
    }

    const imagesJson = images ? JSON.stringify(images) : null;

    const result = await query(
      `INSERT INTO rma_notas_credito (case_id, detail, observations, images, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [case_id, detail || null, observations || null, imagesJson, created_by || "Usuario Actual"]
    );

    return NextResponse.json({ success: true, id: result.rows.insertId });
  } catch (error: any) {
    console.error("POST /api/rma/nota-credito error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
