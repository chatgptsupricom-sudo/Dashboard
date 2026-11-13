import { query } from "@/lib/db";
import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  asegurarColumnaClaveAlmacen,
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
 * PATCH /api/seguridad/mercancia/catalogo/almacenistas/[id]  { clave, clave_actual? }
 *
 * Asigna o cambia la clave personal de un almacenista (4 a 6 números, se
 * guarda solo el hash). Con ella firma al abrir y cerrar cada contenedor de
 * una recepción. Ponerla por primera vez no pide nada; cambiarla pide la
 * actual, para que nadie cambie la de otro desde el teléfono compartido de
 * Almacén. El SuperAdmin la puede reponer sin la actual (para un olvido).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAlmacen(request);
    if (auth.error) return auth.error;
    const esSuperadmin = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const personaId = parseInt((await params).id, 10);
    if (isNaN(personaId)) return NextResponse.json({ error: "ID invalido" }, { status: 400 });

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    if (!esClaveValida(body?.clave)) {
      return NextResponse.json(
        { error: `La clave tiene que ser de ${CLAVE_MIN} a ${CLAVE_MAX} números` },
        { status: 400 },
      );
    }

    await asegurarColumnaClaveAlmacen();
    // 404 y no 403 para otra sucursal: no confirmar que existe.
    const persona = await query(
      `SELECT id, clave_hash FROM seguridad_catalogo_almacenistas
        WHERE id = ?${cids !== null ? " AND cids = ?" : ""}`,
      cids !== null ? [personaId, cids] : [personaId],
    );
    const fila = (persona.rows as any[])[0];
    if (!fila) return NextResponse.json({ error: "No encontrado" }, { status: 404 });

    if (fila.clave_hash && !esSuperadmin) {
      const llave = `clave-almacen-cambio:${personaId}`;
      const limite = { max: 5, ventanaSegundos: 15 * 60 };
      if (!limitar(llave, limite, false).ok) {
        return NextResponse.json({ error: "Demasiados intentos. Espera unos minutos." }, { status: 429 });
      }
      if (!esClaveValida(body?.clave_actual) || !(await compararClave(body.clave_actual, fila.clave_hash))) {
        limitar(llave, limite, true);
        return NextResponse.json({ error: "La clave actual no es correcta" }, { status: 401 });
      }
    }

    await query(`UPDATE seguridad_catalogo_almacenistas SET clave_hash = ? WHERE id = ?`, [
      await hashClave(body.clave),
      personaId,
    ]);
    return NextResponse.json({ success: true, tiene_clave: 1 });
  } catch (error: any) {
    console.error("Error guardando la clave del almacenista:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
