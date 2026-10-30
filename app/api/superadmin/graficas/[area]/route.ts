import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { conSinIntercompaniaBI } from "@/lib/intercompania";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { AREAS, SEDES_GRAFICAS, type Area, type DatosArea } from "@/lib/graficas/tipos";
import { graficasVentas } from "@/lib/graficas/ventas";
import { graficasCobranza } from "@/lib/graficas/cobranza";
import { graficasInventario } from "@/lib/graficas/inventario";
import { graficasRma } from "@/lib/graficas/rma";
import { graficasRrhh } from "@/lib/graficas/rrhh";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * GET /api/superadmin/graficas/<ventas|cobranza|inventario|rma|rrhh>?sede=todas|valencia|caracas|panama&mes=YYYY-MM
 * Centro de gráficas del SuperAdmin (lib/graficas/). Solo SuperAdmin.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ area: string }> }) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const { area } = await params;
  if (!AREAS.includes(area as Area)) return NextResponse.json({ error: "Área inválida" }, { status: 404 });
  const sp = request.nextUrl.searchParams;
  const sede = (sp.get("sede") || "todas").toLowerCase();
  const cids = SEDES_GRAFICAS[sede];
  if (!cids) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });
  const hoy = hoyCaracas().slice(0, 7);
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.get("mes") || "") ? sp.get("mes")! : hoy;
  if (mes > hoy) return NextResponse.json({ error: "El mes no puede ser futuro" }, { status: 400 });

  try {
    // Todo sin intercompañía: con el contexto de BI, lib/cxc y Días promedio
    // también dejan fuera a las empresas del grupo (lib/intercompania.ts).
    const data = await conSinIntercompaniaBI<DatosArea>(ROL_BI, () => {
      switch (area as Area) {
        case "ventas": return graficasVentas(cids, sede, mes);
        case "cobranza": return graficasCobranza(cids, sede, mes);
        case "inventario": return graficasInventario(cids, sede, mes);
        case "rma": return graficasRma(cids, sede, mes);
        case "rrhh": return graficasRrhh(cids, sede, mes, auth.payload);
      }
    });
    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    console.error(`[graficas/${area}]`, e?.message || e);
    return NextResponse.json({ error: "No se pudieron leer los datos. Intenta de nuevo." }, { status: 502 });
  }
}
