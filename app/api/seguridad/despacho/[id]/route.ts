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
    const despachoId = parseInt(id, 10);
    if (isNaN(despachoId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    const despachoResult = await query(
      "SELECT * FROM seguridad_despachos WHERE id = ?",
      [despachoId],
    );

    if (despachoResult.rows.length === 0) {
      return NextResponse.json({ error: "Despacho no encontrado" }, { status: 404 });
    }

    const row = despachoResult.rows[0];

    let facturas: string[] = [];
    if (row.facturas_json) {
      try {
        const parsed = JSON.parse(row.facturas_json);
        if (Array.isArray(parsed)) facturas = parsed.map((f) => String(f));
      } catch {
        facturas = [];
      }
    }

    const despacho = { ...row, facturas };

    let ingreso: any = null;
    if (despacho.ingreso_id) {
      try {
        const ingresoResult = await query(
          `SELECT id, cliente_nombre, hardware, serial, rma_case_id, fecha_entrega, recibido_por
           FROM seguridad_ingresos
           WHERE id = ?`,
          [despacho.ingreso_id],
        );
        if (ingresoResult.rows.length > 0) {
          ingreso = ingresoResult.rows[0];
        }
      } catch (e: any) {
        console.warn("seguridad_ingresos no disponible para join:", e?.message);
      }
    }

    let rmaCase: any = null;
    if (despacho.rma_case_id) {
      try {
        const rmaResult = await query(
          `SELECT id, case_number, status, invoice_number
           FROM rma_cases
           WHERE id = ?`,
          [despacho.rma_case_id],
        );
        if (rmaResult.rows.length > 0) {
          rmaCase = rmaResult.rows[0];
        }
      } catch (e: any) {
        console.warn("rma_cases no disponible para join:", e?.message);
      }
    }

    return NextResponse.json({ success: true, despacho, ingreso, rma_case: rmaCase });
  } catch (error: any) {
    console.error("Error obteniendo despacho:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
