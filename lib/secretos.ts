/**
 * Resolucion de secretos, sin valores de respaldo escritos en el codigo.
 *
 * Antes, 59 archivos leian `process.env.JWT_SECRET` con un valor por defecto
 * escrito a mano al lado. Ese valor esta en el repositorio, asi que cualquiera
 * con acceso al codigo podia firmar tokens validos para el panel — y peor: si
 * la variable faltaba en un entorno, el sistema seguia funcionando con el
 * secreto publico sin que nada avisara.
 *
 * ## Por que NO lanza una excepcion
 *
 * Estas constantes se evaluan al importar el modulo, y `next build` importa
 * las rutas para analizarlas. Lanzar aqui romperia el build en cualquier
 * maquina sin `.env`, que es exactamente lo que ocurre dentro de Docker.
 *
 * En su lugar falla CERRADO: sin la variable se usa un secreto aleatorio del
 * proceso. Ningun token verifica contra el, asi que nadie entra y el problema
 * se nota de inmediato — en vez de arrancar en silencio aceptando un secreto
 * que esta publicado.
 */

let jwtCacheBytes: Uint8Array | null = null;
let jwtCacheTexto: string | null = null;
let yaAvisadoJwt = false;
let yaAvisadoOdoo = false;

function secretoAleatorio(): string {
  const bytes = new Uint8Array(48);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function resolverJwt(): string {
  const v = (process.env.JWT_SECRET || "").trim();
  if (v) return v;

  if (!yaAvisadoJwt) {
    yaAvisadoJwt = true;
    console.error(
      "[secretos] FALTA JWT_SECRET. Se usa un secreto aleatorio de este " +
        "proceso: NADIE va a poder iniciar sesion hasta que se configure. " +
        "Es a proposito — antes se caia en un valor escrito en el repositorio.",
    );
  }
  return secretoAleatorio();
}

/** El secreto como bytes, para `jose` (middleware y guards de API). */
export function jwtSecretBytes(): Uint8Array {
  if (!jwtCacheBytes) jwtCacheBytes = new TextEncoder().encode(resolverJwt());
  return jwtCacheBytes;
}

/** El secreto como texto, para `jsonwebtoken` (firma en lib/jwt.ts). */
export function jwtSecretString(): string {
  if (jwtCacheTexto === null) jwtCacheTexto = resolverJwt();
  return jwtCacheTexto;
}

/**
 * Clave de API de Odoo.
 *
 * Aqui fallar cerrado es devolver cadena vacia: Odoo rechaza la llamada y el
 * error queda en el log, en vez de seguir usando una clave publicada.
 */
export function odooApiKey(): string {
  const v = (process.env.ODOO_API_KEY || "").trim();
  if (v) return v;

  if (!yaAvisadoOdoo) {
    yaAvisadoOdoo = true;
    console.error(
      "[secretos] FALTA ODOO_API_KEY. Las llamadas a Odoo van a fallar.",
    );
  }
  return "";
}
