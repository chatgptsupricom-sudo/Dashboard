import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { ROLES_ADMINISTRACION } from "@/lib/administracion/auth";
import { recortesDeMovimientos, ROL_CXC } from "@/lib/administracion/binance";

// GET /api/administracion/binance/recorte?id=<movimiento> — la línea de ese pago
// en la captura del estado de cuenta, en JPEG (la misma que va en el Excel).
// El estado de cuenta es uno para las tres sedes, como en la conciliación.
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, ROL_CXC]);
  if (auth.error) return auth.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "id inválido" }, { status: 400 });
  const recorte = (await recortesDeMovimientos([id])).get(id);
  if (!recorte) return NextResponse.json({ error: "Sin recorte" }, { status: 404 });
  return new NextResponse(recorte.datos as any, {
    headers: {
      "Content-Type": "image/jpeg",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
