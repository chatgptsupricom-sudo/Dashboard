import { query } from "@/lib/db";
import { verificarClaveAlmacen, type ResultadoClave } from "@/lib/seguridad/clavePersonal";
import { leerOtroVerificacion } from "@/lib/seguridad/verificacionOtro";

/**
 * Firma de Almacén con clave personal (lib/seguridad/clavePersonal.ts): quien
 * hace el paso se elige de Personal de Almacén y escribe su clave. El usuario
 * de Almacén es uno solo para todos los teléfonos, así que la clave es lo que
 * dice quién fue. Con la firma va lo que anota: «Otro» control (si aplica)
 * con Sí/No y una nota.
 *
 * La usan la recepción (abrir y cerrar cada contenedor,
 * lib/recepcion/firmaContenedor.ts) y el egreso de mercancía (verificar el
 * armado, aquí abajo). En pantalla: components/recepcion/FirmaAlmacen.tsx.
 */

export type FirmaAlmacen = {
  almacenista: string;
  otro: string | null;
  otroOk: 0 | 1 | null;
  nota: string | null;
};

/**
 * Lee del body `{ almacenista, clave, otro_verificacion, otro_verificacion_ok,
 * nota }`. Devuelve el error de formato, si lo hay; la clave se verifica
 * aparte (`verificarFirmaAlmacen`), al final, para que solo cuente como
 * intento fallido una clave equivocada.
 */
export function leerFirmaAlmacen(body: any): { firma: FirmaAlmacen; error: string | null } {
  const almacenista = String(body?.almacenista ?? "").trim().slice(0, 200);
  const otro = leerOtroVerificacion(body);
  const nota = String(body?.nota ?? "").trim().slice(0, 2000) || null;
  const firma: FirmaAlmacen = { almacenista, otro: otro.detalle, otroOk: otro.ok, nota };
  if (!almacenista) return { firma, error: "Elige quién de Almacén firma y escribe su clave" };
  if (otro.error) return { firma, error: otro.error };
  return { firma, error: null };
}

/** Clave del almacenista contra el catálogo de la sede. */
export function verificarFirmaAlmacen(
  firma: FirmaAlmacen,
  cids: number | null,
  clave: unknown,
): Promise<ResultadoClave> {
  return verificarClaveAlmacen(firma.almacenista, cids, clave);
}

// ── Egreso: verificar el armado ─────────────────────────────────────────────
//
// Quien verifica el armado queda en `armado_verificado_por` (antes, el nombre
// del usuario compartido); `armado_con_clave = 1` dice que firmó con su clave.

const COLUMNAS_ARMADO: [string, string][] = [
  ["armado_con_clave", "TINYINT(1) DEFAULT NULL"],
  ["armado_otro", "VARCHAR(200) DEFAULT NULL"],
  ["armado_otro_ok", "TINYINT(1) DEFAULT NULL"],
  ["armado_nota", "TEXT DEFAULT NULL"],
];

let armadoListo: Promise<void> | null = null;

/** Columnas de la firma del armado en `seguridad_mercancia`; se agregan solas. */
export function asegurarColumnasFirmaArmado(): Promise<void> {
  if (!armadoListo) {
    armadoListo = (async () => {
      const r = await query("SHOW COLUMNS FROM seguridad_mercancia");
      const hay = new Set((r.rows as any[]).map((c) => String(c.Field)));
      for (const [col, tipo] of COLUMNAS_ARMADO) {
        if (hay.has(col)) continue;
        await query(`ALTER TABLE seguridad_mercancia ADD COLUMN ${col} ${tipo}`);
      }
    })().catch((e) => {
      armadoListo = null;
      throw e;
    });
  }
  return armadoListo;
}
