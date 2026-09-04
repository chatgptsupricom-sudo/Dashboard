import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const role = searchParams.get("role");

    let sql = `SELECT * FROM activities`;
    const params = [];

    if (userId) {
      sql += " WHERE user_id = ?";
      params.push(userId);
    } else if (role) {
      sql += " WHERE role = ?"; // Asegúrate de tener la columna 'role' en tu tabla
      params.push(role);
    }

    sql += " ORDER BY created_at DESC";
    const { rows } = await query(sql, params);
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json([], { status: 500 });
  }
}
