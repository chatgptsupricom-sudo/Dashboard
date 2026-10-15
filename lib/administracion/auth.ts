import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { ROLES_ADMINISTRACION, limitarSedesPorRol } from "@/lib/auth/sedeRol";

const JWT_SECRET = jwtSecretBytes();

export interface AdminAuthUser {
  role: string;
  cids: number;
  /** Para dejar rastro de quien actualiza el seguimiento de una alerta. */
  nombre: string;
  email: string;
}

// Los nombres del rol viven en lib/auth/sedeRol.ts, junto con la regla de que
// Administracion solo lee la sede de su `cids`.
const ADMIN_ROLES = new Set(ROLES_ADMINISTRACION);

export { ROLES_ADMINISTRACION };

/**
 * Sedes que este usuario puede leer de las pedidas (`limitarSedesPorRol`).
 * Vacio = ninguna: responder `respuestaSedeNoPermitida()`.
 */
export function sedesDelUsuario(user: AdminAuthUser | null, companyIds: number[]): number[] {
  return limitarSedesPorRol(user ? { role: user.role, cids: user.cids } : null, companyIds);
}

export async function getAdminUser(
  request: NextRequest,
): Promise<AdminAuthUser | null> {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = ((payload.role as string) || "").toLowerCase().trim();
    return {
      role,
      cids: Number(payload.cids),
      nombre: (payload.name as string) || "",
      email: (payload.email as string) || "",
    };
  } catch {
    return null;
  }
}

export function canViewAdministracion(user: AdminAuthUser | null): boolean {
  if (!user) return false;
  return user.role === "superadmin" || ADMIN_ROLES.has(user.role);
}

// El presupuesto define contra que se mide a todo el departamento, asi que
// escribirlo se restringe igual que verlo (no hay un rol de "solo lectura"
// separado todavia; si aparece, se acota aqui).
export function canEditPresupuesto(user: AdminAuthUser | null): boolean {
  return canViewAdministracion(user);
}

// El seguimiento de alertas (fecha compromiso y estatus) es la parte del
// indice donde Administracion se compromete con una accion, asi que se
// restringe igual que el resto del area.
export function canEditAlertas(user: AdminAuthUser | null): boolean {
  return canViewAdministracion(user);
}
