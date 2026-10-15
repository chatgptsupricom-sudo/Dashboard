import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION, limitarSedesPorRol, respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { respuestaIntegracionPagos } from "@/lib/cxc/integracionPagos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    // Administracion solo lee la sede de su `cids` (lib/auth/sedeRol.ts).
    const companyIds = limitarSedesPorRol(auth.payload, [parseInt(searchParams.get("cid") || "9")]);
    if (companyIds.length === 0) return respuestaSedeNoPermitida();
    return NextResponse.json(await respuestaIntegracionPagos(companyIds, searchParams, [7, 9, 10]));
  } catch (error: any) {
    console.error("Error API Integración de Pagos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
