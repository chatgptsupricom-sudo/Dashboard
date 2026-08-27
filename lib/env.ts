/**
 * Acceso a los secretos del entorno.
 *
 * Hasta ahora cada archivo hacia `process.env.JWT_SECRET || "<valor literal>"`.
 * Ese valor por defecto era el secreto real de produccion y estaba en el repo
 * (68 archivos) y en el log de build de EasyPanel, asi que cualquiera con
 * acceso a uno de los dos podia firmar un token de cualquier rol. Y lo peor no
 * era la exposicion sino el silencio: si la variable faltaba en algun entorno,
 * la app seguia funcionando con un secreto publico sin avisar a nadie.
 *
 * Ahora falta la variable = falla, ruidosamente y en el momento de usarla.
 *
 * Todos los accesos son FUNCIONES, no constantes de modulo, y es a proposito:
 * `next build` evalua el ambito de modulo de cada ruta al recolectar sus datos,
 * asi que una constante que lanza al importarse rompe la compilacion. Con
 * funciones, el error solo salta al atender una peticion, que es cuando el
 * secreto de verdad hace falta.
 */

function requerido(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(
      `Falta la variable de entorno ${nombre}. Antes habia un valor por ` +
        `defecto en el codigo, pero era el secreto real de produccion y estaba ` +
        `publicado en el repo, asi que se elimino. Definir ${nombre} en el ` +
        `entorno (.env.local en desarrollo, variables del servicio en EasyPanel).`,
    );
  }
  return valor;
}

/** Secreto de firma de los JWT. Lo comparten `jsonwebtoken` (lib/jwt.ts) y `jose`. */
export function jwtSecret(): string {
  return requerido("JWT_SECRET");
}

let jwtSecretCache: Uint8Array | null = null;

/** El mismo secreto en bytes, que es lo que pide `jose`. Se cachea por proceso. */
export function jwtSecretBytes(): Uint8Array {
  if (!jwtSecretCache) {
    jwtSecretCache = new TextEncoder().encode(jwtSecret());
  }
  return jwtSecretCache;
}

/** Clave de API de Odoo (JSON-RPC). */
export function odooApiKey(): string {
  return requerido("ODOO_API_KEY");
}
