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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { id } = await params;
    const ingresoId = parseInt(id, 10);
    if (isNaN(ingresoId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const ingresoResult = await query(
      "SELECT * FROM seguridad_ingresos WHERE id = ?",
      [ingresoId],
    );

    if (ingresoResult.rows.length === 0) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    const ingreso = ingresoResult.rows[0];

    let rmaCase: any = null;
    if (ingreso.rma_case_id) {
      try {
        const rmaResult = await query(
          `SELECT id, case_number, status, invoice_number
           FROM rma_cases
           WHERE id = ?`,
          [ingreso.rma_case_id],
        );
        if (rmaResult.rows.length > 0) {
          rmaCase = rmaResult.rows[0];
        }
      } catch (e: any) {
        console.warn("rma_cases no disponible para join:", e?.message);
      }
    }

    return NextResponse.json({ success: true, ingreso, rma_case: rmaCase });
  } catch (error: any) {
    console.error("Error obteniendo ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
