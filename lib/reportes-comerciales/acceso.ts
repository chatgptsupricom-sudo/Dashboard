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
