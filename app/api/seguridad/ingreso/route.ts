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
  factura_numero: 100,
  cliente_nombre: 200,
  hardware: 200,
  serial: 200,
  descripcion_falla: 5000,
  recibido_por: 200,
  foto_estado_url: 500,
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
    const rmaCaseIdParam = (searchParams.get("rma_case_id") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      where += " AND (cliente_nombre LIKE ? OR serial LIKE ? OR factura_numero LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (desde) {
      where += " AND fecha_entrega >= ?";
      params.push(desde);
    }

    if (hasta) {
      where += " AND fecha_entrega <= ?";
      params.push(hasta);
    }

    if (rmaCaseIdParam) {
      const rmaId = parseInt(rmaCaseIdParam, 10);
      if (!isNaN(rmaId)) {
        where += " AND rma_case_id = ?";
        params.push(rmaId);
      }
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM seguridad_ingresos ${where}`,
      params,
    );
    const total = countResult.rows[0]?.total || 0;

    const rowsResult = await query(
      `SELECT * FROM seguridad_ingresos ${where}
       ORDER BY fecha_entrega DESC, created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return NextResponse.json({
      success: true,
      ingresos: rowsResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error listando ingresos:", error);
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

    const fechaEntrega = typeof body.fecha_entrega === "string" ? body.fecha_entrega.trim() : "";
    if (!fechaEntrega) errors.push("fecha_entrega es obligatorio");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega))
      errors.push("fecha_entrega debe tener formato YYYY-MM-DD");

    const clienteNombre = truncate(body.cliente_nombre, MAX.cliente_nombre);
    if (!clienteNombre) errors.push("cliente_nombre es obligatorio");

    const recibidoPor = truncate(body.recibido_por, MAX.recibido_por);
    if (!recibidoPor) errors.push("recibido_por es obligatorio");

    const descripcionFalla = truncate(body.descripcion_falla, MAX.descripcion_falla);
    if (descripcionFalla !== null && descripcionFalla.trim().length > 0 && descripcionFalla.trim().length < 10) {
      errors.push("descripcion_falla debe tener al menos 10 caracteres");
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

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO seguridad_ingresos
        (rma_case_id, fecha_entrega, factura_numero, cliente_nombre, hardware, serial,
         descripcion_falla, accesorios_integros, sin_manipulacion, dentro_de_fecha,
         falla_cubierta_garantia, recibido_por, foto_estado_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rmaCaseId,
        fechaEntrega,
        truncate(body.factura_numero, MAX.factura_numero),
        clienteNombre,
        truncate(body.hardware, MAX.hardware),
        truncate(body.serial, MAX.serial),
        descripcionFalla,
        body.accesorios_integros === false ? 0 : 1,
        body.sin_manipulacion === false ? 0 : 1,
        body.dentro_de_fecha === false ? 0 : 1,
        body.falla_cubierta_garantia === true ? 1 : 0,
        recibidoPor,
        truncate(body.foto_estado_url, MAX.foto_estado_url),
      ],
    );

    const insertId = (result.rows as any)?.insertId;
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
