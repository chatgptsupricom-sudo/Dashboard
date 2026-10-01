import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

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
const JWT_SECRET = jwtSecretBytes();

async function verificarSesion(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  const token = request.cookies.get("token")?.value;
  if (!token) {
    return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  }

  try {
    const result = await jwtVerify(token, JWT_SECRET);
    return { payload: result.payload };
  } catch {
    return { error: NextResponse.json({ error: "Token invalido" }, { status: 401 }) };
  }
}

export async function requireRoles(
  request: NextRequest,
  roles: string[],
): Promise<{ payload?: any; error?: NextResponse }> {
  const sesion = await verificarSesion(request);
  if (sesion.error) return sesion;

  const userRole = ((sesion.payload!.role as string) || "").toLowerCase().trim();
  const permitidos = roles.map((r) => r.toLowerCase().trim());
  if (userRole !== "superadmin" && !permitidos.includes(userRole)) {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return sesion;
}

/**
 * Exige solo una sesion valida, sin restringir por rol.
 *
 * Para endpoints que de verdad usan varios roles distintos (ej. la pagina
 * generica de "Mis actividades" que ve casi cualquiera) enumerar los roles
 * uno por uno es fragil: los strings reales en la tabla `roles` no siempre
 * coinciden con el enum UserRole (el login acepta indistintamente
 * "vendedor" y "seller" para el mismo rol — ver app/api/auth/login/route.ts
 * — y hay mas casos de casing/alias parecidos). Enumerar `Object.values
 * (UserRole)` como sustituto de "cualquiera" deja afuera a quien tenga el
 * alias que el enum no contempla.
 */
export async function requireSession(
  request: NextRequest,
): Promise<{ payload?: any; error?: NextResponse }> {
  return verificarSesion(request);
}
