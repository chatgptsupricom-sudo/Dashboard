import { NextResponse } from "next/server";
import { registrarHistorialCredito } from "@/lib/cxc/historialCredito";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/historial-credito: foto del crédito de cada cliente de las
 * tres sedes y cambios de cupo / excesos desde la anterior
 * (lib/cxc/historialCredito.ts). Lo llama server.js cada hora con
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-historial-credito] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  return NextResponse.json({ success: true, resultado: await registrarHistorialCredito() });
}
