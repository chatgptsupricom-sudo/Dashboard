import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaParaBI } from "@/lib/intercompania";
import { SEDES_REPORTES, mesValido, reporteClientes } from "@/lib/inteligencia-negocio/reportes";

export const dynamic = "force-dynamic";

/**
 * GET /api/inteligencia-negocio/reportes/clientes?empresa=venezuela|valencia|caracas&mes=YYYY-MM[,YYYY-MM...]
 * Lo comprado por cada cliente en los meses elegidos, acumulado (lib/inteligencia-negocio/reportes.ts).
 */
async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const empresa = (sp.get("empresa") || "venezuela").toLowerCase();
  const companyIds = SEDES_REPORTES[empresa];
  if (!companyIds) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const meses = (sp.get("mes") || "").split(",").map((m) => m.trim()).filter(Boolean);
  if (meses.length === 0 || meses.length > 36 || !meses.every(mesValido)) {
    return NextResponse.json({ error: "Meses inválidos" }, { status: 400 });
  }

  try {
    const clientes = await reporteClientes(companyIds, meses);
    return NextResponse.json({ success: true, data: { empresa, meses, clientes } });
  } catch (e: any) {
    console.error("[bi-reportes/clientes]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}

// Inteligencia de Negocio: sin intercompañía (lib/intercompania.ts).
export const GET = conSinIntercompaniaParaBI(leerGET);
