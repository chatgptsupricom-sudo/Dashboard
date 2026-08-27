import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


export async function GET(request: Request) {
  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];

  if (!token)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(token, jwtSecretBytes(), {
      algorithms: ["HS256"],
    });
    const userCids = payload.cids as number;

    const url = new URL(request.url);
    const queryCompanyId = url.searchParams.get("company_id");
    const companyId = queryCompanyId ? parseInt(queryCompanyId) : userCids;

    // Get distinct months from spiff_rules (using fecha_inicio and fecha_fin)
    const result = await query(
      `SELECT DISTINCT 
        YEAR(fecha_inicio) as year, 
        MONTH(fecha_inicio) as month 
      FROM spiff_rules 
      WHERE company_id = ? AND active = 1 AND fecha_inicio IS NOT NULL
      UNION
      SELECT DISTINCT 
        YEAR(fecha_fin) as year, 
        MONTH(fecha_fin) as month 
      FROM spiff_rules 
      WHERE company_id = ? AND active = 1 AND fecha_fin IS NOT NULL
      ORDER BY year DESC, month DESC`,
      [companyId, companyId]
    );

    const months = (result.rows as any[])
      .map((r) => ({ year: r.year, month: r.month }))
      .filter((m) => m.year && m.month);

    // Deduplicate
    const seen = new Set<string>();
    const unique = months.filter((m) => {
      const key = `${m.year}-${m.month}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return NextResponse.json({ months: unique });
  } catch (e: any) {
    console.error("Error spiff months:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
