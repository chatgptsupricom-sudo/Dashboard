import { query } from "@/lib/db";
import { requireRmaOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import {
  asegurarEsquemaPersonal,
  esRolPersonal,
  rolPersonalAdministrable,
} from "@/lib/seguridad/catalogoPersonal";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_NOMBRE = 200;

/**
 * Catálogo de personal de Seguridad / RMA (#50).
 *
 * De acá salen los selects "Recibió por Seguridad" y "Recibió por RMA" del
 * formulario de ingreso.
 *
 * Cada rol administra solo su propia lista: Seguridad desde
 * /es/seguridad/config/personal y RMA desde /es/rma/personal. Leer, en cambio,
 * Seguridad lee las dos — necesita elegir "Recibió por RMA" en el ingreso —
 * y RMA solo la suya.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRmaOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    await asegurarEsquemaPersonal();

    const { searchParams } = new URL(request.url);
    const sesionRol = String(auth.payload?.role || "").toLowerCase().trim();
    const rol = sesionRol === "rma" ? "rma" : searchParams.get("rol");
    // El formulario de ingreso solo quiere gente activa; la pantalla de
    // administración pide `?incluir_inactivos=1` para poder reactivar.
    const incluirInactivos = searchParams.get("incluir_inactivos") === "1";

    const where: string[] = [];
    const params: any[] = [];
    if (rol) {
      if (!esRolPersonal(rol)) {
        return NextResponse.json({ error: "rol invalido" }, { status: 400 });
      }
      where.push("rol = ?");
      params.push(rol);
    }
    if (cids !== null) {
      where.push("cids = ?");
      params.push(cids);
    }
    if (!incluirInactivos) {
      where.push("activo = 1");
    }

    const res = await query(
      `SELECT id, nombre, rol, activo FROM seguridad_catalogo_personal
        ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY rol ASC, nombre ASC`,
      params,
    );
    return NextResponse.json({ success: true, personal: res.rows });
  } catch (error: any) {
    console.error("Error listando catalogo de personal:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireRmaOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    await asegurarEsquemaPersonal();

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const nombre = String(body?.nombre || "").trim().slice(0, MAX_NOMBRE);
    const rol = body?.rol;
    if (!nombre) {
      return NextResponse.json({ error: "nombre es obligatorio" }, { status: 400 });
    }
    if (!esRolPersonal(rol)) {
      return NextResponse.json({ error: "rol invalido" }, { status: 400 });
    }
    const administrable = rolPersonalAdministrable(auth.payload);
    if (administrable === false || (administrable !== null && administrable !== rol)) {
      return NextResponse.json(
        { error: "Solo puedes registrar personal de tu propio rol" },
        { status: 403 },
      );
    }

    // Si ya existe (mismo nombre + rol + sucursal) se devuelve el que hay, y de
    // paso se reactiva: "volver a agregar" a alguien que se había dado de baja
    // es la forma natural de traerlo de vuelta.
    const existente = await query(
      `SELECT id, nombre, rol, activo FROM seguridad_catalogo_personal
        WHERE nombre = ? AND rol = ? AND ${cids !== null ? "cids = ?" : "cids IS NULL"}`,
      cids !== null ? [nombre, rol, cids] : [nombre, rol],
    );
    if (existente.rows.length > 0) {
      const fila = existente.rows[0] as any;
      if (!fila.activo) {
        await query(
          `UPDATE seguridad_catalogo_personal SET activo = 1 WHERE id = ?`,
          [fila.id],
        );
        fila.activo = 1;
      }
      return NextResponse.json({ success: true, persona: fila });
    }

    const res = await query(
      `INSERT INTO seguridad_catalogo_personal (nombre, rol, cids) VALUES (?, ?, ?)`,
      [nombre, rol, cids],
    );
    const id = (res.rows as any)?.insertId;

    return NextResponse.json(
      { success: true, persona: { id, nombre, rol, activo: 1 } },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error creando persona en el catalogo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
