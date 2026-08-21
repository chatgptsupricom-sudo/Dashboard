import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

// 🔐 BYPASS SSL: Obligatorio para subdominios multi-nivel en Odoo Sh
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);

    // 1. CAPTURA DE PARÁMETROS DE LA URL
    const companyId = searchParams.get("company_id");
    const warehouseId = searchParams.get("warehouse_id");
    const search = searchParams.get("search") || "";
    const brandFilter = searchParams.get("brand") || "all";
    const categoryFilter = searchParams.get("category") || "all";
    const lowStockOnly = searchParams.get("low_stock") === "true";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const offset = (page - 1) * limit;

    // 2. DOMINIO MAESTRO (Solo stock interno físico disponible)
    const masterDomain: any[] = [
      ["location_id.usage", "=", "internal"],
      ["quantity", ">", 0],
    ];

    let filterLocationId: number | null = null;
    if (warehouseId && warehouseId !== "all") {
      try {
        const warehouseData = await callOdooRPC<any[]>(
          "stock.warehouse",
          "read",
          [[parseInt(warehouseId)], ["view_location_id"]],
        );
        if (warehouseData && warehouseData[0]?.view_location_id) {
          filterLocationId = warehouseData[0].view_location_id[0];
        }
      } catch (e) {
        console.error("⚠️ Almacén sin ubicación válida");
      }
    }

    const baseContext = [...masterDomain];
    if (companyId && companyId !== "all") {
      baseContext.push(["company_id", "=", parseInt(companyId)]);
    }
    if (filterLocationId) {
      baseContext.push(["location_id", "child_of", filterLocationId]);
    }

    let stockForFilters = [];
    try {
      stockForFilters =
        (await callOdooRPC<any[]>("stock.quant", "search_read", [
          baseContext,
          ["product_id", "company_id"],
        ])) || [];
    } catch (e) {
      stockForFilters = [];
    }

    const availProductIds = Array.from(
      new Set(stockForFilters.map((s) => s.product_id[0])),
    );
    const availCompanyIds = Array.from(
      new Set(stockForFilters.map((s) => s.company_id[0])),
    );

    // 3. OBTENER METADATOS
    let allProductsInfo: any[] = [];
    let allRealCompanies: any[] = [];

    if (availProductIds.length > 0) {
      allProductsInfo =
        (await callOdooRPC<any[]>("product.product", "search_read", [
          [["id", "in", availProductIds]],
          ["categ_id", "display_name"],
        ])) || [];
    }

    allRealCompanies =
      (await callOdooRPC<any[]>("res.company", "search_read", [
        [["id", "in", availCompanyIds.length ? availCompanyIds : [-1]]],
        ["name"],
      ])) || [];

    const dynamicBrands = Array.from(
      new Set(
        allProductsInfo
          .filter(
            (p) => categoryFilter === "all" || p.categ_id[1] === categoryFilter,
          )
          .map((p) =>
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
        allProductsInfo
          .filter((p) => {
            const b = p.display_name
              .replace(/\[.*?\]/g, "")
              .trim()
              .split(" ")[0]
              .toUpperCase();
            return brandFilter === "all" || b === brandFilter.toUpperCase();
          })
          .map((p) => p.categ_id[1]),
      ),
    ).sort();

    // 4. DOMINIO FINAL PARA LA FILTRACIÓN EN TABLA
    const tableDomain = [...baseContext];
    if (brandFilter !== "all")
      tableDomain.push(["product_id.name", "=ilike", `${brandFilter}%`]);
    if (categoryFilter !== "all")
      tableDomain.push(["product_id.categ_id.name", "=", categoryFilter]);
    if (lowStockOnly) tableDomain.push(["quantity", "<=", 20]);
    if (search) tableDomain.push(["product_id.name", "ilike", search]);

    // 5. EJECUCIÓN RPC FINAL
    const [resStock, resCount] = await Promise.all([
      callOdooRPC<any[]>("stock.quant", "search_read", [
        tableDomain,
        ["product_id", "location_id", "quantity", "company_id"],
        offset,
        limit,
      ]),
      callOdooRPC<number>("stock.quant", "search_count", [tableDomain]),
    ]);

    const stockData = resStock || [];
    const totalCount = resCount || 0;

    // 6. MAPEO LIMPIO Y SEGURO PARA EL FRONTEND
    const inventory = stockData.map((item) => {
      const pInfo = allProductsInfo.find((p) => p.id === item.product_id[0]);
      const cleanName = item.product_id[1].replace(/\[.*?\]/g, "").trim();
      return {
        id: item.id,
        name: cleanName,
        brand: cleanName.split(" ")[0].toUpperCase(),
        category: pInfo?.categ_id ? pInfo.categ_id[1] : "General",
        quantity: item.quantity,
        warehouse: item.location_id[1],
        company: item.company_id[1],
        status: item.quantity <= 20 ? "Bajo" : "Activo",
      };
    });

    const warehousesList =
      (await callOdooRPC<any[]>("stock.warehouse", "search_read", [
        companyId && companyId !== "all"
          ? [["company_id", "=", parseInt(companyId)]]
          : [
              [
                "company_id",
                "in",
                availCompanyIds.length ? availCompanyIds : [-1],
              ],
            ],
        ["name"],
      ])) || [];

    return NextResponse.json({
      inventory,
      total_count: totalCount,
      filters: {
        companies: allRealCompanies,
        brands: dynamicBrands,
        categories: dynamicCategories,
        warehouses: warehousesList,
      },
    });
  } catch (error: any) {
    console.error("❌ CRITICAL INVENTORY API ERROR:", error.message);
    return NextResponse.json(
      {
        inventory: [],
        total_count: 0,
        filters: { companies: [], brands: [], categories: [], warehouses: [] },
        error: error.message,
      },
      { status: 500 },
    );
  }
}
