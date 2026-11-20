import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { OdooUnreachableError } from "@/lib/odoo";
import { ROLES_CUPO, alcanceCupo } from "@/lib/cupo-credito/acceso";
import { cupoHoy } from "@/lib/cupo-credito/datos";
import { consolidar, porVendedor, porZona } from "@/lib/cupo-credito/tipos";
import { UTILIZACION_ALTA } from "@/lib/cxc/sobregiro";

export const dynamic = "force-dynamic";

/**
 * GET /api/cupo-credito?sede=9|10|7|todas[&refrescar=1]
 * Consumo del cupo de crédito de hoy (lib/cupo-credito): por cliente, por
 * vendedor (equipo) y por zona. El vendedor recibe solo su cartera y no el
 * consolidado por vendedor; la gerencia su sede; SuperAdmin y BI eligen sede.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_CUPO);
  if (auth.error) return auth.error;
  const sp = request.nextUrl.searchParams;
  const alcance = alcanceCupo(auth.payload, sp.get("sede"));
  if ("error" in alcance) return NextResponse.json({ error: alcance.error }, { status: alcance.status });

  try {
    const clientes = await cupoHoy(alcance.sedes, {
      uid: alcance.soloCartera ? alcance.uid : null,
      refrescar: sp.get("refrescar") === "1",
    });
    return NextResponse.json({
      success: true,
      data: {
        sedes: alcance.sedes,
        soloCartera: alcance.soloCartera,
        eligeSede: alcance.eligeSede,
        utilizacionAlta: UTILIZACION_ALTA,
        resumen: consolidar(clientes),
        clientes,
        vendedores: alcance.soloCartera ? [] : porVendedor(clientes),
        zonas: alcance.soloCartera ? [] : porZona(clientes),
        actualizado: new Date().toISOString(),
      },
    });
  } catch (e: any) {
    console.error("[cupo-credito]", e?.message);
    return NextResponse.json(
      { error: "No se pudo leer Odoo. Intenta de nuevo.", odooCaido: e instanceof OdooUnreachableError },
      { status: 502 },
    );
  }
}
