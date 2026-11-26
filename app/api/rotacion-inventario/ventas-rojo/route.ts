import { NextRequest, NextResponse } from "next/server";
import { OdooUnreachableError } from "@/lib/odoo";
import { alcanceRotacion, sedesPedidas } from "@/lib/rotacion-inventario/alcance";
import { ventasDelPlanRojo } from "@/lib/rotacion-inventario/ventasRojo";

export const dynamic = "force-dynamic";

/**
 * GET /api/rotacion-inventario/ventas-rojo?sede=9|10|7|todas — cada venta de
 * la mercancía del plan para salir del rojo de la sede, desde que arrancó:
 * factura, cliente, vendedor, precio, margen, contado o crédito, plazo y cobro
 * (lib/rotacion-inventario/ventasRojo.ts). Mismos roles y sedes que la pantalla.
 */
export async function GET(request: NextRequest) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  const sedes = sedesPedidas(a, request.nextUrl.searchParams.get("sede") ?? String(a.sedesPermitidas[0]));
  if (!sedes.length) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  try {
    const porSede = (await Promise.all(sedes.map((s) => ventasDelPlanRojo(s)))).filter((x) => x !== null);
    return NextResponse.json({
      planes: porSede.map((s) => ({ companyId: s!.companyId, inicio: s!.inicio })),
      ventas: porSede.flatMap((s) => s!.ventas),
    });
  } catch (e: any) {
    console.error("[rotacion-inventario/ventas-rojo]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo.", odooCaido: e instanceof OdooUnreachableError }, { status: 502 });
  }
}
