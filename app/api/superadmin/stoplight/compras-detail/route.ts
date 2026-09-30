import { requireRoles } from "@/lib/auth/roles";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { detalleKpiCompras, type KpiCompras } from "@/lib/compras/kpis";
import { obtenerSemanasDelMes, obtenerSemanasDelRango } from "@/lib/feriados";
import { NextRequest, NextResponse } from "next/server";

const KPIS: KpiCompras[] = ["variacion_costo", "rotacion", "quiebre", "inventario_90"];

/**
 * GET /api/superadmin/stoplight/compras-detail?kpi=&mes=YYYY-MM&company_id=
 * Detalle del modal de los KPIs de Compras del Stoplight. Sale de la misma
 * lectura que la grilla (lib/compras/kpis.ts) y con las mismas semanas del
 * mes, así el modal y la fila no se contradicen.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras", "gerencia de ventas", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const url = new URL(request.url);
    const kpi = url.searchParams.get("kpi") as KpiCompras;
    if (!KPIS.includes(kpi)) {
      return NextResponse.json({ error: `KPI inválido. Use: ${KPIS.join(", ")}` }, { status: 400 });
    }
    // Mismo criterio que la grilla (stoplight/route.ts): solo superadmin y
    // Compras eligen sede; el resto queda en la de su token.
    const rol = String(auth.payload.role || "").toLowerCase().trim();
    const companyParam = url.searchParams.get("company_id");
    const eligeSede = rol === "superadmin" || rol === "compras";
    const companyId = eligeSede && companyParam ? parseInt(companyParam, 10) : Number(auth.payload.cids);
    if (!MAIN_WAREHOUSE_BY_COMPANY[companyId]) {
      return NextResponse.json({ error: "Sede invalida" }, { status: 400 });
    }

    const now = new Date();
    const mes = url.searchParams.get("mes") || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anio, mesNum] = mes.split("-").map((x) => parseInt(x, 10));
    if (!anio || !mesNum || mesNum < 1 || mesNum > 12) {
      return NextResponse.json({ error: "Mes inválido" }, { status: 400 });
    }

    // Con rango personalizado, las mismas semanas que la grilla.
    const ini = url.searchParams.get("startDate");
    const fin = url.searchParams.get("endDate");
    const semanas = ini && fin ? obtenerSemanasDelRango(new Date(ini), new Date(fin)) : obtenerSemanasDelMes(anio, mesNum);
    const data = await detalleKpiCompras(companyId, semanas, kpi);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error en compras-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
