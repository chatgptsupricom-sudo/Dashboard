import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { periodoDe } from "@/lib/stock-marca/periodo";
import { sedesDe, stockPorMarca } from "@/lib/stock-marca/servicio";

export const maxDuration = 60;

/**
 * Stock por marca (SuperAdmin): cuánto de cada marca se vendió frente a lo
 * que había (vendido ÷ (vendido + stock al cierre)). Cálculo en
 * lib/stock-marca/calculo.ts; lectura de Odoo en lib/stock-marca/odoo.ts.
 *
 * GET ?company_id=9|10|7|todas&modo=mes|30|90&mes=YYYY-MM&ic=1&refrescar=1
 *   → resumen, marcas y serie mensual (sin productos).
 * GET ...&marca=CLAVE → además, los productos de esa marca.
 * GET ...&productos=1 → además, todos los productos (para el Excel).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, []);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const sedes = sedesDe(sp.get("company_id"));
  if (!sedes) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const periodo = periodoDe(sp.get("modo"), sp.get("mes"));
  const refrescar = sp.get("refrescar") === "1";

  try {
    if (refrescar) await partnersIntercompania(true);
    const r = await stockPorMarca(sedes, periodo, sp.get("ic") === "1", refrescar);
    const marca = sp.get("marca");
    const productos = sp.get("productos") === "1"
      ? r.productos
      : marca != null
        ? r.productos.filter((p) => p.clave === marca)
        : undefined;
    return NextResponse.json({
      success: true,
      data: { ...r, productos, generado: new Date().toISOString() },
    });
  } catch (error: any) {
    console.error("Error en stock-marca GET:", error?.message);
    const status = error instanceof OdooUnreachableError ? 503 : 500;
    return NextResponse.json({ error: status === 503 ? "Odoo no responde" : "Error interno" }, { status });
  }
}
