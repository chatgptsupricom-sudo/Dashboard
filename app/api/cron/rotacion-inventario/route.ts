import { NextResponse } from "next/server";
import { datosSede, sincronizar } from "@/lib/rotacion-inventario/datos";
import { SEDES_ROTACION } from "@/lib/rotacion-inventario/tipos";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/rotacion-inventario — todos los días (server.js, 6:30
 * Caracas): abre y cierra los planes de 90 días y arma las solicitudes "por
 * enviar" de lo que pasó a rojo en las tres sedes, aunque nadie abra la
 * pantalla (lib/rotacion-inventario/datos.ts). Con
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-rotacion-inventario] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  const resultado: Record<number, string> = {};
  for (const { id } of SEDES_ROTACION) {
    try {
      const d = await datosSede(id);
      await sincronizar(id, d);
      const rojos = [...d.fichas.values()].filter((f) => f.color === "rojo").length;
      resultado[id] = `${d.fichas.size} productos, ${rojos} en rojo`;
    } catch (e: any) {
      console.error(`[cron-rotacion-inventario] sede ${id}:`, e?.message);
      resultado[id] = `error: ${e?.message}`;
    }
  }
  return NextResponse.json({ success: true, resultado });
}
