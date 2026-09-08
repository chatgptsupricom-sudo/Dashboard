import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import {
  marcaFijaDe,
  puedeVerReportesComerciales,
  resolverSede,
} from "@/lib/reportes-comerciales/acceso";
import {
  MARCA_TODAS,
  marcasDeSede,
} from "@/lib/reportes-comerciales/reporteTrimestral";
import { marcaPorDefectoSede } from "@/lib/reportes-comerciales/sedes";

export const runtime = "nodejs";
export const maxDuration = 60;

const JWT_SECRET = jwtSecretBytes();

/**
 * Marcas para poblar el selector del reporte, acotadas a la sede: las que esa
 * compañía ha facturado en los últimos ~24 meses, más "TODAS". Endpoint propio
 * (y cacheado en `marcasDeSede`) para que el selector no dependa de que termine
 * la consulta pesada del reporte.
 *
 *   { marcas: ["TODAS", ...], marcaFija: string | null, marcaPorDefecto: string }
 */
export async function GET(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const usuario = {
      role: payload.role as string,
      email: payload.email as string,
      cids: payload.cids as number,
    };
    if (!puedeVerReportesComerciales(usuario)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }
    const companyId = resolverSede(
      usuario,
      new URL(request.url).searchParams.get("sede"),
    );
    if (companyId == null) {
      return NextResponse.json({ error: "Sin sede asignada" }, { status: 403 });
    }

    const marcaFija = marcaFijaDe(usuario);
    // La lista de correos solo ve su marca; el resto ve las de la sede + TODAS.
    const marcas = marcaFija
      ? [marcaFija]
      : [MARCA_TODAS, ...(await marcasDeSede(companyId))];

    return NextResponse.json({
      marcas,
      marcaFija,
      marcaPorDefecto: marcaFija || marcaPorDefectoSede(companyId),
    });
  } catch (error: any) {
    console.error("Error listando marcas de la sede:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
