import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { puedeVerReportesComerciales } from "@/lib/reportes-comerciales/acceso";

export const runtime = "nodejs";

const JWT_SECRET = jwtSecretBytes();

/**
 * ¿El usuario de la sesión puede ver la sección "Reportes Comerciales"?
 * Lo consulta el sidebar para no depender de una env NEXT_PUBLIC_ incrustada
 * en el bundle del cliente (cambiar la lista de correos requeriría rebuild).
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ puede: false });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return NextResponse.json({
      puede: puedeVerReportesComerciales({
        role: payload.role as string,
        email: payload.email as string,
      }),
    });
  } catch {
    return NextResponse.json({ puede: false });
  }
}
