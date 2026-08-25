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

const MAX = {
  almacenista_nombre: 200,
  factura: 100,
  cliente_retira: 200,
  observaciones: 5000,
  firma_url: 500,
  max_facturas: 50,
};

function truncate(value: any, max: number): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const desde = (searchParams.get("desde") || "").trim();
    const hasta = (searchParams.get("hasta") || "").trim();
    const ingresoIdParam = (searchParams.get("ingreso_id") || "").trim();
    const rmaCaseIdParam = (searchParams.get("rma_case_id") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      where += " AND (cliente_retira LIKE ? OR almacenista_nombre LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s);
    }

    if (desde) {
      where += " AND fecha_despacho >= ?";
      params.push(desde);
    }

    if (hasta) {
      where += " AND fecha_despacho <= ?";
      params.push(hasta);
    }

    if (ingresoIdParam) {
      const parsed = parseInt(ingresoIdParam, 10);
      if (!isNaN(parsed)) {
        where += " AND ingreso_id = ?";
        params.push(parsed);
      }
    }

    if (rmaCaseIdParam) {
      const parsed = parseInt(rmaCaseIdParam, 10);
      if (!isNaN(parsed)) {
        where += " AND rma_case_id = ?";
        params.push(parsed);
      }
    }

    let total = 0;
    let rows: any[];
    try {
      const countResult = await query(
        `SELECT COUNT(*) as total
         FROM seguridad_despachos d
         LEFT JOIN seguridad_ingresos i ON i.id = d.ingreso_id
         ${where}`,
        params,
      );
      total = countResult.rows[0]?.total || 0;

      const rowsResult = await query(
        `SELECT d.*, i.cliente_nombre AS cliente_nombre
         FROM seguridad_despachos d
         LEFT JOIN seguridad_ingresos i ON i.id = d.ingreso_id
         ${where}
         ORDER BY d.fecha_despacho DESC, d.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      rows = rowsResult.rows;
    } catch (e: any) {
      console.warn("seguridad_ingresos no disponible para join:", e?.message);
      const countResult = await query(
        `SELECT COUNT(*) as total FROM seguridad_despachos ${where}`,
        params,
      );
      total = countResult.rows[0]?.total || 0;

      const rowsResult = await query(
        `SELECT * FROM seguridad_despachos ${where}
         ORDER BY fecha_despacho DESC, created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      rows = rowsResult.rows;
    }

    const despachos = rows.map((row: any) => {
      let facturas: string[] = [];
      if (row.facturas_json) {
        try {
          const parsed = JSON.parse(row.facturas_json);
          if (Array.isArray(parsed)) facturas = parsed.map((f) => String(f));
        } catch {
          facturas = [];
        }
      }
      return { ...row, facturas, cliente_nombre: row.cliente_nombre ?? null };
    });

    return NextResponse.json({
      success: true,
      despachos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error listando despachos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const errors: string[] = [];

    const fechaDespacho = typeof body.fecha_despacho === "string" ? body.fecha_despacho.trim() : "";
    if (!fechaDespacho) errors.push("fecha_despacho es obligatorio");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDespacho))
      errors.push("fecha_despacho debe tener formato YYYY-MM-DD");

    const payloadName = (auth.payload?.name as string) || (auth.payload?.username as string) || "";
    const almacenistaNombre = truncate(body.almacenista_nombre, MAX.almacenista_nombre)
      || truncate(payloadName, MAX.almacenista_nombre);
    if (!almacenistaNombre) errors.push("almacenista_nombre es obligatorio");

    let ingresoId: number | null = null;
    if (body.ingreso_id !== undefined && body.ingreso_id !== null && body.ingreso_id !== "") {
      const parsed = parseInt(String(body.ingreso_id), 10);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push("ingreso_id invalido");
      } else {
        ingresoId = parsed;
      }
    }

    if (ingresoId !== null) {
      try {
        const exists = await query("SELECT id FROM seguridad_ingresos WHERE id = ?", [ingresoId]);
        if (exists.rows.length === 0) {
          errors.push("ingreso_id no existe");
        }
      } catch (e: any) {
        console.warn("seguridad_ingresos no disponible:", e?.message);
      }
    }

    let rmaCaseId: number | null = null;
    if (body.rma_case_id !== undefined && body.rma_case_id !== null && body.rma_case_id !== "") {
      const parsed = parseInt(String(body.rma_case_id), 10);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push("rma_case_id invalido");
      } else {
        rmaCaseId = parsed;
      }
    }

    if (rmaCaseId !== null) {
      try {
        const exists = await query("SELECT id FROM rma_cases WHERE id = ?", [rmaCaseId]);
        if (exists.rows.length === 0) {
          errors.push("rma_case_id no existe");
        }
      } catch (e: any) {
        console.warn("rma_cases no disponible:", e?.message);
      }
    }

    let facturasJson: string | null = null;
    if (body.facturas !== undefined && body.facturas !== null) {
      if (!Array.isArray(body.facturas)) {
        errors.push("facturas debe ser un array");
      } else if (body.facturas.length > MAX.max_facturas) {
        errors.push(`facturas maximo ${MAX.max_facturas} items`);
      } else {
        const cleaned = body.facturas
          .map((f: any) => truncate(f, MAX.factura))
          .filter((f: string | null): f is string => f !== null && f.trim().length > 0);
        if (cleaned.length > 0) facturasJson = JSON.stringify(cleaned);
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO seguridad_despachos
        (ingreso_id, rma_case_id, fecha_despacho, almacenista_nombre, facturas_json,
         cliente_retira, accesorios_integros, observaciones, firma_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ingresoId,
        rmaCaseId,
        fechaDespacho,
        almacenistaNombre,
        facturasJson,
        truncate(body.cliente_retira, MAX.cliente_retira),
        body.accesorios_integros === false ? 0 : 1,
        truncate(body.observaciones, MAX.observaciones),
        truncate(body.firma_url, MAX.firma_url),
      ],
    );

    const insertId = (result.rows as any)?.insertId;
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando despacho:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
