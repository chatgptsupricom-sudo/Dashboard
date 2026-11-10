import { NextRequest, NextResponse } from "next/server";
import { respuestaSedeNoPermitida } from "@/lib/auth/sedeRol";
import { guardAdministracion, leerFiltro, respuestaDeError } from "@/lib/administracion/lectura";
import { comprobanteDePago } from "@/lib/administracion/pagosIntercompania";

// GET /api/administracion/intercompania/comprobante?id=<ir.attachment>
// Baja el comprobante que la sede que paga adjunto al pago en Odoo. Solo si el
// pago es entre sedes y la sede del usuario paga o cobra.
export async function GET(request: NextRequest) {
  const auth = await guardAdministracion(request);
  if (auth.error) return auth.error;
  try {
    const f = leerFiltro(request, auth.payload);
    if (!f) return respuestaSedeNoPermitida();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ success: false, error: "Comprobante inválido" }, { status: 400 });
    }
    const c = await comprobanteDePago(id, f.companyIds);
    if (!c) return NextResponse.json({ success: false, error: "Comprobante no encontrado" }, { status: 404 });
    // Siempre como descarga: un HTML o SVG subido a Odoo no se abre en el dominio del panel.
    return new Response(new Uint8Array(c.datos), {
      headers: {
        "Content-Type": c.mimetype,
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(c.nombre)}`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return respuestaDeError(error, "comprobante de pago entre sedes");
  }
}
