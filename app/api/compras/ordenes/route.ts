import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


export async function GET(request: NextRequest) {
  try {
    // 1. Verificación de seguridad
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, jwtSecretBytes());
    const userRole = ((payload.role as string) || "").toLowerCase().trim();

    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    // 2. Conexión a Odoo (Aquí utilizas tu cliente XML-RPC o fetch a un controlador de Odoo)
    // Extraemos: Maestro de productos, inventario actual (stock.quant) y ventas (sale.report)

    // --- LÓGICA SIMULADA DE EXTRACCIÓN ---
    // const odooData = await fetchOdooData();

    // 3. Procesamiento y aplicación de fórmulas del Excel
    const dataProcesada = [
      // Este array se generaría iterando sobre odooData
      {
        codigo: "CS-H90-R100-8H44WKFL",
        descripcion: "EZVIZ H90 DUAL 2K",
        stockDisponible: 0,
        ventas45d: 68,
        demandaDiaria: 68 / 45, // 1.51
        clasificacionABC: "A",
        moq: 8,
        // Punto Reorden = (Demanda Diaria * ETA) + Stock Seguridad
        puntoReorden: 1.51 * 25 + 2,
        stockObjetivo: 80,
        // Lógica de cantidad a comprar respetando el MOQ
        cantidadAComprar: Math.ceil((80 - 0) / 8) * 8,
        accion: "🚨 RIESGO: Quiebre Inminente",
        fechaQuiebreEstimada: "2026-07-04",
      },
    ];

    return NextResponse.json(
      { success: true, data: dataProcesada },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error obteniendo sugeridos:", error);
    return NextResponse.json(
      { error: "Error interno del servidor" },
      { status: 500 },
    );
  }
}
