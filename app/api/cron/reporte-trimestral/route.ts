import { NextResponse } from "next/server";
import {
  formatTrimestre,
  trimestreActual,
  trimestreAnterior,
} from "@/lib/reportes-comerciales/trimestres";
import { generarYGuardarTrimestre } from "@/lib/reportes-comerciales/snapshot";
import { COMPANY_ID_PANAMA } from "@/lib/reportes-comerciales/reporteTrimestral";
import { nombreSede } from "@/lib/reportes-comerciales/sedes";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Cierre automático del Reporte de Ventas Trimestral.
 *
 * Lo dispara `server.js` el día 5 del trimestre siguiente a las 06:00
 * (America/Caracas), o sea que genera el trimestre que acaba de cerrar.
 * Guarda el .xlsx en `reporte_trimestral_snapshots` y, si está configurado
 * `N8N_REPORTE_TRIMESTRAL_WEBHOOK_URL`, hace POST a n8n con el archivo en
 * base64 + un link de descarga, para el envío automático.
 *
 * Qué sedes/marcas genera: env `REPORTES_COMERCIALES_CRON` = pares
 * `sede:marca` separados por coma, ej. `7:EZVIZ,9:EZVIZ,10:EZVIZ`.
 * Por defecto `7:EZVIZ` (Panamá). Se puede pisar con `?sede=` y `?marca=`.
 *
 * Params:
 *   ?trimestre=2026-Q3   (opcional; por defecto, el trimestre anterior al actual)
 *   ?sede=9&marca=EZVIZ  (opcional; pisa la config de env)
 *   ?dry=1               calcula y guarda pero NO llama a n8n
 */
function paresSedeMarca(searchParams: URLSearchParams): { companyId: number; marca: string }[] {
  const sedeParam = searchParams.get("sede");
  const marcaParam = searchParams.get("marca");
  if (sedeParam || marcaParam) {
    return [{ companyId: Number(sedeParam) || COMPANY_ID_PANAMA, marca: (marcaParam || "EZVIZ").toUpperCase() }];
  }
  const cfg = (process.env.REPORTES_COMERCIALES_CRON || "").trim();
  if (cfg) {
    return cfg
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const [s, m] = p.split(":");
        return { companyId: Number(s) || COMPANY_ID_PANAMA, marca: (m || "EZVIZ").trim().toUpperCase() };
      });
  }
  // compatibilidad: lista de marcas para Panamá
  const marcas = (process.env.REPORTES_COMERCIALES_MARCAS_CRON || "EZVIZ")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean);
  return marcas.map((marca) => ({ companyId: COMPANY_ID_PANAMA, marca }));
}

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
  const pares = paresSedeMarca(searchParams);

  // Para el link de descarga: la URL pública del panel si está configurada,
  // si no el origin de la petición (localhost cuando lo llama server.js).
  const base = (
    process.env.APP_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin
  ).replace(/\/$/, "");
  const resultados: any[] = [];

  for (const { companyId, marca } of pares) {
    try {
      const { reporte, epp, archivoNombre, buffer } = await generarYGuardarTrimestre({
        trimestre,
        marca,
        companyId,
        generadoPor: "cron",
      });

      const descargaUrl = `${base}/api/reportes-comerciales/trimestral/archivo?trimestre=${encodeURIComponent(trimestre)}&marca=${encodeURIComponent(marca)}&sede=${companyId}`;

      const totMetaTrim = epp.reduce((s, c) => s + c.metaTrimestre, 0);
      const totReal = epp.reduce((s, c) => s + c.realTrimestre, 0);

      const webhookPayload = {
        evento: "reporte_trimestral_generado",
        origen: "reportes-comerciales",
        trimestre,
        sede: nombreSede(companyId),
        companyId,
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
        sede: nombreSede(companyId),
        marca,
        trimestre,
        archivo: archivoNombre,
        bytes: buffer.byteLength,
        total_venta: reporte.totales.venta,
        webhook,
      });
      console.log(
        `[cron-reporte-trimestral] ${nombreSede(companyId)} ${marca} ${trimestre}: ${archivoNombre} (${buffer.byteLength} bytes) — ${webhook}`,
      );
    } catch (e: any) {
      console.error(`[cron-reporte-trimestral] sede ${companyId} ${marca} ${trimestre}:`, e);
      resultados.push({ sede: nombreSede(companyId), marca, trimestre, error: e?.message || String(e) });
    }
  }

  return NextResponse.json({ trimestre, dry, resultados });
}
