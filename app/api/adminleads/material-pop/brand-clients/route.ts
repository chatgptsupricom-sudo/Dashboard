import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { topClientesPorMarca } from "@/lib/adminleads/material-pop/clientesMarca";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** YYYY-MM-DD local, no UTC. */
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const esFecha = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Clientes que compran las marcas del catálogo Material POP, según las
 * facturas de Odoo.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const cids = resolveMaterialPopCids(auth.payload);
    const { searchParams } = new URL(request.url);

    const hoy = new Date();
    const desdeParam = searchParams.get("desde");
    const hastaParam = searchParams.get("hasta");
    // Por defecto, el año en curso: un mes solo no alcanza para hablar de "top".
    const desde = esFecha(desdeParam) ? desdeParam : `${hoy.getFullYear()}-01-01`;
    const hasta = esFecha(hastaParam) ? hastaParam : iso(hoy);
    if (desde > hasta) {
      return NextResponse.json({ error: "El rango de fechas está invertido" }, { status: 400 });
    }
    // Tope de 12 meses: cada mes son miles de líneas de factura y la consulta
    // va contra Odoo, no contra una tabla propia.
    const limite = new Date(`${desde}T00:00:00`);
    limite.setFullYear(limite.getFullYear() + 1);
    if (hasta > iso(limite)) {
      return NextResponse.json({ error: "El rango no puede pasar de 12 meses" }, { status: 400 });
    }

    const data = await topClientesPorMarca({
      cids,
      // Material POP es de Valencia (cids 9); superAdmin ve las tres sedes.
      companyIds: cids === null ? [7, 9, 10] : [cids],
      desde,
      hasta,
      marca: searchParams.get("marca") || null,
    });

    return NextResponse.json({ success: true, ...data, filtros: { desde, hasta } });
  } catch (error: any) {
    console.error("Error en clientes por marca POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
