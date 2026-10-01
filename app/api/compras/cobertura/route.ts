import { requireRoles } from "@/lib/auth/roles";
import { leerSede } from "@/lib/compras/constants";
import { coberturaStock } from "@/lib/compras/reportes";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/compras/cobertura?sede=9 — días que alcanza el stock disponible
 * con la venta de los últimos 45 días. Mismos datos que Sugeridos
 * (lib/compras/reportes.ts), incluida la clase ABC.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["compras"]);
  if (auth.error) return auth.error;

  const sedeId = leerSede(request.url);
  if (!sedeId) return NextResponse.json({ error: "Sede invalida" }, { status: 400 });

  try {
    const data = await coberturaStock(sedeId);
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("❌ Error en API Cobertura:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
