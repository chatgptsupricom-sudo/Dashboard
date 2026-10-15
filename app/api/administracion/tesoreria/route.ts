import { NextRequest, NextResponse } from "next/server";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchTesoreriaAdmin } from "@/lib/administracion/tesoreria";

// GET /api/administracion/tesoreria?empresa=&mes=YYYY-MM
// Solo lectura. Saldos y conciliacion son los de hoy; `mes` define las
// entradas y salidas del mes.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request, auth.payload);
    if (!f) return respuestaSedeNoPermitida();
    const datos = await fetchTesoreriaAdmin(f.companyIds, f.hoy, f.desde, f.hasta);
    return NextResponse.json({ success: true, empresa: f.empresa || "todas", mes: f.mes, hoy: f.hoy, ...datos });
  } catch (error) {
    return respuestaDeError(error, "tesoreria (administracion)");
  }
}
