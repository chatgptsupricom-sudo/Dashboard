import { NextRequest, NextResponse } from "next/server";
import { leerConfig } from "@/lib/sorteo/configuracion";
import { sortear } from "@/lib/sorteo/ganadores";
import { operador } from "@/lib/sorteo/operador";
import { respuestaError } from "@/lib/sorteo/respuestas";

/**
 * POST (operador): saca un ganador del sorteo activo. Lo elige el servidor
 * con crypto.randomInt entre todos los tickets de los clientes que todavía no
 * ganaron, lo guarda en sorteo_ganadores y lo devuelve; las pantallas solo
 * animan la ruleta hasta él.
 */
export async function POST(request: NextRequest) {
  const op = await operador(request);
  if (op.error) return op.error;
  try {
    const ganador = await sortear(await leerConfig(), op.quien);
    return NextResponse.json({ success: true, data: ganador });
  } catch (error: any) {
    return respuestaError(error, "sorteo girar");
  }
}
