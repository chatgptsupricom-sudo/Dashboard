import { NextRequest, NextResponse } from "next/server";
import { SORTEO } from "@/lib/sorteo/config";
import { sortear } from "@/lib/sorteo/ganadores";
import { operador } from "@/lib/sorteo/operador";
import { respuestaError } from "@/lib/sorteo/respuestas";

/**
 * POST (operador): saca un ganador. Lo elige el servidor con
 * crypto.randomInt entre todos los tickets de los clientes que todavía no
 * ganaron, lo guarda en sorteo_ganadores y lo devuelve; la pantalla solo
 * anima la ruleta hasta él.
 */
export async function POST(request: NextRequest) {
  const op = await operador(request);
  if (op.error) return op.error;
  try {
    const ganador = await sortear(SORTEO.mesDefault, op.quien);
    return NextResponse.json({ success: true, data: ganador });
  } catch (error: any) {
    return respuestaError(error, "sorteo girar");
  }
}
