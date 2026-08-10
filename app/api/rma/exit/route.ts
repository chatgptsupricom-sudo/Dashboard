import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    const countResult = await query(`SELECT COUNT(*) as total FROM rma_exit`, []);
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT e.*, c.case_number FROM rma_exit e
       LEFT JOIN rma_cases c ON c.id = e.case_id
       ORDER BY e.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { case_id, product_description, quantity, reason, exit_date, authorized_by, notes, company_id } = body;

    if (!product_description || !reason || !exit_date || !authorized_by) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO rma_exit (case_id, product_description, quantity, reason, exit_date, authorized_by, notes, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [case_id || null, product_description, quantity || 1, reason, exit_date, authorized_by, notes || null, company_id || 9]
    );

    return NextResponse.json({ success: true, id: result.rows.insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating RMA exit:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
