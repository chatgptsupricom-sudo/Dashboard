import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader?.split(";").find((c) => c.trim().startsWith("token="))?.split("=")[1];
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userCids = payload.cids as number;

    const whereClause = userCids === 7 ? "WHERE s.cids = 7" : "WHERE (s.cids != 7 OR s.cids IS NULL)";

    const sql = `
      SELECT
        l.*,
        s.name AS vendedor_nombre
      FROM leads l
      LEFT JOIN sellers s ON l.seller_id = s.id
      ${whereClause}
    `;

    const result = await query(sql);
    const leads = Array.isArray(result) ? result : (result as any).rows;

    return NextResponse.json(leads);
  } catch (error: any) {
    console.error("Error en API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
