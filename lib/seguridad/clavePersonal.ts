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
 * Lo común de las dos claves (Seguridad y Almacén): formato, bloqueo por
 * fallos por persona (no por IP: la laptop del portón o el teléfono de
 * Almacén es uno solo para todos) y comparación con el hash guardado.
 */
async function verificarClave(opciones: {
  /** Prefijo de la llave del límite de fallos. */
  llave: string;
  nombre: string;
  cids: number | null;
  clave: unknown;
  /** Hash de la persona (undefined = no está en el catálogo). */
  buscarHash: () => Promise<string | null | undefined>;
  /** Dónde se registra la clave, para el mensaje. */
  donde: string;
}): Promise<ResultadoClave> {
  const { nombre, cids, clave } = opciones;
  if (!esClaveValida(clave)) {
    return { ok: false, motivo: `La clave tiene que ser de ${CLAVE_MIN} a ${CLAVE_MAX} números.`, status: 400 };
  }
  const llave = `${opciones.llave}:${cids ?? "todas"}:${nombre.toLowerCase()}`;
  const bloqueo = limitar(llave, LIMITE_FALLOS, false);
  if (!bloqueo.ok) {
    const minutos = Math.ceil(bloqueo.esperaSegundos / 60);
    return {
      ok: false,
      motivo: `Demasiados intentos con la clave de ${nombre}. Espera ${minutos} minuto${minutos === 1 ? "" : "s"}.`,
      status: 429,
    };
  }

  const hash = await opciones.buscarHash();
  if (hash === undefined) return { ok: false, motivo: "Elige de la lista a la persona que firma.", status: 400 };
  if (!hash) {
    return {
      ok: false,
      motivo: `${nombre} todavía no tiene clave: regístrala en ${opciones.donde}.`,
      status: 400,
    };
  }
  if (!(await compararClave(clave, hash))) {
    limitar(llave, LIMITE_FALLOS, true);
    return { ok: false, motivo: "Clave incorrecta.", status: 401 };
  }
  return { ok: true };
}

/** Valida la clave de una persona de Seguridad activa de la sucursal. */
export async function verificarClaveSeguridad(
  nombre: string,
  cids: number | null,
  clave: unknown,
): Promise<ResultadoClave> {
  return verificarClave({
    llave: "clave-seguridad",
    nombre,
    cids,
    clave,
    donde: "Personal de Seguridad",
    buscarHash: async () => {
      await asegurarColumnaClave();
      const r = await query(
        `SELECT clave_hash FROM seguridad_catalogo_personal
          WHERE nombre = ? AND rol = 'seguridad' AND activo = 1 AND ${cids !== null ? "cids = ?" : "cids IS NULL"}
          LIMIT 1`,
        cids !== null ? [nombre, cids] : [nombre],
      );
      const fila = (r.rows as any[])[0];
      return fila ? (fila.clave_hash ?? null) : undefined;
    },
  });
}

// ── Almacén ─────────────────────────────────────────────────────────────────
//
// La misma clave para el personal de Almacén (`seguridad_catalogo_almacenistas`):
// el usuario de Almacén es uno solo para todos los teléfonos, así que la clave
// es lo que dice quién abrió o cerró cada contenedor de una recepción. Cada
// uno la registra en Personal de Almacén; cambiarla pide la actual y el
// SuperAdmin la puede reponer si alguien la olvida.

let columnaAlmacenLista: Promise<void> | null = null;

/** Agrega `clave_hash` al catálogo de almacenistas si falta. */
export function asegurarColumnaClaveAlmacen(): Promise<void> {
  if (!columnaAlmacenLista) {
    columnaAlmacenLista = query(
      "ALTER TABLE seguridad_catalogo_almacenistas ADD COLUMN clave_hash VARCHAR(100) DEFAULT NULL",
    )
      .then(() => undefined)
      .catch((e: any) => {
        if (/duplicate column/i.test(e?.message || "") || e?.code === "ER_DUP_FIELDNAME") return;
        columnaAlmacenLista = null;
        throw e;
      });
  }
  return columnaAlmacenLista;
}

/** Valida la clave de una persona del catálogo de almacenistas de la sucursal. */
export async function verificarClaveAlmacen(
  nombre: string,
  cids: number | null,
  clave: unknown,
): Promise<ResultadoClave> {
  return verificarClave({
    llave: "clave-almacen",
    nombre,
    cids,
    clave,
    donde: "Personal de Almacén",
    buscarHash: async () => {
      await asegurarColumnaClaveAlmacen();
      const r = await query(
        `SELECT clave_hash FROM seguridad_catalogo_almacenistas
          WHERE nombre = ? AND ${cids !== null ? "cids = ?" : "cids IS NULL"}
          LIMIT 1`,
        cids !== null ? [nombre, cids] : [nombre],
      );
      const fila = (r.rows as any[])[0];
      return fila ? (fila.clave_hash ?? null) : undefined;
    },
  });
}
