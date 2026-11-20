import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { sedeRma } from "@/lib/rma/sedeSesion";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;
    const sede = sedeRma(auth.payload, searchParams.get("company_id"));
    if (sede.error) return sede.error;
    const companyId = sede.companyId;
    const where = companyId ? "WHERE e.company_id = ?" : "";
    const params = companyId ? [companyId] : [];

    const countResult = await query(`SELECT COUNT(*) as total FROM rma_exit e ${where}`, params);
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT e.*, c.case_number FROM rma_exit e
       LEFT JOIN rma_cases c ON c.id = e.case_id
       ${where}
       ORDER BY e.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return NextResponse.json({
      success: true,
      exits: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error fetching RMA exits:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { case_id, product_description, quantity, reason, exit_date, authorized_by, notes, company_id } = body;
    // RMA registra en su sede; el SuperAdmin, en la que mande (Valencia si ninguna).
    const sede = sedeRma(auth.payload, company_id == null ? null : String(company_id));
    if (sede.error) return sede.error;

    if (!product_description || !reason || !exit_date || !authorized_by) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO rma_exit (case_id, product_description, quantity, reason, exit_date, authorized_by, notes, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [case_id || null, product_description, quantity || 1, reason, exit_date, authorized_by, notes || null, sede.companyId || 9]
    );

    return NextResponse.json({ success: true, id: result.rows.insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating RMA exit:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
