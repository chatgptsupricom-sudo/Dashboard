import { query } from "@/lib/db";
import { requireSession } from "@/lib/auth/roles";
import { alcanceDe, puedeVerPersona } from "@/lib/actividades/datos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const role = searchParams.get("role");

    // Antes devolvía las de todos (o filtraba por una columna `role` que no
    // existe) a cualquier sesión: ahora solo las de una persona que se puede ver.
    void role;
    const alcance = alcanceDe(auth.payload);
    const pedido = Number(userId) || alcance.yo;
    if (!(await puedeVerPersona(alcance, pedido))) {
      return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }
    let sql = `SELECT * FROM activities WHERE user_id = ?`;
    const params: any[] = [pedido];

    sql += " ORDER BY created_at DESC";
    const { rows } = await query(sql, params);
    return NextResponse.json(rows);
  } catch (error) {
    return NextResponse.json([], { status: 500 });
  }
}
