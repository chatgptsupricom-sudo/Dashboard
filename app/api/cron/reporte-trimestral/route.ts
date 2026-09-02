import { NextResponse } from "next/server";
import {
  formatTrimestre,
  trimestreActual,
  trimestreAnterior,
} from "@/lib/reportes-comerciales/trimestres";
import { generarYGuardarTrimestre } from "@/lib/reportes-comerciales/snapshot";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cierre automático del Reporte de Ventas Trimestral (Panamá).
 *
 * Lo dispara `server.js` el día 5 del trimestre siguiente a las 06:00
 * (America/Caracas), o sea que genera el trimestre que acaba de cerrar.
 * Guarda el .xlsx en `reporte_trimestral_snapshots` y, si está configurado
 * `N8N_REPORTE_TRIMESTRAL_WEBHOOK_URL`, hace POST a n8n con el archivo en
 * base64 + un link de descarga, para el envío automático.
 *
 * Params:
 *   ?trimestre=2026-Q3   (opcional; por defecto, el trimestre anterior al actual)
 *   ?marca=EZVIZ         (opcional; por defecto REPORTES_COMERCIALES_MARCAS_CRON o "EZVIZ")
 *   ?dry=1               calcula y guarda pero NO llama a n8n
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-reporte-trimestral] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const dry = searchParams.get("dry") === "1";
  const trimestre =
    searchParams.get("trimestre") || formatTrimestre(trimestreAnterior(trimestreActual()));
  const marcasParam = searchParams.get("marca");
  const marcas = (
    marcasParam ||
    process.env.REPORTES_COMERCIALES_MARCAS_CRON ||
    "EZVIZ"
  )
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean);

  // Para el link de descarga: la URL pública del panel si está configurada,
  // si no el origin de la petición (localhost cuando lo llama server.js).
  const base = (
    process.env.APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
  const resultados: any[] = [];

  for (const marca of marcas) {
    try {
      const { reporte, epp, archivoNombre, buffer } = await generarYGuardarTrimestre({
        trimestre,
        marca,
        generadoPor: "cron",
      });

      const descargaUrl = `${base}/api/reportes-comerciales/trimestral/archivo?trimestre=${encodeURIComponent(trimestre)}&marca=${encodeURIComponent(marca)}`;

      const totMetaTrim = epp.reduce((s, c) => s + c.metaTrimestre, 0);
      const totReal = epp.reduce((s, c) => s + c.realTrimestre, 0);

      const webhookPayload = {
        evento: "reporte_trimestral_generado",
        origen: "reportes-comerciales",
        trimestre,
        marca,
        generado_en: new Date().toISOString(),
        archivo_nombre: archivoNombre,
        descarga_url: descargaUrl,
        // El archivo va embebido para que n8n lo adjunte sin autenticarse.
        archivo_b64: buffer.toString("base64"),
        totales: reporte.totales,
        cumplimiento_epp: {
          meta_trimestre: Math.round(totMetaTrim),
          real: Math.round(totReal),
          pct: totMetaTrim ? Math.round((totReal / totMetaTrim) * 1000) / 10 : null,
        },
      };

      let webhook: string;
      if (dry) {
        webhook = "dry-run (no se llamó a n8n)";
      } else if (process.env.N8N_REPORTE_TRIMESTRAL_WEBHOOK_URL) {
        try {
          const resp = await fetch(process.env.N8N_REPORTE_TRIMESTRAL_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(webhookPayload),
          });
          webhook = `n8n -> ${resp.status}`;
        } catch (e: any) {
          webhook = `n8n error: ${e?.message || e}`;
          console.error("[cron-reporte-trimestral] n8n webhook:", e?.message);
        }
      } else {
        webhook = "N8N_REPORTE_TRIMESTRAL_WEBHOOK_URL no configurado";
      }

      resultados.push({
        marca,
        trimestre,
        archivo: archivoNombre,
        bytes: buffer.byteLength,
        total_venta: reporte.totales.venta,
        webhook,
      });
      console.log(
        `[cron-reporte-trimestral] ${marca} ${trimestre}: ${archivoNombre} (${buffer.byteLength} bytes) — ${webhook}`,
      );
    } catch (e: any) {
      console.error(`[cron-reporte-trimestral] ${marca} ${trimestre}:`, e);
      resultados.push({ marca, trimestre, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({ trimestre, dry, resultados });
}
