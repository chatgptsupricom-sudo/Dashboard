import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NOMBRE = 200;

/**
 * Catalogo de choferes — de aca sale el select de "Chofer" en el formulario
 * de mercancia, en vez del texto libre de antes. Mismo patron que el
 * catalogo de almacenistas (ver ese archivo para el porque).
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const res = await query(
      `SELECT id, nombre FROM seguridad_catalogo_choferes
        ${cids !== null ? "WHERE cids = ?" : ""}
        ORDER BY nombre ASC`,
      cids !== null ? [cids] : [],
    );
    return NextResponse.json({ success: true, choferes: res.rows });
  } catch (error: any) {
    console.error("Error listando catalogo de choferes:", error);
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

    const existente = await query(
      `SELECT id, nombre FROM seguridad_catalogo_choferes
        WHERE nombre = ? AND ${cids !== null ? "cids = ?" : "cids IS NULL"}`,
      cids !== null ? [nombre, cids] : [nombre],
    );
    if (existente.rows.length > 0) {
      return NextResponse.json({ success: true, chofer: existente.rows[0] });
    }

    const res = await query(
      `INSERT INTO seguridad_catalogo_choferes (nombre, cids) VALUES (?, ?)`,
      [nombre, cids],
    );
    const id = (res.rows as any)?.insertId;

    return NextResponse.json({ success: true, chofer: { id, nombre } }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando chofer en el catalogo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
