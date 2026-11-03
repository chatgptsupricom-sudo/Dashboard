import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { SEDES_POR_LLEGAR, porLlegar } from "@/lib/inteligencia-negocio/porLlegar";

export const dynamic = "force-dynamic";

/**
 * GET /api/inteligencia-negocio/por-llegar?empresa=todas|valencia|caracas|panama
 * Productos en camino (órdenes de compra de Odoo + packing list de Valencia),
 * con stock y si ya se vendieron en la sede (lib/inteligencia-negocio/porLlegar.ts).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;

  // "" = todas las sedes (el selector compartido de components/administracion/comunes.tsx).
  const empresa = (request.nextUrl.searchParams.get("empresa") || "todas").toLowerCase();
  const companyIds = SEDES_POR_LLEGAR[empresa];
  if (!companyIds) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });

  try {
    const { filas, avisos } = await porLlegar(companyIds);
    return NextResponse.json({ success: true, data: { empresa, filas, avisos } });
  } catch (e: any) {
    console.error("[bi-por-llegar]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}
