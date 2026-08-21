import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

async function getUserCids(request: Request): Promise<number | null> {
  const cookieHeader = request.headers.get("cookie");
  const token = cookieHeader?.split(";").find((c) => c.trim().startsWith("token="))?.split("=")[1];
  if (!token) return null;
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return payload.cids as number;
}

export async function GET(request: Request) {
  try {
    const userCids = await getUserCids(request);
    if (userCids === null)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

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

export async function PATCH(request: Request) {
  try {
    const userCids = await getUserCids(request);
    if (userCids === null)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { id, activo } = await request.json();
    if (id === undefined || activo === undefined)
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });

    if (userCids === 7) {
      const check: any = await query(`SELECT cids FROM sellers WHERE id = ?`, [id]);
      const seller = (check.rows || check)?.[0];
      if (!seller || seller.cids !== 7)
        return NextResponse.json({ error: "No autorizado" }, { status: 403 });
    }

    await query(`UPDATE sellers SET activo = ? WHERE id = ?`, [activo ? 1 : 0, id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
