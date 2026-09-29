import { NextResponse } from "next/server";
import { SORTEO } from "@/lib/sorteo/config";
import { ganadoresSeguros } from "@/lib/sorteo/respuestas";

/**
 * Ganadores oficiales del sorteo (público). La página pública lo consulta
 * cada pocos segundos para girar la ruleta en todas las pantallas cuando el
 * operador saca un ganador. Lectura liviana: caché de 2,5 s en
 * lib/sorteo/ganadores.
 */
export async function GET() {
  const r = await ganadoresSeguros(SORTEO.mesDefault);
  return NextResponse.json({ success: true, data: r }, { headers: { "Cache-Control": "no-store" } });
}
