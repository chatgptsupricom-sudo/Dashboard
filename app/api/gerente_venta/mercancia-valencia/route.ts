import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { lineasCaracas } from "@/lib/ventas/mercanciaValencia";
import { delMes, porProducto, resumir } from "@/lib/ventas/mercanciaValenciaTipos";

export const dynamic = "force-dynamic";

const CARACAS = 10;

/**
 * GET /api/gerente_venta/mercancia-valencia?mes=YYYY-MM|todos
 * Lo que Caracas le compró a Valencia y cuánto sigue en Valencia
 * (lib/ventas/mercanciaValencia.ts). Gerencia de Ventas de Caracas y el
 * SuperAdmin. `mes` filtra por fecha de la primera factura; lo pendiente por
 * producto es siempre de todos los meses.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas"]);
  if (auth.error) return auth.error;
  const esSuper = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";
  if (!esSuper && Number(auth.payload?.cids) !== CARACAS) {
    return NextResponse.json({ error: "Este reporte es de la Gerencia de Ventas de Caracas." }, { status: 403 });
  }

  const mes = request.nextUrl.searchParams.get("mes") || "todos";
  if (mes !== "todos" && !/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
  }

  try {
    const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
    const todas = await lineasCaracas(hoy);
    const lineas = delMes(todas, mes);
    return NextResponse.json({
      success: true,
      data: {
        mes,
        resumen: resumir(lineas),
        lineas,
        pendienteTotal: resumir(todas.filter((l) => l.pendiente > 0)),
        productos: porProducto(todas, hoy),
        actualizado: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    console.error("[mercancia-valencia]", e?.message);
    return NextResponse.json(
      { error: "No se pudo leer Odoo. Intenta de nuevo.", odooCaido: e instanceof OdooUnreachableError },
      { status: 502 },
    );
  }
}
