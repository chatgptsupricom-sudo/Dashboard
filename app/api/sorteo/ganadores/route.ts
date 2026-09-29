import { NextResponse } from "next/server";
import { claveSorteo } from "@/lib/sorteo/config";
import { leerConfig } from "@/lib/sorteo/configuracion";
import { ganadoresSeguros } from "@/lib/sorteo/respuestas";

/**
 * Ganadores oficiales del sorteo activo (público). Las pantallas lo consultan
 * cada pocos segundos para girar la ruleta cuando el operador saca un
 * ganador. Lleva `sorteo` (sede:mes:monto): si cambia la configuración en el
 * panel, la landing recarga los participantes sin que nadie refresque la
 * página. Lectura liviana: cachés de 2,5 s (ganadores) y 5 s (configuración).
 */
export async function GET() {
  const config = await leerConfig();
  const r = await ganadoresSeguros(config.companyId, config.mes);
  return NextResponse.json({ success: true, data: { ...r, sorteo: claveSorteo(config) } }, { headers: { "Cache-Control": "no-store" } });
}
