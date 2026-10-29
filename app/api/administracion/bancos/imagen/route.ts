import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import { sedeBinance } from "@/lib/administracion/binance";
import { cuentasBancarias, imagenComprobante } from "@/lib/administracion/bancos";
import { respuestaSedeNoPermitida, SEDES_VALIDAS } from "@/lib/auth/sedeRol";

// GET /api/administracion/bancos/imagen?cuenta=&id= — el comprobante tal cual se subió.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const sede = sedeBinance(auth.payload);
  if (sede === undefined) return respuestaSedeNoPermitida();
  const p = request.nextUrl.searchParams;
  const cuenta = (await cuentasBancarias(sede === null ? SEDES_VALIDAS : [sede])).find(
    (c) => c.id === Number(p.get("cuenta")),
  );
  const id = Number(p.get("id"));
  const fila = cuenta && Number.isInteger(id) && id > 0 ? await imagenComprobante(cuenta, id) : null;
  if (!fila) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return new NextResponse(fila.archivo, {
    headers: {
      "Content-Type": fila.archivo_mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(fila.archivo_nombre || "comprobante")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
