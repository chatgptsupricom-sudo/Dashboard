import { query } from "@/lib/db";
import { requireRmaOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  asegurarEsquemaPersonal,
  rolPersonalAdministrable,
} from "@/lib/seguridad/catalogoPersonal";
import {
  asegurarColumnaClave,
  CLAVE_MAX,
  CLAVE_MIN,
  compararClave,
  esClaveValida,
  hashClave,
} from "@/lib/seguridad/clavePersonal";
import { limitar } from "@/lib/servicio-tecnico/limites";
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
    const auth = await requireRmaOSeguridad(request);
    if (auth.error) return auth.error;

    const administrable = rolPersonalAdministrable(auth.payload);
    if (administrable === false) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

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
    // Asignar o cambiar la clave personal de alguien de Seguridad. Ponerla
    // por primera vez no pide nada; cambiarla pide la actual, para que nadie
    // cambie la clave de otro (superadmin si puede, para destrabar un olvido).
    if (body?.clave !== undefined) {
      if (!esClaveValida(body.clave)) {
        return NextResponse.json(
          { error: `La clave tiene que ser de ${CLAVE_MIN} a ${CLAVE_MAX} números` },
          { status: 400 },
        );
      }
      await asegurarColumnaClave();
      const filtro = ["id = ?", "rol = 'seguridad'"];
      const valoresClave: any[] = [personaId];
      if (cids !== null) {
        filtro.push("cids = ?");
        valoresClave.push(cids);
      }
      const persona = await query(
        `SELECT id, nombre, clave_hash FROM seguridad_catalogo_personal WHERE ${filtro.join(" AND ")}`,
        valoresClave,
      );
      const fila = (persona.rows as any[])[0];
      if (!fila) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

      if (fila.clave_hash && administrable !== null) {
        const llave = `clave-cambio:${personaId}`;
        const limite = { max: 5, ventanaSegundos: 15 * 60 };
        if (!limitar(llave, limite, false).ok) {
          return NextResponse.json(
            { error: "Demasiados intentos. Espera unos minutos." },
            { status: 429 },
          );
        }
        if (!esClaveValida(body?.clave_actual) || !(await compararClave(body.clave_actual, fila.clave_hash))) {
          limitar(llave, limite, true);
          return NextResponse.json({ error: "La clave actual no es correcta" }, { status: 401 });
        }
      }

      await query(`UPDATE seguridad_catalogo_personal SET clave_hash = ? WHERE id = ?`, [
        await hashClave(body.clave),
        personaId,
      ]);
      return NextResponse.json({ success: true, tiene_clave: 1 });
    }

    if (typeof body?.activo !== "boolean") {
      return NextResponse.json(
        { error: "activo es obligatorio (true o false)" },
        { status: 400 },
      );
    }

    // 404 y no 403: adivinar un id de otra sucursal —o de la lista de otro
    // rol— no debe ni confirmar que existe.
    const where = ["id = ?"];
    const valores: any[] = [personaId];
    if (cids !== null) {
      where.push("cids = ?");
      valores.push(cids);
    }
    if (administrable !== null) {
      where.push("rol = ?");
      valores.push(administrable);
    }
    const existe = await query(
      `SELECT id FROM seguridad_catalogo_personal WHERE ${where.join(" AND ")}`,
      valores,
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
