import { NextRequest, NextResponse } from "next/server";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchPagoCxP } from "@/lib/administracion/cxp";

// GET /api/administracion/cuentas-por-pagar/pago?id=&empresa=
// Un pago a proveedor con las facturas/NC que pago. Solo de las sedes del
// usuario (Administracion: la de su `cids`).
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request, auth.payload);
    if (!f) return respuestaSedeNoPermitida();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "Falta el id del pago" }, { status: 400 });
    }
    const pago = await fetchPagoCxP(id, f.companyIds);
    if (!pago) return NextResponse.json({ success: false, error: "Pago no encontrado en tu sede" }, { status: 404 });
    return NextResponse.json({ success: true, pago });
  } catch (error) {
    return respuestaDeError(error, "pago a proveedor (administracion)");
  }
}
