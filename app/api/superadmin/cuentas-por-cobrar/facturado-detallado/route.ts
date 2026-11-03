import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/auth/sedeRol";
import { companyIdsEnAlcance } from "@/lib/cxc/alcance";
import { facturadoDetallado } from "@/lib/cxc/facturadoDetallado";
import { mesValido } from "@/lib/inteligencia-negocio/reportes";
import { conSinIntercompaniaParaBI } from "@/lib/intercompania";

export const dynamic = "force-dynamic";

// GET /api/superadmin/cuentas-por-cobrar/facturado-detallado?empresa=&mes=YYYY-MM
// El "Facturado detallado" de Odoo de cualquier mes (lib/cxc/facturadoDetallado.ts).
async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const companyIds = companyIdsEnAlcance(auth.payload, sp.get("empresa") || "");
  if (companyIds.length === 0) return NextResponse.json({ error: "No tienes acceso a esa sede" }, { status: 403 });
  const mes = sp.get("mes") || "";
  if (!mesValido(mes)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  try {
    const lineas = await facturadoDetallado(companyIds, mes);
    return NextResponse.json({ success: true, data: { mes, companyIds, lineas } });
  } catch (e: any) {
    console.error("[cxc/facturado-detallado]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}

export const GET = conSinIntercompaniaParaBI(leerGET);
