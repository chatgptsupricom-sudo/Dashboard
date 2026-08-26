import { query } from "@/lib/db";
import { filtroIngresos } from "@/lib/seguridad/filtros";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);


const MAX = {
  factura_numero: 100,
  cliente_nombre: 200,
  hardware: 200,
  serial: 200,
  descripcion_falla: 5000,
  recibido_por: 200,
  foto_estado_url: 500,
  idempotency_key: 64,
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

    const { where, params } = filtroIngresos(searchParams);

    const countResult = await query(
      `SELECT COUNT(*) as total FROM seguridad_ingresos ${where}`,
      params,
    );
    const total = countResult.rows[0]?.total || 0;

    const rowsResult = await query(
      // despacho_id: el listado tiene una columna "Despachado" y el filtro de
      // pendientes, y este SELECT no traia el dato, asi que la pantalla pintaba
      // "No" en todas las filas —incluido el equipo ya entregado al cliente.
      `SELECT *,
        (SELECT AVG(c.calificacion)
         FROM seguridad_calificaciones c
         WHERE c.relacionado_a = 'ingreso'
           AND c.relacionado_id = seguridad_ingresos.id
           AND c.almacenista_nombre = seguridad_ingresos.recibido_por
        ) AS promedio_calificacion,
        (SELECT d.id
         FROM seguridad_despachos d
         WHERE d.ingreso_id = seguridad_ingresos.id
         ORDER BY d.id DESC LIMIT 1
        ) AS despacho_id
       FROM seguridad_ingresos ${where}
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

    // Los 4 checks de la planilla son OBLIGATORIOS y hay que declararlos
    // explícitamente, uno por uno.
    //
    // Antes se guardaban con `body.x === false ? 0 : 1`, así que un campo
    // ausente quedaba registrado como "sí". Eso es grave justo en el sentido
    // contrario al que protege: si el Seguridad no marca "accesorios
    // íntegros", el sistema declaraba por su cuenta que el equipo llegó
    // completo. Cuando un cliente reclame que faltaba algo, ese registro es la
    // prueba de la empresa — y decía que sí sin que nadie lo hubiera revisado.
    const CHECKS = [
      "accesorios_integros",
      "sin_manipulacion",
      "dentro_de_fecha",
      "falla_cubierta_garantia",
    ] as const;

    for (const campo of CHECKS) {
      if (typeof body[campo] !== "boolean") {
        errors.push(`${campo} es obligatorio (true o false)`);
      }
    }

    // Clave de idempotencia de la cola offline del mostrador (#39). Opcional:
    // los envios con conexion no la mandan.
    const idempotencyKey = truncate(body.idempotency_key, MAX.idempotency_key);
    if (idempotencyKey !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      errors.push("idempotency_key invalido");
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Si esta clave ya se registro, devolver aquel ingreso en vez de crear otro.
    //
    // Esto es lo que hace segura la cola offline: cuando el telefono manda el
    // ingreso y la respuesta se pierde de vuelta, la cola no puede distinguir
    // "no llego" de "llego y no me entere", asi que reintenta. Sin esto,
    // quedarian dos actas de recepcion del mismo equipo y nadie sabria cual es
    // la buena.
    //
    // Se responde 200 y no 201 para que el cliente sepa que no creo nada nuevo.
    if (idempotencyKey !== null) {
      try {
        const yaExiste = await query(
          "SELECT id FROM seguridad_ingresos WHERE idempotency_key = ? LIMIT 1",
          [idempotencyKey],
        );
        if (yaExiste.rows.length > 0) {
          return NextResponse.json(
            { success: true, id: yaExiste.rows[0].id, duplicado: true },
            { status: 200 },
          );
        }
      } catch (e: any) {
        // Si la columna todavia no existe en esta base, se sigue adelante: es
        // preferible registrar el ingreso que rechazarlo por no poder
        // comprobar la clave.
        console.warn("idempotency_key no disponible:", e?.message);
      }
    }

    const result = await query(
      `INSERT INTO seguridad_ingresos
        (rma_case_id, fecha_entrega, factura_numero, cliente_nombre, hardware, serial,
         descripcion_falla, accesorios_integros, sin_manipulacion, dentro_de_fecha,
         falla_cubierta_garantia, recibido_por, foto_estado_url, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rmaCaseId,
        fechaEntrega,
        truncate(body.factura_numero, MAX.factura_numero),
        clienteNombre,
        truncate(body.hardware, MAX.hardware),
        truncate(body.serial, MAX.serial),
        descripcionFalla,
        body.accesorios_integros ? 1 : 0,
        body.sin_manipulacion ? 1 : 0,
        body.dentro_de_fecha ? 1 : 0,
        body.falla_cubierta_garantia ? 1 : 0,
        recibidoPor,
        truncate(body.foto_estado_url, MAX.foto_estado_url),
        idempotencyKey,
      ],
    );

    const insertId = (result.rows as any)?.insertId;
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
