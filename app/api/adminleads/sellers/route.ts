import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { mismaOperacion } from "@/lib/adminleads/sucursal";

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

    // Mismo alcance que la reasignacion: Panama aparte, Valencia y Caracas
    // como una sola operacion. El listado de arriba ya devuelve las dos
    // sedes juntas, asi que pedir igualdad exacta de cids dejaba a Caracas
    // sin poder activar a los vendedores que su propia pantalla le muestra.
    if (userRole !== "superadmin" && userCids) {
      const check: any = await query(`SELECT cids FROM sellers WHERE id = ?`, [id]);
      const seller = (check.rows || check)?.[0];
      if (!seller || !mismaOperacion(userCids, seller.cids))
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await query(`UPDATE sellers SET activo = ? WHERE id = ?`, [activo ? 1 : 0, id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
