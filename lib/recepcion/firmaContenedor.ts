import { query } from "@/lib/db";
import { verificarClaveAlmacen, type ResultadoClave } from "@/lib/seguridad/clavePersonal";
import { leerOtroVerificacion } from "@/lib/seguridad/verificacionOtro";

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
 * en sql/recepcion_contenedor_firma_almacen.sql.
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

export type FirmaContenedor = {
  almacenista: string;
  otro: string | null;
  otroOk: 0 | 1 | null;
  /** Solo en la llegada (al cerrar va en `notas_cierre`). */
  nota: string | null;
};

/**
 * Lee del body `{ almacenista, clave, otro_verificacion, otro_verificacion_ok,
 * nota }`. Devuelve el error de formato, si lo hay; la clave se verifica
 * aparte (`verificarFirma`), al final, para que solo cuente como intento
 * fallido una clave equivocada.
 */
export function leerFirmaContenedor(body: any): { firma: FirmaContenedor; error: string | null } {
  const almacenista = String(body?.almacenista ?? "").trim().slice(0, 200);
  const otro = leerOtroVerificacion(body);
  const nota = String(body?.nota ?? "").trim().slice(0, 2000) || null;
  const firma: FirmaContenedor = { almacenista, otro: otro.detalle, otroOk: otro.ok, nota };
  if (!almacenista) return { firma, error: "Elige quién de Almacén firma y escribe su clave" };
  if (otro.error) return { firma, error: otro.error };
  return { firma, error: null };
}

/** Clave del almacenista contra el catálogo de la sede de la recepción. */
export function verificarFirma(firma: FirmaContenedor, cids: number | null, clave: unknown): Promise<ResultadoClave> {
  return verificarClaveAlmacen(firma.almacenista, cids, clave);
}
