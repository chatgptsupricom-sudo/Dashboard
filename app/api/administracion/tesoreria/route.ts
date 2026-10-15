import { NextRequest, NextResponse } from "next/server";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchTesoreriaAdmin } from "@/lib/administracion/tesoreria";

// GET /api/administracion/tesoreria?empresa=&mes=YYYY-MM
// Solo lectura. Saldos y conciliacion son los de hoy; `mes` define las
// entradas y salidas del mes.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request);
    const datos = await fetchTesoreriaAdmin(f.companyIds, f.hoy, f.desde, f.hasta);
    return NextResponse.json({ success: true, empresa: f.empresa || "todas", mes: f.mes, hoy: f.hoy, ...datos });
  } catch (error) {
    return respuestaDeError(error, "tesoreria (administracion)");
  }
}
