import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaParaBI } from "@/lib/intercompania";
import { SEDES_REPORTES, mesValido, reporteProductos } from "@/lib/inteligencia-negocio/reportes";

export const dynamic = "force-dynamic";

/**
 * GET /api/inteligencia-negocio/reportes/productos?empresa=venezuela|valencia|caracas&mes=YYYY-MM
 * Todo el catálogo: venta, costo, margen, último ingreso e inventario al cierre del mes (lib/inteligencia-negocio/reportes.ts).
 */
async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  const empresa = (sp.get("empresa") || "venezuela").toLowerCase();
  const companyIds = SEDES_REPORTES[empresa];
  if (!companyIds) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const mes = sp.get("mes") || "";
  if (!mesValido(mes)) return NextResponse.json({ error: "Mes inválido" }, { status: 400 });

  try {
    const productos = await reporteProductos(companyIds, mes);
    return NextResponse.json({ success: true, data: { empresa, mes, productos } });
  } catch (e: any) {
    console.error("[bi-reportes/productos]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}

// Inteligencia de Negocio: sin intercompañía (lib/intercompania.ts).
export const GET = conSinIntercompaniaParaBI(leerGET);
