import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION, SEDES_VALIDAS, respuestaSedeNoPermitida, sedeDelToken } from "@/lib/auth/sedeRol";
import { respuestaIntegracionPagos } from "@/lib/cxc/integracionPagos";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    // Solo el SuperAdmin elige sede; los demás leen la de su `cids`, aunque
    // pidan otra, y sin `cids` válido no ven nada.
    const esSuperAdmin = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";
    const propia = sedeDelToken(auth.payload);
    const pedida = parseInt(searchParams.get("cid") || "9");
    const sedes = esSuperAdmin ? SEDES_VALIDAS : propia !== null ? [propia] : [];
    if (sedes.length === 0) return respuestaSedeNoPermitida();
    const companyIds = [sedes.includes(pedida) ? pedida : sedes[0]];
    return NextResponse.json(await respuestaIntegracionPagos(companyIds, searchParams, sedes));
  } catch (error: any) {
    console.error("Error API Integración de Pagos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
