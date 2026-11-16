import { query } from "@/lib/db";

/**
 * Firma de Almacén al abrir (registrar la llegada) y al cerrar cada
 * contenedor de una recepción: quien lo hace se elige de Personal de Almacén
 * y escribe su clave personal (lib/seguridad/clavePersonal.ts). El usuario de
 * Almacén es uno solo para todos los teléfonos: sin la clave, `llegada_por` /
 * `cerrado_por` dicen solo el nombre de ese usuario, no quién fue.
 *
 * Con la firma va lo que anota quien firma: «Otro» control (si aplica) con
 * Sí/No y una nota. Al cerrar la nota es la de siempre, `notas_cierre`.
 *
 * Columnas en `recepcion_packing_contenedores`, se agregan solas; referencia
 * en sql/recepcion_contenedor_firma_almacen.sql. Leer la firma y verificar la
 * clave: lib/seguridad/firmaAlmacen.ts (lo mismo que el egreso).
 */

export type MomentoFirma = "llegada" | "cierre";

const COLUMNAS: [string, string][] = [
  ["llegada_almacenista", "VARCHAR(200) DEFAULT NULL"],
  ["llegada_otro", "VARCHAR(200) DEFAULT NULL"],
  ["llegada_otro_ok", "TINYINT(1) DEFAULT NULL"],
  ["llegada_nota", "TEXT DEFAULT NULL"],
  ["cierre_almacenista", "VARCHAR(200) DEFAULT NULL"],
  ["cierre_otro", "VARCHAR(200) DEFAULT NULL"],
  ["cierre_otro_ok", "TINYINT(1) DEFAULT NULL"],
];

let lista: Promise<void> | null = null;

export function asegurarColumnasFirmaContenedor(): Promise<void> {
  if (!lista) {
    lista = (async () => {
      const r = await query("SHOW COLUMNS FROM recepcion_packing_contenedores");
      const hay = new Set((r.rows as any[]).map((c) => String(c.Field)));
      for (const [col, tipo] of COLUMNAS) {
        if (hay.has(col)) continue;
        await query(`ALTER TABLE recepcion_packing_contenedores ADD COLUMN ${col} ${tipo}`);
      }
    })().catch((e) => {
      lista = null;
      throw e;
    });
  }
  return lista;
}
