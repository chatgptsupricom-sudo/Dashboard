import { NextRequest, NextResponse } from "next/server";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchFiscal } from "@/lib/administracion/fiscal";

// GET /api/administracion/fiscal?empresa=&mes=YYYY-MM
// Solo lectura: retenciones, libros, IVA/ITBMS e IGTF del mes.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request);
    const datos = await fetchFiscal(f.companyIds, f.hoy, f.desde, f.hasta);
    return NextResponse.json({ success: true, empresa: f.empresa || "todas", mes: f.mes, hoy: f.hoy, ...datos });
  } catch (error) {
    return respuestaDeError(error, "fiscal (administracion)");
  }
}
