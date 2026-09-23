import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { detalleClienteMarca } from "@/lib/adminleads/material-pop/clientesMarca";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const esFecha = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Productos y facturas de un cliente, detrás de las cifras del listado. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const partnerId = Number(searchParams.get("partnerId"));
    const desde = searchParams.get("desde");
    const hasta = searchParams.get("hasta");

    if (!Number.isInteger(partnerId) || partnerId <= 0) {
      return NextResponse.json({ error: "Falta el cliente" }, { status: 400 });
    }
    if (!esFecha(desde) || !esFecha(hasta) || desde > hasta) {
      return NextResponse.json({ error: "Rango de fechas inválido" }, { status: 400 });
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const data = await detalleClienteMarca({
      cids,
      companyIds: cids === null ? [7, 9, 10] : [cids],
      desde,
      hasta,
      marca: searchParams.get("marca") || null,
      partnerId,
    });

    return NextResponse.json({ success: true, ...data });
  } catch (error: any) {
    console.error("Error en detalle de cliente por marca POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
