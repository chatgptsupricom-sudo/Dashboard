import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status") || "";
    const companyId = searchParams.get("company_id") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      where += " AND (c.case_number LIKE ? OR c.client_name LIKE ? OR c.product_name LIKE ? OR c.product_serial LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (status) {
      where += " AND c.status = ?";
      params.push(status);
    }

    if (companyId) {
      where += " AND c.company_id = ?";
      params.push(parseInt(companyId, 10));
    }

    const countResult = await query(`SELECT COUNT(*) as total FROM rma_cases c ${where}`, params);
    const total = countResult.rows[0]?.total || 0;

    const casesResult = await query(
      `SELECT c.id, c.case_number, c.client_name, c.client_email, c.client_phone,
              c.product_name, c.product_serial, c.product_model, c.reported_fault,
              c.status, c.technician_name, c.diagnosis, c.notes, c.company_id,
              c.created_by, c.created_at, c.updated_at
       FROM rma_cases c
       ${where}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return NextResponse.json({
      success: true,
      cases: casesResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error fetching RMA cases:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      client_name,
      client_phone,
      product_name,
      product_serial,
      product_model,
      reported_fault,
      company_id,
      created_by,
      notes,
    } = body;

    if (!client_name || !product_name || !reported_fault || !created_by) {
      return NextResponse.json(
        { error: "Faltan campos obligatorios: client_name, product_name, reported_fault, created_by" },
        { status: 400 }
      );
    }

    // Generate case number: RMA-YYYY-XXXX
    const year = new Date().getFullYear();
    const lastCase = await query(
      `SELECT case_number FROM rma_cases WHERE case_number LIKE ? ORDER BY id DESC LIMIT 1`,
      [`RMA-${year}-%`]
    );

    let nextNum = 1;
    if (lastCase.rows.length > 0) {
      const lastNum = parseInt(lastCase.rows[0].case_number.split("-")[2], 10);
      nextNum = lastNum + 1;
    }
    const case_number = `RMA-${year}-${String(nextNum).padStart(4, "0")}`;

    const result = await query(
      `INSERT INTO rma_cases (case_number, client_name, client_phone, product_name, product_serial, product_model, reported_fault, status, notes, company_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'recibido', ?, ?, ?)`,
      [
        case_number,
        client_name,
        client_phone || null,
        product_name,
        product_serial || null,
        product_model || null,
        reported_fault,
        notes || null,
        company_id || 9,
        created_by,
      ]
    );

    const caseId = result.rows.insertId;

    // Insert initial history entry
    await query(
      `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
       VALUES (?, NULL, 'recibido', ?, 'Caso creado')`,
      [caseId, created_by]
    );

    return NextResponse.json({ success: true, id: caseId, case_number }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
