import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { partnersIntercompania } from "@/lib/intercompania";
import { SORTEO } from "@/lib/sorteo/config";
import { datosSorteo } from "@/lib/sorteo/participantes";
import { ganadoresSeguros, respuestaError } from "@/lib/sorteo/respuestas";

export const maxDuration = 60;

/**
 * Sorteo de clientes de Caracas, vista del SuperAdmin: lo mismo que la
 * página pública (/api/sorteo) más el RIF y el detalle de facturas de cada
 * cliente. Cálculo en lib/sorteo/participantes.ts.
 *
 * GET ?refrescar=1 relee Odoo.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const mes = SORTEO.mesDefault;
  const refrescar = request.nextUrl.searchParams.get("refrescar") === "1";

  try {
    if (refrescar) await partnersIntercompania(true);
    const [datos, ganadores] = await Promise.all([datosSorteo(mes, refrescar), ganadoresSeguros(mes)]);
    return NextResponse.json({ success: true, data: { datos, ...ganadores } });
  } catch (error: any) {
    return respuestaError(error, "superadmin sorteo GET");
  }
}
