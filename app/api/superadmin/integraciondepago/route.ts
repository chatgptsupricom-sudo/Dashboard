import { requireRoles } from "@/lib/auth/roles";
import { respuestaIntegracionPagos } from "@/lib/cxc/integracionPagos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const companyIds = [parseInt(searchParams.get("cid") || "9")];
    return NextResponse.json(await respuestaIntegracionPagos(companyIds, searchParams, [7, 9, 10]));
  } catch (error: any) {
    console.error("Error API Integración de Pagos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
