import { requireRoles } from "@/lib/auth/roles";
import { respuestaIntegracionPagos } from "@/lib/cxc/integracionPagos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    // La sede sale del token: un gerente solo ve la suya.
    const userCompanyId = parseInt(auth.payload?.cids as string);
    if (!userCompanyId) {
      return NextResponse.json({ error: "Empresa no definida" }, { status: 403 });
    }
    const companyIds = [userCompanyId];
    return NextResponse.json(await respuestaIntegracionPagos(companyIds, searchParams));
  } catch (error: any) {
    console.error("Error API Integración de Pagos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
