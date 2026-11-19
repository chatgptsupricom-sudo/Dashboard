import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { hoyCaracas, sumarDias } from "@/lib/compras/datosOdoo";
import { ROLES_CUPO, alcanceCupo } from "@/lib/cupo-credito/acceso";
import { cupoHoy, historicoCupo } from "@/lib/cupo-credito/datos";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Más de un año no entra en el gráfico diario. */
const MAX_DIAS = 400;

/**
 * GET /api/cupo-credito/historico?sede=&desde=&hasta=
 * Consumo de cupo día por día, total y por vendedor, de las fotos que el
 * panel guarda cada hora (lib/cxc/historialCredito.ts). Default: últimos 90
 * días. El vendedor recibe solo la serie de su cartera.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_CUPO);
  if (auth.error) return auth.error;
  const sp = request.nextUrl.searchParams;
  const alcance = alcanceCupo(auth.payload, sp.get("sede"));
  if ("error" in alcance) return NextResponse.json({ error: alcance.error }, { status: alcance.status });

  const hasta = FECHA.test(sp.get("hasta") || "") ? sp.get("hasta")! : hoyCaracas();
  const desde = FECHA.test(sp.get("desde") || "") ? sp.get("desde")! : sumarDias(hasta, -89);
  if (desde > hasta) return NextResponse.json({ error: "La fecha inicial es posterior a la final" }, { status: 400 });
  if (sumarDias(desde, MAX_DIAS) < hasta) return NextResponse.json({ error: `El período no puede pasar de ${MAX_DIAS} días` }, { status: 400 });

  try {
    let nombreVendedor: string | null = null;
    if (alcance.soloCartera) {
      // Las fotos viejas no tienen el id del vendedor: se buscan también por
      // el nombre que tiene hoy en Odoo. Si Odoo no responde, solo por id.
      const hoy = await cupoHoy(alcance.sedes, { uid: alcance.uid }).catch(() => []);
      nombreVendedor = hoy[0]?.vendedor || null;
    }
    const data = await historicoCupo(alcance.sedes, desde, hasta, {
      uid: alcance.soloCartera ? alcance.uid : null,
      nombreVendedor,
    });
    return NextResponse.json({
      success: true,
      data: {
        ...data,
        // El vendedor no necesita la lista de vendedores (sería solo él).
        vendedores: alcance.soloCartera ? [] : data.vendedores,
        desde,
        hasta,
        soloCartera: alcance.soloCartera,
      },
    });
  } catch (e: any) {
    console.error("[cupo-credito/historico]", e?.message);
    return NextResponse.json({ error: "No se pudo leer el histórico. Intenta de nuevo." }, { status: 500 });
  }
}
