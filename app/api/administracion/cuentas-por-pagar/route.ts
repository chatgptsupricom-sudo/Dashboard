import { NextRequest, NextResponse } from "next/server";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchCxPAdmin } from "@/lib/administracion/cxp";

// GET /api/administracion/cuentas-por-pagar?empresa=&mes=YYYY-MM
//   &sin_intercompania=1 deja fuera a las otras empresas del grupo.
// Solo lectura. `mes` solo afecta "pagado en el mes"; el saldo es el de hoy.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request, auth.payload);
    if (!f) return respuestaSedeNoPermitida();
    const sinIntercompania = new URL(request.url).searchParams.get("sin_intercompania") === "1";
    const datos = await fetchCxPAdmin(f.companyIds, f.hoy, f.desde, f.hasta, sinIntercompania);
    return NextResponse.json({ success: true, empresa: f.empresa || "todas", mes: f.mes, hoy: f.hoy, ...datos });
  } catch (error) {
    return respuestaDeError(error, "cuentas por pagar (administracion)");
  }
}
