import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS weekly_visits (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    seller_name VARCHAR(255) NOT NULL,
    client_name VARCHAR(255) NOT NULL,
    is_prospect TINYINT(1) DEFAULT 0,
    visit_date DATE NOT NULL,
    photo_url VARCHAR(500) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const uid = payload.uid as number;

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    // Get seller name
    const sellerResult = await query(
      `SELECT name FROM sellers WHERE cids = ? AND user_id = ? LIMIT 1`,
      [companyId, uid]
    );
    const sellerName = (sellerResult.rows as any[])[0]?.name || "";

    await ensureTable();

    const result = await query(
      `SELECT * FROM weekly_visits WHERE company_id = ? AND seller_name = ? AND visit_date >= ? AND visit_date <= ? ORDER BY visit_date DESC`,
      [companyId, sellerName, fechaInicio, fechaFin]
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error("Error en API weekly-visits vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
