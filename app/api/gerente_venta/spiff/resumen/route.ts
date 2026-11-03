import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { eligeSedeSpiff, sedeDelSpiff } from "@/lib/spiff/acceso";
import { calcularSpiffDelMes } from "@/lib/spiff/calculo";

export const dynamic = "force-dynamic";

/**
 * Resumen de SPIFF de un mes: qué vendedor ganó spiff, cuánto, por qué
 * regla(s), y las reglas que se aplicaron ese mes. `?mes=YYYY-MM` (por
 * defecto el actual). La sede es la de `sedeDelSpiff` (superadmin, gerencia,
 * operaciones y BI eligen con `?company_id=`; el resto ve la suya).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerencia de ventas", "asistente de ventas", "gerente de operaciones", ROL_BI]);
  if (auth.error) return auth.error;

  try {
    const sp = request.nextUrl.searchParams;
    const companyId = sedeDelSpiff(auth.payload, sp);

    const now = new Date();
    const mesParam = sp.get("mes") || "";
    const [anio, mes] = /^\d{4}-\d{2}$/.test(mesParam)
      ? mesParam.split("-").map(Number)
      : [now.getFullYear(), now.getMonth() + 1];

    const data = await calcularSpiffDelMes(companyId, anio, mes);
    return NextResponse.json({ success: true, data, companyId, eligeSede: eligeSedeSpiff(auth.payload) });
  } catch (error: any) {
    console.error("Error en resumen de spiff:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
