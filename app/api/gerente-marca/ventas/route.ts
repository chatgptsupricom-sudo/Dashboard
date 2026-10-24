import { NextRequest, NextResponse } from "next/server";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { OdooUnreachableError } from "@/lib/odoo";
import { alcanceGerente } from "@/lib/gerente-marca/acceso";
import { ventasGerente } from "@/lib/gerente-marca/datos";

export const maxDuration = 60;

const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Ventas de las marcas del Gerente de Marca por número de parte: unidades,
 * facturado sin IVA y cobrado (lib/gerente-marca/datos.ts).
 *
 * GET ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&sede=9|10|ambas&gerente=correo
 * (sin fechas: el mes en curso).
 */
export async function GET(request: NextRequest) {
  const a = await alcanceGerente(request);
  if (a.error) return a.error;
  const sp = request.nextUrl.searchParams;
  const hoy = hoyCaracas();
  const desde = sp.get("desde") || `${hoy.slice(0, 7)}-01`;
  const hasta = sp.get("hasta") || hoy;
  if (!DIA.test(desde) || !DIA.test(hasta) || desde > hasta) {
    return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
  }
  try {
    const data = await ventasGerente(a.asignaciones, a.sedes, desde, hasta);
    return NextResponse.json({ success: true, data: { ...data, generado: new Date().toISOString() } });
  } catch (error: any) {
    console.error("Error en gerente-marca/ventas:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "No se pudieron leer las ventas de Odoo" }, { status });
  }
}
