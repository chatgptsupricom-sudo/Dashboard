import { verifyToken } from "@/lib/jwt";
// Bypass SSL para subdominios multi-nivel de Odoo Sh, escopeado por-request
// via callOdooRPCInsecure (ver lib/odoo.ts) — nunca process.env global.
import { callOdooRPCInsecure as callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

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
    const allCompanyIds = [9, 10, 7];
    let userCompanyId: number;

    if (payload.cids) {
      userCompanyId = parseInt(payload.cids as string);
    } else if (isSuperAdmin) {
      userCompanyId = 0;
    } else {
      return NextResponse.json({ error: "Empresa no definida" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);

    // 1. DOMINIO MAESTRO (Filtro base por empresa y ubicación interna)
    const companyFilter =
      isSuperAdmin && searchParams.get("company_id") && searchParams.get("company_id") !== "all"
        ? ["company_id", "=", parseInt(searchParams.get("company_id")!)]
        : userCompanyId === 0
          ? ["company_id", "in", allCompanyIds]
          : ["company_id", "=", userCompanyId];

    const masterDomain = [
      ["location_id.usage", "=", "internal"],
      ["quantity", ">", 0],
      companyFilter,
    ];

    // 2. OBTENER METADATOS PARA FILTROS (Independiente de la búsqueda)
    const allStock =
      (await callOdooRPC<any[]>("stock.quant", "search_read", [
        masterDomain,
        ["product_id"],
      ])) || [];
    const allProductIds = Array.from(
      new Set(allStock.map((s) => s.product_id[0])),
    );

    const [allProductsInfo, warehousesList] = await Promise.all([
      allProductIds.length > 0
        ? callOdooRPC<any[]>("product.product", "search_read", [
            [["id", "in", allProductIds]],
            ["categ_id", "display_name"],
          ])
        : [],
      callOdooRPC<any[]>("stock.warehouse", "search_read", [
        [["company_id", "=", userCompanyId]],
        ["name"],
      ]) || [],
    ]);

    const dynamicBrands = Array.from(
      new Set(
        allProductsInfo.map((p) =>
          p.display_name
            .replace(/\[.*?\]/g, "")
            .trim()
            .split(" ")[0]
            .toUpperCase(),
        ),
      ),
    ).sort();
    const dynamicCategories = Array.from(
      new Set(
        allProductsInfo.map((p) => (p.categ_id ? p.categ_id[1] : "General")),
      ),
    ).sort();

    // 3. CONSTRUCCIÓN DOMINIO DE TABLA (Con filtros de usuario)
    const tableDomain = [...masterDomain];
    const warehouseId = searchParams.get("warehouse_id");
    if (warehouseId && warehouseId !== "all") {
      const whData = await callOdooRPC<any[]>("stock.warehouse", "read", [
        [parseInt(warehouseId)],
        ["view_location_id"],
      ]);
      if (whData?.[0]?.view_location_id)
        tableDomain.push([
          "location_id",
          "child_of",
          whData[0].view_location_id[0],
        ]);
    }

    const brand = searchParams.get("brand");
    const category = searchParams.get("category");
    if (brand && brand !== "all")
      tableDomain.push(["product_id.name", "=ilike", `${brand}%`]);
    if (category && category !== "all")
      tableDomain.push(["product_id.categ_id.name", "=", category]);
    if (searchParams.get("low_stock") === "true")
      tableDomain.push(["quantity", "<=", 20]);
    if (searchParams.get("search"))
      tableDomain.push([
        "product_id.name",
        "ilike",
        searchParams.get("search"),
      ]);

    // 4. EJECUCIÓN DATOS TABLA
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = (parseInt(searchParams.get("page") || "1") - 1) * limit;

    const [stockData, totalCount] = await Promise.all([
      callOdooRPC<any[]>("stock.quant", "search_read", [
        tableDomain,
        ["product_id", "location_id", "quantity", "company_id"],
        offset,
        limit,
      ]),
      callOdooRPC<number>("stock.quant", "search_count", [tableDomain]),
    ]);

    // 5. MAPEO FINAL
    const inventory = (stockData || []).map((item) => {
      const pInfo = allProductsInfo.find((p) => p.id === item.product_id[0]);
      return {
        id: item.id,
        name: item.product_id[1].replace(/\[.*?\]/g, "").trim(),
        brand: item.product_id[1].split(" ")[0].toUpperCase(),
        category: pInfo?.categ_id?.[1] || "General",
        quantity: item.quantity,
        warehouse: item.location_id[1],
        company: item.company_id[1],
        status: item.quantity <= 20 ? "Bajo" : "Activo",
      };
    });

    return NextResponse.json({
      inventory,
      total_count: totalCount || 0,
      filters: {
        brands: dynamicBrands,
        categories: dynamicCategories,
        warehouses: warehousesList,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { inventory: [], error: error.message },
      { status: 500 },
    );
  }
}
