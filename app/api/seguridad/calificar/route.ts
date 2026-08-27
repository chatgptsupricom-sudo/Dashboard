import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";



const MAX = {
  almacenista_nombre: 200,
  comentario: 500,
  calificado_por: 200,
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
    const almacenista = (searchParams.get("almacenista") || "").trim();
    const relacionadoA = (searchParams.get("relacionado_a") || "").trim();
    const relacionadoIdParam = (searchParams.get("relacionado_id") || "").trim();
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (almacenista) {
      where += " AND almacenista_nombre = ?";
      params.push(almacenista);
    }

    if (relacionadoA === "ingreso" || relacionadoA === "despacho") {
      where += " AND relacionado_a = ?";
      params.push(relacionadoA);
    }

    if (relacionadoIdParam) {
      const parsed = parseInt(relacionadoIdParam, 10);
      if (!isNaN(parsed)) {
        where += " AND relacionado_id = ?";
        params.push(parsed);
      }
    }

    const result = await query(
      `SELECT * FROM seguridad_calificaciones ${where}
       ORDER BY created_at DESC
       LIMIT ${limit}`,
      params,
    );

    return NextResponse.json({
      success: true,
      calificaciones: result.rows,
      total: result.rows.length,
    });
  } catch (error: any) {
    console.error("Error listando calificaciones:", error);
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

    const almacenistaNombre = truncate(body.almacenista_nombre, MAX.almacenista_nombre);
    if (!almacenistaNombre) errors.push("almacenista_nombre es obligatorio");

    const comentario = truncate(body.comentario, MAX.comentario);

    const calificadoPor = truncate(body.calificado_por, MAX.calificado_por);
    if (!calificadoPor) errors.push("calificado_por es obligatorio");

    const relacionadoARaw = typeof body.relacionado_a === "string" ? body.relacionado_a.trim() : "";
    if (relacionadoARaw !== "ingreso" && relacionadoARaw !== "despacho") {
      errors.push("relacionado_a debe ser 'ingreso' o 'despacho'");
    }

    const relacionadoIdRaw = body.relacionado_id;
    let relacionadoId: number | null = null;
    if (
      relacionadoIdRaw === undefined ||
      relacionadoIdRaw === null ||
      relacionadoIdRaw === ""
    ) {
      errors.push("relacionado_id es obligatorio");
    } else {
      const parsed = parseInt(String(relacionadoIdRaw), 10);
      if (isNaN(parsed) || parsed <= 0) {
        errors.push("relacionado_id invalido");
      } else {
        relacionadoId = parsed;
      }
    }

    const calificacionRaw = body.calificacion;
    let calificacion: number | null = null;
    if (calificacionRaw === undefined || calificacionRaw === null || calificacionRaw === "") {
      errors.push("calificacion es obligatorio");
    } else {
      const parsed = parseInt(String(calificacionRaw), 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 5) {
        errors.push("calificacion debe estar entre 1 y 5");
      } else {
        calificacion = parsed;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    if (relacionadoARaw === "ingreso") {
      try {
        const lookup = await query(
          "SELECT id FROM seguridad_ingresos WHERE id = ?",
          [relacionadoId],
        );
        if (lookup.rows.length === 0) {
          return NextResponse.json(
            { error: "relacionado_id no existe en seguridad_ingresos" },
            { status: 400 },
          );
        }
      } catch (e: any) {
        console.warn("seguridad_ingresos no disponible:", e?.message);
        return NextResponse.json(
          { error: "No se pudo verificar el ingreso relacionado" },
          { status: 503 },
        );
      }
    } else if (relacionadoARaw === "despacho") {
      try {
        const lookup = await query(
          "SELECT id FROM seguridad_despachos WHERE id = ?",
          [relacionadoId],
        );
        if (lookup.rows.length === 0) {
          return NextResponse.json(
            { error: "relacionado_id no existe en seguridad_despachos" },
            { status: 400 },
          );
        }
      } catch (e: any) {
        console.warn("seguridad_despachos no disponible:", e?.message);
        return NextResponse.json(
          { error: "No se pudo verificar el despacho relacionado" },
          { status: 503 },
        );
      }
    }

    try {
      const dup = await query(
        `SELECT id FROM seguridad_calificaciones
         WHERE relacionado_a = ? AND relacionado_id = ? AND almacenista_nombre = ?
         LIMIT 1`,
        [relacionadoARaw, relacionadoId, almacenistaNombre],
      );
      if (dup.rows.length > 0) {
        return NextResponse.json(
          { error: "Ya existe una calificacion para este almacenista en este registro" },
          { status: 409 },
        );
      }
    } catch (e: any) {
      console.warn("No se pudo verificar duplicado de calificacion:", e?.message);
    }

    const result = await query(
      `INSERT INTO seguridad_calificaciones
        (almacenista_nombre, calificacion, relacionado_a, relacionado_id, comentario, calificado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        almacenistaNombre,
        calificacion,
        relacionadoARaw,
        relacionadoId,
        comentario,
        calificadoPor,
      ],
    );

    const insertId = (result.rows as any)?.insertId;
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando calificacion:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
