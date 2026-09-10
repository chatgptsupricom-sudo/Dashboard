import { NextRequest, NextResponse } from "next/server";
import { callOdooRPC } from "@/lib/odoo";

/**
 * Detección de cambios en ventas para el auto-refresh de las vistas.
 *
 * `server.js` la llama cada minuto (Bearer CRON_SECRET). Si en la última
 * ventana hubo altas/ediciones de `account.move` (facturas de cliente) o
 * `sale.order` en las sedes, emite por Socket.io el evento
 * `ventas_actualizado`; los componentes suscritos (Reporte Diario, Dashboard,
 * Reporte Trimestral, Reporte de Ventas) vuelven a consultar en silencio.
 *
 * Es una sola consulta liviana (`search_count`) por minuto, sin importar
 * cuántas pestañas haya abiertas.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COMPANY_IDS = [9, 10, 7];
// Ventana: intervalo (60s) + margen para latencia y desfases de reloj.
const VENTANA_MS = 95_000;

/** `Date` -> "YYYY-MM-DD HH:MM:SS" en UTC (formato que espera Odoo). */
function odooDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  if (
    !process.env.CRON_SECRET ||
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const ventanaMs = Number(searchParams.get("ventanaMs")) || VENTANA_MS;
    const desde = odooDatetime(new Date(Date.now() - ventanaMs));

    const [nFacturas, nOrdenes] = await Promise.all([
      callOdooRPC<number>("account.move", "search_count", [
        [
          ["write_date", ">=", desde],
          ["company_id", "in", COMPANY_IDS],
          ["move_type", "in", ["out_invoice", "out_refund"]],
        ],
      ]),
      callOdooRPC<number>("sale.order", "search_count", [
        [
          ["write_date", ">=", desde],
          ["company_id", "in", COMPANY_IDS],
        ],
      ]),
    ]);

    const cambios = (nFacturas || 0) + (nOrdenes || 0);
    let emitido = false;

    if (cambios > 0 && (global as any).io) {
      (global as any).io.emit("ventas_actualizado", {
        ts: Date.now(),
        nFacturas: nFacturas || 0,
        nOrdenes: nOrdenes || 0,
      });
      emitido = true;
    }

    return NextResponse.json({
      cambios,
      nFacturas: nFacturas || 0,
      nOrdenes: nOrdenes || 0,
      emitido,
      desde,
    });
  } catch (error: any) {
    console.error("detectar-cambios:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || String(error) },
      { status: 500 },
    );
  }
}
