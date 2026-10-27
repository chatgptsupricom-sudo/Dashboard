import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import { FIRMA_CONCILIADOS_PNG } from "@/lib/administracion/firmaConciliados";

// GET /api/administracion/binance/firma — la firma de la hoja de "Imprimir
// conciliados". Con sesión: una firma no se deja en una URL pública.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMINISTRACION);
  if (auth.error) return auth.error;
  return new NextResponse(FIRMA_CONCILIADOS_PNG as any, {
    headers: {
      "Content-Type": "image/png",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
