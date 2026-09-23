import { query } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const VALID_TYPES = ["entry", "exit", "transfer", "adjustment"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const cids = resolveMaterialPopCids(auth.payload);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");

    if (type && !VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }

    const params: any[] = [];
    let where = "WHERE 1=1";
    if (cids !== null) {
      where += " AND cids = ?";
      params.push(cids);
    }
    if (type) {
      where += " AND type = ?";
      params.push(type);
    }

    const res = await query(
      `SELECT * FROM pop_movement_reasons ${where} ORDER BY name ASC`,
      params,
    );

    return NextResponse.json({ success: true, reasons: res.rows });
  } catch (error: any) {
    console.error("Error listando motivos POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const type = String(body?.type || "").trim();
    const name = String(body?.name || "").trim().slice(0, 100);

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }
    if (!name) {
      return NextResponse.json({ error: "El nombre del motivo es obligatorio" }, { status: 400 });
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const userId = auth.payload?.uid || auth.payload?.id || null;

    const res = await query(
      `INSERT INTO pop_movement_reasons (type, name, cids, created_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE name = name`,
      [type, name, cids, userId],
    );

    let reasonId = (res.rows as any)?.insertId;
    if (!reasonId) {
      const found = await query(
        "SELECT id FROM pop_movement_reasons WHERE type = ? AND name = ? AND cids = ? LIMIT 1",
        [type, name, cids],
      );
      reasonId = found.rows[0]?.id;
    }

    return NextResponse.json({
      success: true,
      reason: { id: reasonId, type, name, cids },
    });
  } catch (error: any) {
    console.error("Error creando motivo POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
