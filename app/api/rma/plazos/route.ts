import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { casosConPlazo, resumirPlazos } from "@/lib/rma/plazosCasos";
import { PLAZOS } from "@/lib/rma/plazos";

export const dynamic = "force-dynamic";

/**
 * GET /api/rma/plazos: casos que siguen sin salir, con sus plazos y alertas
 * (lib/rma/plazos.ts).
 *
 *   ?etapa=por_llegar|diagnostico|reparacion|listo   solo esa etapa
 *   ?alertas=1                                       solo los que tienen aviso o vencieron
 *   ?id=N                                            un caso (detalle)
 *   ?company_id=N                                    una sede
 *
 * El resumen siempre es de todos (con el filtro de sede), para las tarjetas.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const id = parseInt(searchParams.get("id") || "", 10) || null;
    const companyId = parseInt(searchParams.get("company_id") || "", 10) || null;
    const etapa = searchParams.get("etapa") || "";
    const soloAlertas = searchParams.get("alertas") === "1";

    const todos = await casosConPlazo({ id, companyId });
    const casos = todos.filter(
      (c) => (!etapa || c.plazo.etapa === etapa) && (!soloAlertas || c.plazo.nivel !== "ok"),
    );

    return NextResponse.json({
      success: true,
      plazos: PLAZOS,
      resumen: resumirPlazos(todos),
      casos,
    });
  } catch (error: any) {
    console.error("GET /api/rma/plazos error:", error?.message);
    return NextResponse.json({ error: error?.message || "No se pudieron calcular los plazos" }, { status: 500 });
  }
}
