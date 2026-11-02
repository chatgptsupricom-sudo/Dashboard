import { NextResponse } from "next/server";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { detalleEfectividad } from "@/lib/cxc/efectividad";
import { claveCierre, guardarCierre } from "@/lib/cxc/cierreEfectividad";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { conSinIntercompaniaBI } from "@/lib/intercompania";

export const dynamic = "force-dynamic";

/** Las tres sedes y la vista consolidada, como las pide la pantalla de CxC. */
const JUEGOS = [[9], [10], [7], [7, 9, 10]];

/**
 * GET /api/cron/cierre-efectividad-cxc: foto de cierre de la Efectividad de
 * Cobranza del mes anterior (lib/cxc/cierreEfectividad.ts). Lo llama server.js
 * el día 1 a las 23:00 con `Authorization: Bearer $CRON_SECRET`. Si la foto ya
 * está, no la toca. `?mes=YYYY-MM` toma otro mes ya cerrado y `?forzar=1` la
 * reemplaza (recalcular un cierre).
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    console.error("[cron-cierre-efectividad] CRON_SECRET no está configurado");
    return new NextResponse("Cron no configurado", { status: 500 });
  }
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse("No autorizado", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const forzar = searchParams.get("forzar") === "1";
  const hoy = new Date();
  const pedido = searchParams.get("mes")?.match(/^(\d{4})-(\d{2})$/);
  const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const anio = pedido ? Number(pedido[1]) : mesAnterior.getFullYear();
  const mes0 = pedido ? Number(pedido[2]) - 1 : mesAnterior.getMonth();
  const monthStart = new Date(anio, mes0, 1);
  const monthEnd = new Date(anio, mes0 + 1, 0);
  const mes = `${anio}-${String(mes0 + 1).padStart(2, "0")}`;
  const today = new Date(hoy);
  today.setHours(23, 59, 59, 999);
  if (today <= new Date(anio, mes0 + 1, 0, 23, 59, 59, 999)) {
    return NextResponse.json({ error: `${mes} todavía no cerró` }, { status: 400 });
  }

  const semanas = obtenerSemanasDelMes(anio, mes0 + 1);
  const resultado: Record<string, string> = {};
  // Cada juego normal y su versión sin intercompañía (Inteligencia de Negocio).
  for (const rol of [null, ROL_BI]) {
    for (const companyIds of JUEGOS) {
      await conSinIntercompaniaBI(rol, async () => {
        const clave = claveCierre(companyIds);
        try {
          const detalle = await detalleEfectividad(companyIds, monthStart, monthEnd, semanas, today);
          resultado[clave] = (await guardarCierre(clave, mes, detalle, forzar))
            ? `foto guardada (${detalle.resumen.value ?? "N/A"}%)`
            : "ya estaba";
        } catch (e: any) {
          console.error(`[cron-cierre-efectividad] ${clave}:`, e?.message);
          resultado[clave] = `error: ${e?.message}`;
        }
      });
    }
  }
  return NextResponse.json({ success: true, mes, resultado });
}
