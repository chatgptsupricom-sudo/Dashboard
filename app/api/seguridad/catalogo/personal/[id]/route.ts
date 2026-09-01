import { query } from "@/lib/db";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { asegurarEsquemaPersonal } from "@/lib/seguridad/catalogoPersonal";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/seguridad/catalogo/personal/[id]  { activo: boolean }
 *
 * Dar de baja / reactivar una persona del catálogo. No se borra la fila: el
 * histórico de actas guarda el nombre como texto y da igual, pero una baja por
 * error no debería perder el registro. Renombrar no se permite acá — se da de
 * baja y se agrega con el nombre correcto, así el acta vieja no cambia.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    await asegurarEsquemaPersonal();

    const { id } = await params;
    const personaId = parseInt(id, 10);
    if (isNaN(personaId)) {
      return NextResponse.json({ error: "ID invalido" }, { status: 400 });
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    if (typeof body?.activo !== "boolean") {
      return NextResponse.json(
        { error: "activo es obligatorio (true o false)" },
        { status: 400 },
      );
    }

    // 404 y no 403: adivinar un id de otra sucursal no debe ni confirmar que
    // existe.
    const existe = await query(
      `SELECT id FROM seguridad_catalogo_personal
        WHERE id = ? ${cids !== null ? "AND cids = ?" : ""}`,
      cids !== null ? [personaId, cids] : [personaId],
    );
    if (existe.rows.length === 0) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    await query(
      `UPDATE seguridad_catalogo_personal SET activo = ? WHERE id = ?`,
      [body.activo ? 1 : 0, personaId],
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error actualizando persona del catalogo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
