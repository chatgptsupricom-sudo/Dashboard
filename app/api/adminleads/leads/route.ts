import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const userCids = auth.payload!.cids as number;

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
