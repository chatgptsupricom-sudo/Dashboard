import { searchProducts, getSupplierPrices } from "@/lib/compras/catalogoOdoo";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

// GET /api/compras/ordenes/productos?q=lap&sede=9&supplier_id=123
// Autocompletar de productos para las lineas de la orden (issue #152 +
// #153). `supplier_id` es opcional -- si se pasa, cada producto viene con
// `supplier_price`/`supplier_min_qty` (product.supplierinfo) para
// autocompletar `unit_price` en el formulario; sin proveedor elegido
// todavia, esos campos vienen null y el usuario escribe el precio a mano.
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;
    const supplierIdParam = searchParams.get("supplier_id");
    const supplierId = supplierIdParam ? parseInt(supplierIdParam, 10) : null;
    const limitParam = searchParams.get("limit");
    const limit = Math.min(50, Math.max(1, parseInt(limitParam || "20", 10) || 20));

    const companies = sedeId
      ? [sedeId]
      : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);

    const productos = await searchProducts(q, companies, limit);

    let precios: Record<number, { price: number; min_qty: number }> = {};
    if (supplierId && productos.length > 0) {
      precios = await getSupplierPrices(productos.map((p) => p.id), supplierId);
    }

    const data = productos.map((p) => ({
      ...p,
      supplier_price: precios[p.id]?.price ?? null,
      supplier_min_qty: precios[p.id]?.min_qty ?? null,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error("Error buscando productos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
