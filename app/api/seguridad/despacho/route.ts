import { query } from "@/lib/db";
import { filtroDespachos } from "@/lib/seguridad/filtros";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";



const MAX = {
  almacenista_nombre: 200,
  factura: 100,
  cliente_retira: 200,
  observaciones: 5000,
  firma_url: 500,
  max_facturas: 50,
  nd_numero: 50,
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

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const desde = (searchParams.get("desde") || "").trim();
    const hasta = (searchParams.get("hasta") || "").trim();
    const ingresoIdParam = (searchParams.get("ingreso_id") || "").trim();
    const rmaCaseIdParam = (searchParams.get("rma_case_id") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    const { where, params } = filtroDespachos(searchParams, cids);

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
        `SELECT d.*, i.cliente_nombre AS cliente_nombre,
          (SELECT AVG(c.calificacion)
           FROM seguridad_calificaciones c
           WHERE c.relacionado_a = 'despacho'
             AND c.relacionado_id = d.id
             AND c.almacenista_nombre = d.almacenista_nombre
          ) AS promedio_calificacion
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
      // Alias `d` aunque sea una sola tabla: `where` (de filtroDespachos)
      // puede traer `d.cids = ?` calificado, porque en la consulta de arriba
      // (con el JOIN) un `cids` sin calificar es ambiguo contra
      // `seguridad_ingresos.cids`. Sin el alias aqui, este fallback rompe con
      // "Unknown table 'd'" en cuanto haya un filtro de sucursal.
      const countResult = await query(
        `SELECT COUNT(*) as total FROM seguridad_despachos d ${where}`,
        params,
      );
      total = countResult.rows[0]?.total || 0;

      const rowsResult = await query(
        `SELECT d.*,
          (SELECT AVG(c.calificacion)
           FROM seguridad_calificaciones c
           WHERE c.relacionado_a = 'despacho'
             AND c.relacionado_id = d.id
             AND c.almacenista_nombre = d.almacenista_nombre
          ) AS promedio_calificacion
         FROM seguridad_despachos d ${where}
         ORDER BY d.fecha_despacho DESC, d.created_at DESC
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

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

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

    let rmaCaseId: number | null = null;
    if (body.rma_case_id !== undefined && body.rma_case_id !== null && body.rma_case_id !== "") {
      const parsed = parseInt(String(body.rma_case_id), 10);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push("rma_case_id invalido");
      } else {
        rmaCaseId = parsed;
      }
    }

    if (ingresoId !== null) {
      try {
        const ingresoLookup = await query(
          "SELECT id, rma_case_id FROM seguridad_ingresos WHERE id = ?",
          [ingresoId],
        );
        if (ingresoLookup.rows.length === 0) {
          errors.push("ingreso_id no existe");
        } else if (rmaCaseId === null) {
          const linked = ingresoLookup.rows[0]?.rma_case_id;
          if (linked !== null && linked !== undefined) {
            rmaCaseId = parseInt(String(linked), 10) || null;
          }
        }
      } catch (e: any) {
        console.warn("seguridad_ingresos no disponible:", e?.message);
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
         cliente_retira, accesorios_integros, observaciones, firma_url, nd_numero, cids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        // Correlativo que el almacen lleva a mano en la planilla de papel.
        truncate(body.nd_numero, MAX.nd_numero),
        cids,
      ],
    );

    const insertId = (result.rows as any)?.insertId;

    // Marcar en el ticket del portal que el equipo ya se entrego (issue #32).
    //
    // Se escribe `despachado_at` y NO se toca `status`: el estado guarda el
    // desenlace del caso —reparado, nota de credito, no procesado— y la
    // entrega le ocurre a cualquiera de ellos. Pisarlo con "despachado"
    // borraria el motivo por el que el caso se cerro, que es justo lo que el
    // cliente consulta en el portal.
    //
    // `IS NULL` para que un segundo despacho del mismo caso (un reingreso que
    // se vuelve a entregar) no mueva la fecha de la primera entrega.
    //
    // Va en su propio try: si esto falla, el despacho ya quedo registrado y no
    // se puede perder por no haber podido anotar la fecha en el ticket.
    if (rmaCaseId !== null) {
      try {
        await query(
          `UPDATE rma_cases SET despachado_at = ?
           WHERE id = ? AND despachado_at IS NULL`,
          [fechaDespacho, rmaCaseId],
        );
      } catch (e: any) {
        console.warn(
          `[despacho ${insertId}] no se pudo marcar despachado_at en rma_cases ${rmaCaseId}:`,
          e?.message,
        );
      }
    }

    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando despacho:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
