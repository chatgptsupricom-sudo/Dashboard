import { verifyToken } from "@/lib/jwt";
import { inventarioPrincipal, SEDES_INVENTARIO } from "@/lib/inventario/principal";
import { NextRequest, NextResponse } from "next/server";

/**
 * Inventario del almacén principal de la sede del usuario (`cids` del token),
 * una fila por producto con existencia y reservado
 * (`lib/inventario/principal.ts`). El SuperAdmin elige con `company_id`
 * (9, 10, 7 o "all" = las tres sumadas).
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });
    }

    const isSuperAdmin = (payload.role as string)?.toLowerCase().trim() === "superadmin";
    let userCompanyId: number;

    if (payload.cids) {
      userCompanyId = parseInt(String(payload.cids), 10);
    } else if (isSuperAdmin) {
      userCompanyId = 0;
    } else {
      return NextResponse.json({ error: "Empresa no definida" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    const pedida = parseInt(searchParams.get("company_id") || "", 10);
    let companyIds: number[];
    if (isSuperAdmin && SEDES_INVENTARIO.includes(pedida)) companyIds = [pedida];
    else if (userCompanyId === 0) companyIds = SEDES_INVENTARIO;
    else if (SEDES_INVENTARIO.includes(userCompanyId)) companyIds = [userCompanyId];
    else return NextResponse.json({ error: "Sede sin almacén principal" }, { status: 403 });

    const r = await inventarioPrincipal({
      companyIds,
      search: searchParams.get("search") || "",
      brand: searchParams.get("brand") || "all",
      category: searchParams.get("category") || "all",
      lowStock: searchParams.get("low_stock") === "true",
      page: parseInt(searchParams.get("page") || "1", 10) || 1,
      limit: parseInt(searchParams.get("limit") || "10", 10) || 10,
    });

    return NextResponse.json({
      inventory: r.inventory,
      total_count: r.total_count,
      filters: {
        brands: r.brands,
        categories: r.categories,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { inventory: [], error: error.message },
      { status: 500 },
    );
  }
}
