/**
 * Control de acceso a la seccion "Reportes Comerciales".
 *
 * La encargada del reporte es una vendedora que conserva su rol `vendedor`
 * (necesita las funciones normales de vendedor), pero NO todos los vendedores
 * deben ver esta seccion. Por eso el acceso no se puede resolver solo por rol:
 *
 *   - `superadmin` y `gerencia de ventas`: siempre.
 *   - Cualquier otro: solo si su correo esta en
 *     NEXT_PUBLIC_REPORTES_COMERCIALES_EMAILS (separado por comas).
 *
 * Se usa el prefijo NEXT_PUBLIC_ a proposito: el sidebar (cliente), el
 * middleware y las rutas de API tienen que evaluar exactamente lo mismo. Los
 * correos quedan visibles en el bundle del cliente — son correos internos de
 * trabajo, es un compromiso aceptable frente a crear una tabla y un endpoint
 * solo para esto.
 *
 * Este modulo es puro (sin imports de Node) para que el middleware lo pueda
 * importar.
 */

const ROLES_CON_ACCESO = ["superadmin", "gerencia de ventas"];

export function correosAutorizados(): string[] {
  return (process.env.NEXT_PUBLIC_REPORTES_COMERCIALES_EMAILS || "")
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
