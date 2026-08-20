import { jwtVerify } from "jose";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export interface AuthUser {
  role: string;
  cids: number;
}

// Mismos roles que el middleware deja ver las páginas de Plan de Contenido
// (superadmin, adminleads, gerente de operaciones, diseñador).
export async function getAuthUser(request: NextRequest): Promise<AuthUser | null> {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return null;
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = ((payload.role as string) || "").toLowerCase().trim();
    const cids = Number(payload.cids);
    return { role, cids };
  } catch {
    return null;
  }
}

export function canViewCustomPlan(user: AuthUser | null): boolean {
  if (!user) return false;
  return (
    user.role === "superadmin" ||
    user.role === "adminleads" ||
    user.role === "gerente de operaciones" ||
    user.role === "diseñador"
  );
}

// Solo quien tiene el botón "Actualizar HTML" en la UI (superadmin o
// adminleads de Valencia) puede sobrescribir el contenido compartido.
export function canUploadCustomPlan(user: AuthUser | null): boolean {
  if (!user) return false;
  return user.role === "superadmin" || (user.role === "adminleads" && user.cids === 9);
}
