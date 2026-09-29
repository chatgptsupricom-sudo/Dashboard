import { NextResponse } from "next/server";
import { OdooUnreachableError } from "@/lib/odoo";
import { listarGanadores, SinParticipantesError, type Ganador } from "@/lib/sorteo/ganadores";

/** Ganadores, o lista vacía + aviso si la tabla todavía no existe (falta correr sql/sorteo_ganadores.sql). */
export async function ganadoresSeguros(mes: string): Promise<{ ganadores: Ganador[]; ganadoresError: string | null }> {
  try {
    return { ganadores: await listarGanadores(mes), ganadoresError: null };
  } catch (e: any) {
    console.error("Error leyendo sorteo_ganadores:", e?.message);
    return {
      ganadores: [],
      ganadoresError: e?.code === "ER_NO_SUCH_TABLE" ? "Falta crear la tabla sorteo_ganadores (sql/sorteo_ganadores.sql)" : "No se pudieron leer los ganadores",
    };
  }
}

export function respuestaError(error: any, contexto: string) {
  if (error instanceof SinParticipantesError) return NextResponse.json({ error: error.message }, { status: 409 });
  console.error(`Error en ${contexto}:`, error?.message);
  const status = error instanceof OdooUnreachableError ? 503 : 500;
  return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
}
