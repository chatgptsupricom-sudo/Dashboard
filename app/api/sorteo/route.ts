import { NextRequest, NextResponse } from "next/server";
import { partnersIntercompania } from "@/lib/intercompania";
import { SORTEO } from "@/lib/sorteo/config";
import { datosPublicos, datosSorteo } from "@/lib/sorteo/participantes";
import { limitarVisitante, operador } from "@/lib/sorteo/operador";
import { ganadoresSeguros, respuestaError } from "@/lib/sorteo/respuestas";

export const maxDuration = 60;

/**
 * Sorteo PÚBLICO (sin sesión, página /[locale]/sorteo): clientes de Caracas
 * con compras del mes del sorteo, con nombre, compras, monto y tickets (sin
 * RIF ni facturas: lib/sorteo/participantes#datosPublicos), y los ganadores
 * oficiales.
 *
 * Solo el mes del sorteo (SORTEO.mesDefault): no se puede pedir otro mes, o
 * cualquiera podría leer las compras de los clientes mes por mes.
 *
 * GET ?refrescar=1 relee Odoo, solo para el operador (lib/sorteo/operador).
 */
export async function GET(request: NextRequest) {
  const limite = limitarVisitante(request, "sorteo-publico", [{ max: 60, ventanaSegundos: 60 }]);
  if (limite) return limite;

  const mes = SORTEO.mesDefault;
  let refrescar = false;
  if (request.nextUrl.searchParams.get("refrescar") === "1") {
    const op = await operador(request);
    if (op.error) return op.error;
    refrescar = true;
  }

  try {
    if (refrescar) await partnersIntercompania(true);
    const [datos, ganadores] = await Promise.all([datosSorteo(mes, refrescar), ganadoresSeguros(mes)]);
    return NextResponse.json({ success: true, data: { datos: datosPublicos(datos), ...ganadores } });
  } catch (error: any) {
    return respuestaError(error, "sorteo GET");
  }
}
