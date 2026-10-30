import { NextResponse } from "next/server";
import { SEDES_VALIDAS } from "@/lib/auth/sedeRol";
import { guardarFoto, leerConfig, semaforoDeSede } from "@/lib/semaforo-clientes/datos";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/semaforo-clientes: foto semanal del Semáforo de clientes de
 * las tres sedes (lib/semaforo-clientes/datos.ts), para comparar semana
 * contra semana aunque nadie abra la pantalla. Lo llama server.js los lunes
 * con `Authorization: Bearer $CRON_SECRET`. Si la foto de la semana ya está,
 * no hace nada.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-semaforo-clientes] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { config } = await leerConfig();
  const resultado: Record<number, string> = {};
  for (const cid of SEDES_VALIDAS) {
    try {
      const { filas } = await semaforoDeSede(cid, config.ventanaDias, config);
      resultado[cid] = (await guardarFoto(cid, config.ventanaDias, filas)) ? `foto guardada (${filas.length} clientes)` : "ya estaba";
    } catch (e: any) {
      console.error(`[cron-semaforo-clientes] sede ${cid}:`, e?.message);
      resultado[cid] = `error: ${e?.message}`;
    }
  }
  return NextResponse.json({ success: true, resultado });
}
