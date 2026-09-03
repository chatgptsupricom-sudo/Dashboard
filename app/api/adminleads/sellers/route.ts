import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const userCids = auth.payload!.cids as number;

    const sql =
      userCids === 7
        ? `SELECT id, name, cids, activo, whatsapp FROM sellers WHERE cids = 7 ORDER BY name ASC`
        : `SELECT id, name, cids, activo, whatsapp FROM sellers WHERE cids != 7 ORDER BY cids ASC, name ASC`;

    const result: any = await query(sql);
    return NextResponse.json(result.rows || []);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const userCids = auth.payload!.cids as number;
    const userRole = ((auth.payload!.role as string) || "").toLowerCase().trim();

    const { id, activo } = await request.json();
    if (id === undefined || activo === undefined)
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

    // Simetrico para las 3 sucursales (antes solo Panama estaba protegida;
    // superadmin sigue sin restriccion de sucursal).
    if (userRole !== "superadmin" && userCids) {
      const check: any = await query(`SELECT cids FROM sellers WHERE id = ?`, [id]);
      const seller = (check.rows || check)?.[0];
      if (!seller || seller.cids !== userCids)
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await query(`UPDATE sellers SET activo = ? WHERE id = ?`, [activo ? 1 : 0, id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
