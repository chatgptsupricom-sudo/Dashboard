import { NextRequest, NextResponse } from "next/server";
import { partnersIntercompania } from "@/lib/intercompania";
import { leerConfig } from "@/lib/sorteo/configuracion";
import { datosPublicos, datosSorteo } from "@/lib/sorteo/participantes";
import { limitarVisitante, operador } from "@/lib/sorteo/operador";
import { ganadoresSeguros, respuestaError } from "@/lib/sorteo/respuestas";

export const maxDuration = 60;

/**
 * Sorteo PÚBLICO (sin sesión; lo consume la landing sorteo-landing): el
 * sorteo activo (título, sede, mes, monto por ticket), los participantes
 * ANÓNIMOS (solo id + tickets: lib/sorteo/participantes#datosPublicos) y los
 * ganadores oficiales.
 *
 * Solo el sorteo activo (lib/sorteo/configuracion): no se puede pedir otra
 * sede ni otro mes.
 *
 * GET ?refrescar=1 relee Odoo, solo para el operador (lib/sorteo/operador).
 */
export async function GET(request: NextRequest) {
  const limite = limitarVisitante(request, "sorteo-publico", [{ max: 60, ventanaSegundos: 60 }]);
  if (limite) return limite;

  let refrescar = false;
  if (request.nextUrl.searchParams.get("refrescar") === "1") {
    const op = await operador(request);
    if (op.error) return op.error;
    refrescar = true;
  }

  try {
    if (refrescar) await partnersIntercompania(true);
    const config = await leerConfig();
    const [datos, ganadores] = await Promise.all([datosSorteo(config, refrescar), ganadoresSeguros(config.companyId, config.mes)]);
    return NextResponse.json({ success: true, data: { ...datosPublicos(datos, config), ...ganadores } });
  } catch (error: any) {
    return respuestaError(error, "sorteo GET");
  }
}
