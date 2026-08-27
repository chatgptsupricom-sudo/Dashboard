import { jwtVerify } from "jose";
import { NextRequest } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


export interface AdminAuthUser {
  role: string;
  cids: number;
  /** Para dejar rastro de quien actualiza el seguimiento de una alerta. */
  nombre: string;
  email: string;
}

// El rol nuevo se define en el issue #7 (lib/types.ts + tabla roles). Aqui se
// acepta cualquiera de las variantes razonables para no acoplar este trabajo a
// la cadena exacta que termine usando ese issue; cuando #7 este mergeado se
// puede reducir a la definitiva sin tocar los endpoints.
const ADMIN_ROLES = new Set([
  "administracion",
  "administración",
  "administracion y finanzas",
  "administración y finanzas",
]);

export async function getAdminUser(
  request: NextRequest,
): Promise<AdminAuthUser | null> {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, jwtSecretBytes());
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
