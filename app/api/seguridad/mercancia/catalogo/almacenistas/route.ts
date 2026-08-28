import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NOMBRE = 200;

/**
 * Catalogo de almacenistas — de aca sale el select de "Almacenista que
 * carga" en el formulario de mercancia, en vez del texto libre de antes.
 *
 * No confundir con GET /api/seguridad/almacenistas: ese devuelve promedios
 * de calificacion calculados sobre seguridad_calificaciones, no una tabla
 * propia. Este es el catalogo — la lista de nombres validos para elegir.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const res = await query(
      `SELECT id, nombre FROM seguridad_catalogo_almacenistas
        ${cids !== null ? "WHERE cids = ?" : ""}
        ORDER BY nombre ASC`,
      cids !== null ? [cids] : [],
    );
    return NextResponse.json({ success: true, almacenistas: res.rows });
  } catch (error: any) {
    console.error("Error listando catalogo de almacenistas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const nombre = String(body?.nombre || "").trim().slice(0, MAX_NOMBRE);
    if (!nombre) {
      return NextResponse.json({ error: "nombre es obligatorio" }, { status: 400 });
    }

    // Si ya existe (mismo nombre y sucursal) se devuelve el que hay en vez
    // de duplicar — el select de abajo se llena de la lista, y una lista con
    // "Juan Perez" dos veces no ayuda a nadie.
    const existente = await query(
      `SELECT id, nombre FROM seguridad_catalogo_almacenistas
        WHERE nombre = ? AND ${cids !== null ? "cids = ?" : "cids IS NULL"}`,
      cids !== null ? [nombre, cids] : [nombre],
    );
    if (existente.rows.length > 0) {
      return NextResponse.json({ success: true, almacenista: existente.rows[0] });
    }

    const res = await query(
      `INSERT INTO seguridad_catalogo_almacenistas (nombre, cids) VALUES (?, ?)`,
      [nombre, cids],
    );
    const id = (res.rows as any)?.insertId;

    return NextResponse.json(
      { success: true, almacenista: { id, nombre } },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error creando almacenista en el catalogo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
