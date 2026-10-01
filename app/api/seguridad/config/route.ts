import { requireRmaOSeguridad } from "@/lib/seguridad/auth";
import { tecnicoDeOsc } from "@/lib/seguridad/firmas";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/seguridad/config
 *
 * Datos del modulo que no viven en el codigo. Hoy solo el tecnico que firma
 * como OSC: es siempre Manuel Garcia, pero escribirlo en el codigo obligaria
 * a tocar y desplegar el dia que cambie el tecnico.
 *
 * Solo lectura. Cambiar el valor es un UPDATE en `seguridad_config`, que hoy
 * hace quien administra la base; si mas adelante hace falta una pantalla, se
 * agrega el PUT aqui.
 *
 * RMA tambien lo consume: es el nombre sugerido del tecnico de OSC que
 * muestra el acta de ingreso de solo lectura.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireRmaOSeguridad(request);
    if (auth.error) return auth.error;

    return NextResponse.json({ success: true, tecnico: await tecnicoDeOsc() });
  } catch (error: any) {
    console.error("Error leyendo config de seguridad:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
