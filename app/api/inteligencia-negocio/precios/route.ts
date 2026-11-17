import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { guardarMacro, leerMacro } from "@/lib/inteligencia-negocio/precios/datos";
import { mercadoParaTablero } from "@/lib/inteligencia-negocio/precios/mercado";
import { ventasParaPrecios } from "@/lib/inteligencia-negocio/precios/odoo";
import MACRO_INICIAL from "@/lib/inteligencia-negocio/precios/macroInicial.json";

export const dynamic = "force-dynamic";

/**
 * Datos del tablero de Inteligencia de Precios (public/inteligencia-precios/index.html):
 * GET ?parte=mercado  catálogo de mercado ordenado (listas cargadas)
 * GET ?parte=odoo     ventas de Supricom (Valencia + Caracas, sin intercompañía); &refrescar=1 relee Odoo
 * GET ?parte=macro    reporte mensual de oportunidades (vista 3)
 * POST {macro}        reemplaza el reporte mensual (JSON con `reports`)
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;
  const parte = request.nextUrl.searchParams.get("parte");
  try {
    if (parte === "mercado") return NextResponse.json(await mercadoParaTablero());
    if (parte === "odoo") {
      const refrescar = request.nextUrl.searchParams.get("refrescar") === "1";
      const ODOO = await ventasParaPrecios(refrescar);
      return NextResponse.json({ ODOO, meta: { odooTs: new Date().toISOString(), odooSource: "live" } });
    }
    if (parte === "macro") return NextResponse.json((await leerMacro()) || MACRO_INICIAL);
    return NextResponse.json({ error: "parte inválida" }, { status: 400 });
  } catch (e: any) {
    console.error("[precios GET]", parte, e?.message);
    return NextResponse.json(
      { error: parte === "odoo" ? "No se pudo leer Odoo. Intenta de nuevo." : "No se pudieron leer los datos." },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI], { escribeBI: true });
  if (auth.error) return auth.error;
  const body = await request.json().catch(() => null);
  const macro = body?.macro;
  if (!macro || !Array.isArray(macro.reports)) {
    return NextResponse.json({ error: "El reporte mensual debe ser un JSON con la lista «reports»." }, { status: 400 });
  }
  await guardarMacro(macro, auth.payload?.email);
  return NextResponse.json({ success: true });
}
