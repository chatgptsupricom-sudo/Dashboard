import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import { imagenComprobante } from "@/lib/administracion/binance";

// GET /api/administracion/binance/imagen?id= — el comprobante tal cual se subió.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  const fila = Number.isInteger(id) && id > 0 ? await imagenComprobante(id) : null;
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
