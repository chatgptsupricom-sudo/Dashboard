/**
 * Control de acceso a la seccion "Reportes Comerciales".
 *
 * La encargada del reporte es una vendedora que conserva su rol `vendedor`
 * (necesita las funciones normales de vendedor), pero NO todos los vendedores
 * deben ver esta seccion. Por eso el acceso no se puede resolver solo por rol:
 *
 *   - `superadmin` y `gerencia de ventas`: siempre.
 *   - Cualquier otro: solo si su correo esta en la lista de la env
 *     REPORTES_COMERCIALES_EMAILS (separado por comas).
 *
 * La env se lee en el SERVIDOR (middleware, rutas de API, guard de la pagina y
 * el endpoint /acceso que consulta el sidebar). Por eso NO lleva el prefijo
 * NEXT_PUBLIC_: asi se puede cambiar la lista de correos con un simple restart,
 * sin reconstruir la app. Se mantiene NEXT_PUBLIC_REPORTES_COMERCIALES_EMAILS
 * como fallback para no romper instalaciones que ya la tenian configurada.
 *
 * Este modulo es puro (sin imports de Node) para que el middleware lo pueda
 * importar.
 */

import { COMPANY_IDS_REPORTE } from "@/lib/reportes-comerciales/sedes";

const ROLES_CON_ACCESO = ["superadmin", "gerencia de ventas"];

export function correosAutorizados(): string[] {
  const crudo =
    process.env.REPORTES_COMERCIALES_EMAILS ||
    process.env.NEXT_PUBLIC_REPORTES_COMERCIALES_EMAILS ||
    "";
  return crudo
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function puedeVerReportesComerciales(usuario: {
  role?: string | null;
  email?: string | null;
}): boolean {
  const rol = (usuario.role || "").toLowerCase().trim();
  if (ROLES_CON_ACCESO.includes(rol)) return true;

  const correo = (usuario.email || "").toLowerCase().trim();
  return Boolean(correo) && correosAutorizados().includes(correo);
}

/**
 * Marca a la que queda fijado el usuario:
 *   - superadmin / gerencia de ventas: `null` (elige libremente entre las
 *     marcas que vende su sede, más "TODAS").
 *   - usuario de la lista de correos: siempre "EZVIZ" (no ve el selector).
 */
export function marcaFijaDe(usuario: {
  role?: string | null;
  email?: string | null;
}): string | null {
  const rol = (usuario.role || "").toLowerCase().trim();
  if (ROLES_CON_ACCESO.includes(rol)) return null;
  return "EZVIZ";
}

/**
 * Sedes (company_id) que el usuario puede consultar en el reporte:
 *   - superadmin: todas
 *   - gerencia de ventas / correo en la lista: solo su propia sede (`cids`)
 *   - cualquier otro: ninguna
 */
export function sedesPermitidas(usuario: {
  role?: string | null;
  email?: string | null;
  cids?: number | string | null;
}): number[] {
  const rol = (usuario.role || "").toLowerCase().trim();
  if (rol === "superadmin") return [...COMPANY_IDS_REPORTE];

  if (!puedeVerReportesComerciales(usuario)) return [];

  const cid = Number(usuario.cids);
  return COMPANY_IDS_REPORTE.includes(cid) ? [cid] : [];
}

/**
 * Resuelve la sede que atiende una petición: la de `?sede=` si el usuario tiene
 * acceso a ella, si no la primera permitida. `null` si no tiene ninguna.
 */
export function resolverSede(
  usuario: { role?: string | null; email?: string | null; cids?: number | string | null },
  sedeParam: string | null,
): number | null {
  const permitidas = sedesPermitidas(usuario);
  if (permitidas.length === 0) return null;
  const pedida = sedeParam ? Number(sedeParam) : NaN;
  return permitidas.includes(pedida) ? pedida : permitidas[0];
}
