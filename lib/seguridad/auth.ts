import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

/**
 * Guard de las rutas de API del rol Seguridad.
 *
 * Vive acá y no copiado en cada ruta por una razón concreta: estaba duplicado
 * idéntico en 14 archivos y en el quince —/api/seguridad/almacenistas— se
 * olvidó, así que ese endpoint devolvía nombres de empleados y sus
 * calificaciones a cualquiera sin pedir sesión.
 *
 * Con `matcher` excluyendo /api, el middleware NO protege estas rutas: cada
 * una tiene que llamar a esto explícitamente. Si agregas un endpoint bajo
 * /api/seguridad, empieza por aquí.
 *
 * La verificación en sí está en `lib/auth/roles.ts`, que es la misma que usan
 * las rutas de otros roles (superadmin sigue entrando siempre).
 */
export async function requireSeguridad(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  return requireRoles(request, ["seguridad"]);
}
