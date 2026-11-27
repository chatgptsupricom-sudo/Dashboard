import { esRolBI, ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { requireRoles } from "@/lib/auth/roles";
import {
  inventarioPrincipal,
  nombreSede,
  SEDES_INVENTARIO,
  VENTANAS_VENTAS,
} from "@/lib/inventario/principal";
import { NextRequest, NextResponse } from "next/server";

/**
 * Inventario del almacén principal de cada sede (`lib/inventario/principal.ts`):
 * una fila por producto con existencia y reservado. `company_id` = 9, 10, 7 o
 * "all" (las tres sumadas).
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin", ROL_BI]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);

    const companyId = parseInt(searchParams.get("company_id") || "", 10);
    const companyIds = SEDES_INVENTARIO.includes(companyId) ? [companyId] : SEDES_INVENTARIO;

    // Inteligencia de Negocio ve además costo, precio base y lo vendido. El
    // costo es por sede (standard_price, o el del proveedor si está en 0) y lo
    // vendido son las unidades netas en la ventana, Odoo + Smartbit antes del
    // corte y sin intercompañía: las mismas cifras de Compras
    // (lib/compras/datosOdoo.ts, en caché 10 min).
    const verCostos = esRolBI(auth.payload?.role);
    const pedida = parseInt(searchParams.get("ventas_dias") || "", 10);
    const ventasDias = VENTANAS_VENTAS.includes(pedida) ? pedida : 90;

    const r = await inventarioPrincipal({
      companyIds,
      search: searchParams.get("search") || "",
      brand: searchParams.get("brand") || "all",
      category: searchParams.get("category") || "all",
      lowStock: searchParams.get("low_stock") === "true",
      page: parseInt(searchParams.get("page") || "1", 10) || 1,
      limit: parseInt(searchParams.get("limit") || "10", 10) || 10,
      verCostos,
      ventasDias,
    });

    return NextResponse.json({
      inventory: r.inventory,
      total_count: r.total_count,
      ...(verCostos && { verCostos, ventasDias }),
      filters: {
        companies: SEDES_INVENTARIO.map((id) => ({ id, name: nombreSede(id) })),
        brands: r.brands,
        categories: r.categories,
      },
    });
  } catch (error: any) {
    console.error("❌ CRITICAL INVENTORY API ERROR:", error.message);
    return NextResponse.json(
      {
        inventory: [],
        total_count: 0,
        filters: { companies: [], brands: [], categories: [] },
        error: error.message,
      },
      { status: 500 },
    );
  }
}
