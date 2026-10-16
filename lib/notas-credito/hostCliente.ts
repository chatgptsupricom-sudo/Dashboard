/**
 * Dominio propio del servicio de notas de crédito para clientes (lo usa el
 * middleware, así que sin imports de Node).
 *
 * En NC_HOSTS (separados por coma) la dirección pública es
 * /<idioma>/notas-credito/...; por dentro es /<idioma>/credito-clientes/...,
 * porque en el dominio del panel /notas-credito es la pantalla interna de
 * aprobación. En esos dominios no existe nada más (404), igual que en los del
 * portal de servicio técnico.
 */
export const HOSTS_NC = (process.env.NC_HOSTS || "notas.supricom.com.ve")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/** Ruta interna de las páginas (app/[locale]/credito-clientes). */
export const RUTA_INTERNA = "/credito-clientes";
/** Ruta pública en el dominio propio. */
export const RUTA_PUBLICA = "/notas-credito";

export function esHostNC(host: string | null | undefined): boolean {
  return HOSTS_NC.includes(String(host || "").toLowerCase().split(":")[0]);
}

/** Base de los enlaces de las páginas: la pública en el dominio propio, la interna en cualquier otro (panel, localhost). */
export function baseNC(host: string | null | undefined, locale: string): string {
  return `/${locale}${esHostNC(host) ? RUTA_PUBLICA : RUTA_INTERNA}`;
}
