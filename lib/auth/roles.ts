import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

/**
 * Guard genérico por rol para las rutas de API.
 *
 * El `matcher` del middleware excluye /api, así que ninguna ruta de API está
 * protegida por defecto: cada una tiene que pedir su guard explícitamente.
 * Esto vive en un solo lugar porque la vez que estuvo copiado en 15 archivos
 * se olvidó en uno (`/api/seguridad/almacenistas`, que quedó devolviendo
 * nombres de empleados a cualquiera).
 *
 * Los roles se comparan en minúsculas y sin espacios, igual que en
 * `middleware.ts`, porque los strings de `UserRole` tienen casing
 * inconsistente. `superadmin` entra siempre.
 */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function requireRoles(
  request: NextRequest,
  roles: string[],
): Promise<{ payload?: any; error?: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  let payload: any;
  try {
    const result = await jwtVerify(token, JWT_SECRET);
    payload = result.payload;
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }

  const userRole = ((payload.role as string) || "").toLowerCase().trim();
  const permitidos = roles.map((r) => r.toLowerCase().trim());
  if (userRole !== "superadmin" && !permitidos.includes(userRole)) {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return { payload };
}
