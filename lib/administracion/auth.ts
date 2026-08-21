import { jwtVerify } from "jose";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export interface AdminAuthUser {
  role: string;
  cids: number;
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
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = ((payload.role as string) || "").toLowerCase().trim();
    return { role, cids: Number(payload.cids) };
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
