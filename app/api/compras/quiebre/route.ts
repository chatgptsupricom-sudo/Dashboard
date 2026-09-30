import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import { alertasQuiebre } from "@/lib/compras/reportes";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/quiebre?sede=9 — Mayor rotación (alerta de quiebre):
 * productos con demanda cuyo stock efectivo está en el punto de reorden o por
 * debajo. Mismos datos y cálculo que Sugeridos, con el ETA que cargó Compras
 * (antes usaba otra fórmula, con ETA fijo de 25 días, y no coincidía ni con
 * Sugeridos ni con las tarjetas del resumen que llevan acá).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const data = await alertasQuiebre(sedeId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("❌ Error en API Quiebre:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
