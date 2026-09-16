import { query } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NAME = 100;

function truncar(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const cids = resolveMaterialPopCids(auth.payload);
    const params: any[] = [];
    let where = "WHERE 1=1";

    if (cids !== null) {
      where += " AND cids = ?";
      params.push(cids);
    }

    const res = await query(
      `SELECT * FROM pop_categories ${where} ORDER BY name ASC`,
      params,
    );

    return NextResponse.json({ success: true, categories: res.rows });
  } catch (error: any) {
    console.error("Error listando categorías POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const name = truncar(body?.name, MAX_NAME);

    if (!name) {
      return NextResponse.json(
        { error: "El nombre de la categoría es obligatorio" },
        { status: 400 },
      );
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const userId = auth.payload?.uid || auth.payload?.id || null;

    const res = await query(
      `INSERT INTO pop_categories (name, cids, created_by_user_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE name = name`,
      [name, cids, userId],
    );

    const insertedId = (res.rows as any)?.insertId;

    // Si ya existía, recuperar el id
    let categoryId = insertedId;
    if (!categoryId) {
      const existing = await query(
        "SELECT id FROM pop_categories WHERE name = ? AND cids = ? LIMIT 1",
        [name, cids],
      );
      categoryId = existing.rows[0]?.id;
    }

    return NextResponse.json({
      success: true,
      category: { id: categoryId, name, cids },
    });
  } catch (error: any) {
    console.error("Error creando categoría POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
