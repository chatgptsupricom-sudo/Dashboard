import { NextResponse } from "next/server";
import { reintentarPendientes } from "@/lib/tienda-web/clientes/sincronizarOdoo";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/tienda-perfiles-odoo: vuelve a pasar a Odoo los perfiles de «Mi cuenta» de la tienda web que
 * quedaron con error o sin sincronizar (lib/tienda-web/clientes/sincronizarOdoo.ts). Lo llama server.js cada hora
 * con `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-tienda-perfiles-odoo] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }
  return NextResponse.json({ success: true, resultado: await reintentarPendientes() });
}
