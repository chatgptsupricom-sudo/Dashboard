import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { calcularSpiffDelMes } from "@/lib/spiff/calculo";

export const dynamic = "force-dynamic";

/**
 * Resumen de SPIFF del mes para Gerencia de Ventas: qué vendedor ganó spiff,
 * cuánto y por qué marca(s)/producto(s). `?mes=YYYY-MM` (por defecto el
 * actual). Solo superadmin elige sede con `?company_id=`; el resto ve la suya.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas", "asistente de ventas", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const rol = String(auth.payload.role || "").toLowerCase().trim();
    const sp = request.nextUrl.searchParams;
    const param = parseInt(sp.get("company_id") || "", 10);
    const companyId = rol === "superadmin" && Number.isFinite(param) ? param : Number(auth.payload.cids) || 9;

    const now = new Date();
    const mesParam = sp.get("mes") || "";
    const [anio, mes] = /^\d{4}-\d{2}$/.test(mesParam)
      ? mesParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const data = await calcularSpiffDelMes(companyId, anio, mes);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error en resumen de spiff:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
