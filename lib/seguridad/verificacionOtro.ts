import { query } from "@/lib/db";

/**
 * «Otro» control de la verificación de estado en las actas de RMA (ingreso y
 * despacho) y en la verificación del portón del despacho de mercancía, si aplica: qué se revisó y si está bien. Vacío = no aplica; con
 * texto hay que declarar Sí o No, como en los otros controles.
 *
 * Las columnas se agregan solas (`SHOW COLUMNS` + `ALTER`); la referencia para
 * phpMyAdmin es sql/seguridad_ingreso_otro_observacion.sql.
 */

export type TablaActa = "seguridad_ingresos" | "seguridad_despachos" | "seguridad_mercancia";

const COLUMNAS: Record<TablaActa, [string, string][]> = {
  seguridad_ingresos: [
    ["otro_verificacion", "VARCHAR(200) DEFAULT NULL"],
    ["otro_verificacion_ok", "TINYINT(1) DEFAULT NULL"],
    // El despacho ya tenía `observaciones`; el ingreso no.
    ["observacion_seguridad", "TEXT DEFAULT NULL"],
  ],
  seguridad_despachos: [
    ["otro_verificacion", "VARCHAR(200) DEFAULT NULL"],
    ["otro_verificacion_ok", "TINYINT(1) DEFAULT NULL"],
  ],
  // Egreso de mercancía: lo que anota Seguridad al verificar en el portón
  // (`motivo_no_aprobado` es otra cosa: el porqué de no aprobar).
  seguridad_mercancia: [
    ["otro_verificacion", "VARCHAR(200) DEFAULT NULL"],
    ["otro_verificacion_ok", "TINYINT(1) DEFAULT NULL"],
    ["observacion_seguridad", "TEXT DEFAULT NULL"],
  ],
};

const listas = new Map<TablaActa, Promise<void>>();

export function asegurarColumnasVerificacion(tabla: TablaActa): Promise<void> {
  let p = listas.get(tabla);
  if (!p) {
    p = (async () => {
      const r = await query(`SHOW COLUMNS FROM ${tabla}`);
      const hay = new Set((r.rows as any[]).map((c) => String(c.Field)));
      for (const [col, tipo] of COLUMNAS[tabla]) {
        if (hay.has(col)) continue;
        await query(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${tipo}`);
      }
    })().catch((e) => {
      // Que se reintente en la próxima acta en vez de quedar marcado.
      listas.delete(tabla);
      throw e;
    });
    listas.set(tabla, p);
  }
  return p;
}

/** Lee «Otro» del body: `{ detalle, ok }` (null/null si no aplica) o el error. */
export function leerOtroVerificacion(body: any): { detalle: string | null; ok: 0 | 1 | null; error: string | null } {
  const detalle = String(body?.otro_verificacion ?? "").trim().slice(0, 200) || null;
  if (!detalle) return { detalle: null, ok: null, error: null };
  const ok = body?.otro_verificacion_ok;
  if (typeof ok !== "boolean") {
    return { detalle, ok: null, error: "Marca Sí o No en «Otro» (otro_verificacion_ok)" };
  }
  return { detalle, ok: ok ? 1 : 0, error: null };
}
