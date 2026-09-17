import { requireRoles } from "@/lib/auth/roles";
import { respuestaIntegracionPagos } from "@/lib/cxc/integracionPagos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    // Sede del token; superadmin sin cids ve las tres.
    const isSuperAdmin = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";
    const userCompanyId = parseInt((auth.payload?.cids as string) || "");
    if (!userCompanyId && !isSuperAdmin) {
      return NextResponse.json({ error: "Empresa no definida" }, { status: 403 });
    }
    const companyIds = userCompanyId ? [userCompanyId] : [9, 10, 7];
    return NextResponse.json(await respuestaIntegracionPagos(companyIds, searchParams));
  } catch (error: any) {
    console.error("Error API Integración de Pagos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
