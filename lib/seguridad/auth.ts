import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

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
 */
const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function requireSeguridad(
  request: NextRequest,
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
  if (userRole !== "seguridad" && userRole !== "superadmin") {
    return {
      error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }),
    };
  }

  return { payload };
}
