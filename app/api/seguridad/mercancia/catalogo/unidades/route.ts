import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX = { placa: 50, descripcion: 200 };

/**
 * Catalogo de unidades (vehiculos) — de aca sale el select de "Placa del
 * vehiculo" en el formulario de mercancia, en vez del texto libre de antes.
 * Mismo patron que almacenistas/choferes, con un campo extra opcional
 * (`descripcion`, ej. "Camion Ford F-350 blanco") para distinguir placas
 * parecidas de un vistazo.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const res = await query(
      `SELECT id, placa, descripcion FROM seguridad_catalogo_unidades
        ${cids !== null ? "WHERE cids = ?" : ""}
        ORDER BY placa ASC`,
      cids !== null ? [cids] : [],
    );
    return NextResponse.json({ success: true, unidades: res.rows });
  } catch (error: any) {
    console.error("Error listando catalogo de unidades:", error);
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

    const placa = String(body?.placa || "").trim().toUpperCase().slice(0, MAX.placa);
    if (!placa) {
      return NextResponse.json({ error: "placa es obligatoria" }, { status: 400 });
    }
    const descripcion = body?.descripcion
      ? String(body.descripcion).trim().slice(0, MAX.descripcion)
      : null;

    const existente = await query(
      `SELECT id, placa, descripcion FROM seguridad_catalogo_unidades
        WHERE placa = ? AND ${cids !== null ? "cids = ?" : "cids IS NULL"}`,
      cids !== null ? [placa, cids] : [placa],
    );
    if (existente.rows.length > 0) {
      return NextResponse.json({ success: true, unidad: existente.rows[0] });
    }

    const res = await query(
      `INSERT INTO seguridad_catalogo_unidades (placa, descripcion, cids) VALUES (?, ?, ?)`,
      [placa, descripcion, cids],
    );
    const id = (res.rows as any)?.insertId;

    return NextResponse.json(
      { success: true, unidad: { id, placa, descripcion } },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error creando unidad en el catalogo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
