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

    let rows: any[] = [];
    try {
      const result = await query(
        `SELECT id, fecha_entrega, cliente_nombre, hardware, serial, factura_numero, rma_case_id
         FROM seguridad_ingresos
         WHERE id NOT IN (
           SELECT ingreso_id FROM seguridad_despachos WHERE ingreso_id IS NOT NULL
         )
         ORDER BY fecha_entrega DESC
         LIMIT 50`,
      );
      rows = result.rows;
    } catch (e: any) {
      console.warn("seguridad_despachos no disponible para pendientes:", e?.message);
      const result = await query(
        `SELECT id, fecha_entrega, cliente_nombre, hardware, serial, factura_numero, rma_case_id
         FROM seguridad_ingresos
         ORDER BY fecha_entrega DESC
         LIMIT 50`,
      );
      rows = result.rows;
    }

    return NextResponse.json({ success: true, ingresos: rows });
  } catch (error: any) {
    console.error("Error listando ingresos pendientes:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
