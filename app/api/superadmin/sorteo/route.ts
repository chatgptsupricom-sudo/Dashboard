import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { partnersIntercompania } from "@/lib/intercompania";
import { leerConfig } from "@/lib/sorteo/configuracion";
import { datosSorteo } from "@/lib/sorteo/participantes";
import { ganadoresSeguros, respuestaError } from "@/lib/sorteo/respuestas";

export const maxDuration = 60;

/**
 * Sorteo de clientes, vista del SuperAdmin: el sorteo activo con todo el
 * detalle (nombre, RIF, compras, monto y facturas de cada cliente), sus
 * ganadores y la configuración. Cálculo en lib/sorteo/participantes.ts.
 *
 * GET ?refrescar=1 relee Odoo.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const refrescar = request.nextUrl.searchParams.get("refrescar") === "1";

  try {
    if (refrescar) await partnersIntercompania(true);
    const config = await leerConfig();
    const [datos, ganadores] = await Promise.all([datosSorteo(config, refrescar), ganadoresSeguros(config.companyId, config.mes)]);
    return NextResponse.json({ success: true, data: { config, datos, ...ganadores } });
  } catch (error: any) {
    return respuestaError(error, "superadmin sorteo GET");
  }
}
