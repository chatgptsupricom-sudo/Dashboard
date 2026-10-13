import { NextResponse } from "next/server";
import { enviarAlertasPlazos, type ModoAviso } from "@/lib/rma/alertasCorreo";

export const dynamic = "force-dynamic";

/** Dominio público del panel; también sirve el portal del cliente (/servicio-tecnico). */
const PANEL_PUBLICO = "https://panel.supricom.com.ve";

/**
 * GET /api/cron/alertas-plazos-rma: avisos por correo de los plazos del
 * taller de RMA (lib/rma/alertasCorreo.ts). Lo llama server.js con
 * `Authorization: Bearer $CRON_SECRET`.
 *
 *   ?modo=avisos     lo que venció y todavía no se avisó (cliente, RMA de la
 *                    sede, Super Admin); cada hora L-V 8:00-18:00
 *   ?modo=resumen    lo vencido y por vencer de cada sede, a su RMA; L-V 8:00
 *   ?dry=1           arma los correos y los devuelve sin mandarlos ni anotarlos
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-plazos-rma] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const modo: ModoAviso = params.get("modo") === "resumen" ? "resumen" : "avisos";
  const dry = params.get("dry") === "1";
  // Para los enlaces del correo: la URL pública del panel si está configurada.
  // Si no, NO el origin de la petición: la llama server.js por localhost, y la
  // plantilla de n8n descarta los enlaces que no son de supricom.com.ve (el
  // correo saldría sin "Ver mi caso" ni "Abrir el caso").
  const base = process.env.APP_PUBLIC_URL || process.env.NEXT_PUBLIC_APP_URL || PANEL_PUBLICO;

  try {
    const r = await enviarAlertasPlazos({ modo, base, dry });
    console.log(`[cron-plazos-rma] ${modo}: ${r.enviados}/${r.correos} correos`, r.motivo || "");
    return NextResponse.json({ success: true, modo, dry_run: dry, ...r });
  } catch (error: any) {
    console.error("[cron-plazos-rma] error:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}
