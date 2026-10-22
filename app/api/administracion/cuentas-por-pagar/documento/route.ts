import { NextRequest, NextResponse } from "next/server";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { fetchDocumentoCxP } from "@/lib/administracion/cxp";

// GET /api/administracion/cuentas-por-pagar/documento?id=&empresa=
// Una factura o NC de proveedor con sus lineas, pagos y retenciones. Solo de
// las sedes del usuario (Administracion: la de su `cids`).
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request, auth.payload);
    if (!f) return respuestaSedeNoPermitida();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "Falta el id del documento" }, { status: 400 });
    }
    const documento = await fetchDocumentoCxP(id, f.companyIds);
    if (!documento) {
      return NextResponse.json({ success: false, error: "Documento no encontrado en tu sede" }, { status: 404 });
    }
    return NextResponse.json({ success: true, documento });
  } catch (error) {
    return respuestaDeError(error, "documento de proveedor (administracion)");
  }
}
