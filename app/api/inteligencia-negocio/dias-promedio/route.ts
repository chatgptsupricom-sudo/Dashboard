import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaBI } from "@/lib/intercompania";
import { diasPromedio } from "@/lib/inteligencia-negocio/diasPromedio";

export const dynamic = "force-dynamic";

const SEDES: Record<string, number[]> = { todas: [7, 9, 10], valencia: [9], caracas: [10], panama: [7] };

/**
 * GET /api/inteligencia-negocio/dias-promedio?empresa=|todas|valencia|caracas|panama&mes=YYYY-MM
 * Días promedio de cobro, inventario y pago del mes (lib/inteligencia-negocio/diasPromedio.ts).
 * "todas" calcula sobre la suma de las tres sedes (no promedia los días).
 */
async function leerGET(request: NextRequest) {
  const auth = await requireRoles(request, [ROL_BI]);
  if (auth.error) return auth.error;

  const sp = request.nextUrl.searchParams;
  // "" = todas las sedes (el selector compartido de components/administracion/comunes.tsx).
  const empresa = (sp.get("empresa") || "todas").toLowerCase();
  const companyIds = SEDES[empresa];
  if (!companyIds) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const hoy = new Date(Date.now() - 4 * 3_600_000).toISOString().slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("mes") || "") ? sp.get("mes")! : hoy;
  if (mes > hoy) return NextResponse.json({ error: "El mes no puede ser futuro" }, { status: 400 });

  try {
    const data = await diasPromedio(companyIds, mes);
    return NextResponse.json({ success: true, data: { ...data, empresa } });
  } catch (e: any) {
    console.error("[dias-promedio]", e?.message);
    return NextResponse.json({ error: "No se pudo leer Odoo. Intenta de nuevo." }, { status: 502 });
  }
}

// Sin intercompañía para quien la abra (BI o el SuperAdmin desde su desplegable
// "Inteligencia de Negocio"): la pantalla lo dice en el título (lib/intercompania.ts).
export const GET = (request: NextRequest) => conSinIntercompaniaBI(ROL_BI, () => leerGET(request));
