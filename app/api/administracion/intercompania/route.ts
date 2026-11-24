import { NextRequest, NextResponse } from "next/server";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { pagosEntreSedes } from "@/lib/administracion/pagosIntercompania";

// GET /api/administracion/intercompania?empresa=&mes=YYYY-MM|todos
// Pagos entre sedes con las facturas a las que se aplicaron y su equivalente
// en la otra sede. Administracion ve los pagos en que su sede paga o cobra.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request, auth.payload);
    if (!f) return respuestaSedeNoPermitida();
    const todos = new URL(request.url).searchParams.get("mes") === "todos";
    const pagos = await pagosEntreSedes(f.companyIds, todos ? null : f.desde, todos ? null : f.hasta);
    return NextResponse.json({
      success: true,
      empresa: f.empresa || "todas",
      mes: todos ? "todos" : f.mes,
      pagos,
    });
  } catch (error) {
    return respuestaDeError(error, "pagos entre sedes");
  }
}
