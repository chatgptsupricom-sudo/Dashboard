import bcrypt from "bcryptjs";
import { query } from "@/lib/db";
import { limitar } from "@/lib/servicio-tecnico/limites";

/**
 * Clave personal del personal de Seguridad: reemplaza la firma dibujada en el
 * acta del despacho de mercancía (firmar con el dedo desde una laptop no
 * funcionaba). Cada persona registra la suya en "Personal de Seguridad"; al
 * firmar se elige el nombre y se escribe la clave.
 *
 * - 4 a 6 dígitos.
 * - Se guarda solo el hash (bcrypt) en `seguridad_catalogo_personal.clave_hash`:
 *   nadie la puede leer, ni desde la base.
 * - No tiene que ser única: dos personas pueden elegir la misma; se valida
 *   contra el nombre elegido.
 * - 5 intentos fallidos por persona en 15 minutos la bloquean ese rato: una
 *   clave de 4 dígitos se adivina probando si no.
 */

export const CLAVE_MIN = 4;
export const CLAVE_MAX = 6;

export function esClaveValida(v: unknown): v is string {
  return typeof v === "string" && /^\d{4,6}$/.test(v);
}

export function hashClave(clave: string): Promise<string> {
  return bcrypt.hash(clave, 10);
}

export function compararClave(clave: string, hash: string): Promise<boolean> {
  return bcrypt.compare(clave, hash);
}

const LIMITE_FALLOS = { max: 5, ventanaSegundos: 15 * 60 };

let columnaLista: Promise<void> | null = null;

/** Agrega `clave_hash` si falta (sql/seguridad_personal_clave.sql es la migración de prod). */
export function asegurarColumnaClave(): Promise<void> {
  if (!columnaLista) {
    columnaLista = query(
      "ALTER TABLE seguridad_catalogo_personal ADD COLUMN clave_hash VARCHAR(100) DEFAULT NULL",
    )
      .then(() => undefined)
      .catch((e: any) => {
        if (/duplicate column/i.test(e?.message || "") || e?.code === "ER_DUP_FIELDNAME") return;
        columnaLista = null;
        throw e;
      });
  }
  return columnaLista;
}

export type ResultadoClave =
  | { ok: true }
  | { ok: false; motivo: string; status: number };

/**
 * Valida la clave de una persona de Seguridad activa de la sucursal. Cuenta
 * los fallos por persona (no por IP: la laptop del portón es una sola).
 */
export async function verificarClaveSeguridad(
  nombre: string,
  cids: number | null,
  clave: unknown,
): Promise<ResultadoClave> {
  if (!esClaveValida(clave)) {
    return { ok: false, motivo: `La clave tiene que ser de ${CLAVE_MIN} a ${CLAVE_MAX} números.`, status: 400 };
  }
  const llave = `clave-seguridad:${cids ?? "todas"}:${nombre.toLowerCase()}`;
  const bloqueo = limitar(llave, LIMITE_FALLOS, false);
  if (!bloqueo.ok) {
    const minutos = Math.ceil(bloqueo.esperaSegundos / 60);
    return {
      ok: false,
      motivo: `Demasiados intentos con la clave de ${nombre}. Espera ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
      status: 429,
    };
  }

  await asegurarColumnaClave();
  const r = await query(
    `SELECT clave_hash FROM seguridad_catalogo_personal
      WHERE nombre = ? AND rol = 'seguridad' AND activo = 1 AND ${cids !== null ? "cids = ?" : "cids IS NULL"}
      LIMIT 1`,
    cids !== null ? [nombre, cids] : [nombre],
  );
  const fila = (r.rows as any[])[0];
  if (!fila) return { ok: false, motivo: "Elige de la lista a la persona que firma.", status: 400 };
  if (!fila.clave_hash) {
    return {
      ok: false,
      motivo: `${nombre} todavía no tiene clave: regístrala en Personal de Seguridad.`,
      status: 400,
    };
  }
  if (!(await compararClave(clave, fila.clave_hash))) {
    limitar(llave, LIMITE_FALLOS, true);
    return { ok: false, motivo: "Clave incorrecta.", status: 401 };
  }
  return { ok: true };
}
