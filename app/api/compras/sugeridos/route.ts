import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { leerSugeridos } from "@/lib/compras/sugeridosDatos";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

/**
 * GET /api/compras/sugeridos?sede=9
 *
 * Devuelve los datos de entrada de la hoja de analisis del comprador, uno por
 * producto vendido en el ultimo ano en la sede: fisico, reservado, transito,
 * ventas 45d/365d, MOQ, costo, y el ETA y la compra manual que cargo Compras.
 * El calculo (lib/compras/sugeridos.ts) lo hace la pantalla, para que al
 * cambiar un ETA o una compra manual se recalcule al instante.
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    // Siempre una sede: el ETA y la compra manual son por sucursal.
    const sedeId = Number(new URL(request.url).searchParams.get("sede")) || 9;
    if (!MAIN_WAREHOUSE_BY_COMPANY[sedeId]) {
      return NextResponse.json({ error: "Sede invalida" }, { status: 400 });
    }

    const { data, warning } = await leerSugeridos(sedeId);
    return NextResponse.json({ success: true, sede: sedeId, data, warning });
  } catch (error: any) {
    console.error("❌ Error en API Sugeridos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
