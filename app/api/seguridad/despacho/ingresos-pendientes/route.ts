import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

async function requireSeguridad(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  let payload: any;
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = result.payload;
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  const userRole = ((payload.role as string) || "").toLowerCase().trim();
  if (userRole !== "seguridad" && userRole !== "superadmin") {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return { payload };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));

    let where = "WHERE d.id IS NULL";
    const params: any[] = [];

    if (search) {
      where += " AND (i.cliente_nombre LIKE ? OR i.serial LIKE ? OR i.factura_numero LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const result = await query(
      `SELECT i.*
       FROM seguridad_ingresos i
       LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
       ${where}
       ORDER BY i.fecha_entrega DESC
       LIMIT ${limit}`,
      params,
    );

    return NextResponse.json({
      success: true,
      ingresos: result.rows,
    });
  } catch (error: any) {
    console.error("Error listando ingresos pendientes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
