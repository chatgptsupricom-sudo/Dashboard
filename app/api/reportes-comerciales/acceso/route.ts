import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import {
  marcaFijaDe,
  puedeVerReportesComerciales,
  sedesPermitidas,
} from "@/lib/reportes-comerciales/acceso";
import { nombreSede } from "@/lib/reportes-comerciales/sedes";

export const runtime = "nodejs";

const JWT_SECRET = jwtSecretBytes();

/**
 * ¿El usuario de la sesión puede ver la sección "Reportes Comerciales" y para
 * qué sedes? Lo consulta el sidebar y la vista para no depender de env
 * NEXT_PUBLIC_ incrustadas en el bundle del cliente.
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ puede: false, sedes: [], marcaFija: null });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const usuario = {
      role: payload.role as string,
      email: payload.email as string,
      cids: payload.cids as number,
    };
    const sedes = sedesPermitidas(usuario).map((id) => ({
      companyId: id,
      nombre: nombreSede(id),
    }));
    return NextResponse.json({
      puede: puedeVerReportesComerciales(usuario) && sedes.length > 0,
      sedes,
      marcaFija: marcaFijaDe(usuario),
    });
  } catch {
    return NextResponse.json({ puede: false, sedes: [], marcaFija: null });
  }
}
