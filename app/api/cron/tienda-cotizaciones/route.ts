import { NextResponse } from "next/server";
import { revisarCotizaciones } from "@/lib/tienda-web/clientes/seguimiento";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tienda-cotizaciones: revisa en Odoo las cotizaciones enviadas desde la tienda web y le avisa al
 * cliente lo que avanzó (lib/tienda-web/clientes/seguimiento.ts). Lo llama server.js cada 10 min con
 * `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-tienda-cotizaciones] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  return NextResponse.json({ success: true, resultado: await revisarCotizaciones() });
}
