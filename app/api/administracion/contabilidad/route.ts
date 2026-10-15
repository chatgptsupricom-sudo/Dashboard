import { NextRequest, NextResponse } from "next/server";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchContabilidad } from "@/lib/administracion/contabilidad";

// GET /api/administracion/contabilidad?empresa=&mes=YYYY-MM
// Solo lectura: estado de resultados, balance al cierre del mes y checklist de cierre.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request);
    const datos = await fetchContabilidad(f.companyIds, f.hoy, f.mes, f.desde, f.hasta);
    return NextResponse.json({ success: true, empresa: f.empresa || "todas", mes: f.mes, hoy: f.hoy, ...datos });
  } catch (error) {
    return respuestaDeError(error, "contabilidad (administracion)");
  }
}
