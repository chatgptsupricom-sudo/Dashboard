import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload)
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const start =
      searchParams.get("startDate") ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split("T")[0];
    const end = searchParams.get("endDate") || new Date().toISOString().split("T")[0];

    let companyFilter: any[] = [];
    if (payload.role === "superAdmin") {
      const companyIdParam = searchParams.get("company_id");
      companyFilter =
        companyIdParam && companyIdParam !== "all"
          ? ["company_id", "=", parseInt(companyIdParam)]
          : ["company_id", "in", [9, 10, 7]];
    } else {
      if (!payload.cids)
        return NextResponse.json({ error: "Sin empresa" }, { status: 403 });
      companyFilter = ["company_id", "=", parseInt(payload.cids as any)];
    }

    const sellerExclusions: Record<number, string[]> = {
      9: ["asistente", "yusne"],
      10: ["asistente", "adriana"],
      7: ["hercilio"],
    };

    const sellerExcludeCompanyId =
      payload.role === "superAdmin"
        ? (searchParams.get("company_id") ? parseInt(searchParams.get("company_id")!) : null)
        : parseInt(payload.cids as any);

    const sellerExcludeRules = sellerExclusions[sellerExcludeCompanyId] || [];
    let excludedMoveIds: number[] = [];

    if (sellerExcludeRules.length > 0) {
      const excludeSellersDomain: any[] = [
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["invoice_date", ">=", start],
        ["invoice_date", "<=", end],
        companyFilter,
      ];
      const excludedSellerInvoices = await callOdooRPC<any[]>(
        "account.move", "search_read", [excludeSellersDomain],
        { fields: ["invoice_user_id"] },
      );
      excludedMoveIds = (excludedSellerInvoices || [])
        .filter((inv: any) => {
          const name = (inv.invoice_user_id?.[1] || "").toLowerCase();
          return sellerExcludeRules.some((rule) => name.includes(rule));
        })
        .map((inv: any) => inv.id);
    }

    const baseFilters = [
      ["move_id.move_type", "=", "out_invoice"],
      ["parent_state", "=", "posted"],
      ["display_type", "=", "product"],
      ["product_id", "!=", false],
      companyFilter,
      ...(excludedMoveIds.length > 0 ? [["move_id", "not in", excludedMoveIds]] : []),
    ];

    const currentMonthFilters = [
      ...baseFilters,
      ["date", ">=", start],
      ["date", "<=", end],
    ];

    const linesData =
      (await callOdooRPC<any[]>("account.move.line", "read_group", [
        currentMonthFilters,
        ["price_subtotal", "quantity", "product_id"],
        ["product_id"],
        0,
        0,
        "price_subtotal desc",
      ])) || [];

    const productIds = linesData.map((l) => l.product_id[0]);
    const productsInfo =
      productIds.length > 0
        ? (await callOdooRPC<any[]>("product.product", "read", [
            productIds,
            ["qty_available"],
          ])) || []
        : [];
    const stockMap = new Map(
      productsInfo.map((p) => [p.id, p.qty_available || 0]),
    );

    const brandMap: Record<string, { revenue: number; cantidad: number }> = {};
    const blacklistWords = [
      "SALDO", "INICIAL", "FLETE", "SERVICIO", "AJUSTE",
      "IVA", "COBRO", "POLO", "GORRAS", "INSTALACION",
      "ENVOPLAST", "VARIOS", "PROMO",
    ];

    const processedItems = linesData
      .filter(
        (p) =>
          !blacklistWords.some((word) =>
            p.product_id[1].toUpperCase().includes(word),
          ),
      )
      .map((p) => {
        const id = p.product_id[0];
        const rawName = p.product_id[1]
          .replace(/\[.*?\]/g, "")
          .replace(/^\d+-\S+\s+/, "")
          .trim();
        const brandName = rawName.split(" ")[0].toUpperCase();
        const revenue = p.price_subtotal || 0;
        const cantidad = p.quantity || 0;

        if (
          brandName.length > 2 &&
          !/^\d+$/.test(brandName) &&
          !blacklistWords.includes(brandName)
        ) {
          if (!brandMap[brandName]) {
            brandMap[brandName] = { revenue: 0, cantidad: 0 };
          }
          brandMap[brandName].revenue += revenue;
          brandMap[brandName].cantidad += cantidad;
        }

        return { id, name: rawName, brand: brandName, revenue, cantidad, stock: stockMap.get(id) || 0 };
      });

    const sortedBrands = Object.entries(brandMap)
      .map(([name, data]) => ({ name, revenue: data.revenue, cantidad: data.cantidad }))
      .sort((a, b) => b.revenue - a.revenue);

    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
      .toISOString()
      .split("T")[0];
    const today = now.toISOString().split("T")[0];

    const clientsExcludedFilter = excludedMoveIds.length > 0 ? [["id", "not in", excludedMoveIds]] : [];

    const [clientsRanking, allClientsCount] = await Promise.all([
      callOdooRPC<any[]>("account.move", "read_group", [
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["invoice_date", ">=", start],
          ["invoice_date", "<=", end],
          companyFilter,
          ...clientsExcludedFilter,
        ],
        ["amount_untaxed", "partner_id"],
        ["partner_id"],
        0,
        0,
        "amount_untaxed desc",
      ]),
      callOdooRPC<any[]>("account.move", "read_group", [
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          companyFilter,
          ...clientsExcludedFilter,
        ],
        ["partner_id"],
        ["partner_id"],
      ]),
    ]);

    const sellersDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["invoice_date", ">=", start],
      ["invoice_date", "<=", end],
      companyFilter,
    ];

    const historyDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["invoice_date", ">=", twelveMonthsAgo],
      ["invoice_date", "<=", today],
      companyFilter,
    ];

    const [sellersInvoices, historyInvoices] = await Promise.all([
      callOdooRPC<any[]>("account.move", "search_read", [sellersDomain],
        { fields: ["amount_untaxed", "invoice_user_id", "company_id", "move_type"] }),
      callOdooRPC<any[]>("account.move", "search_read", [historyDomain],
        { fields: ["amount_untaxed", "invoice_user_id", "company_id", "move_type", "invoice_date"] }),
    ]);

    const sellerStats: Record<string, { total: number; id: number; companyId: number; name: string }> = {};
    (sellersInvoices || []).forEach((inv: any) => {
      const id = inv.invoice_user_id?.[0] || 0;
      const name = inv.invoice_user_id?.[1] || "Sin Vendedor";
      const cid = inv.company_id?.[0] || 0;
      if (!sellerStats[id]) sellerStats[id] = { total: 0, id, companyId: cid, name };
      const amount = inv.amount_untaxed || 0;
      sellerStats[id].total += inv.move_type === "out_refund" ? -amount : amount;
    });

    const sellersDataFiltered = Object.values(sellerStats)
      .filter((s) => {
        const name = s.name.toLowerCase();
        const rules = sellerExclusions[s.companyId] || [];
        return !rules.some((rule) => name.includes(rule));
      });

    const currentMonthTotal = sellersDataFiltered.reduce((acc, s) => acc + (s.total || 0), 0);

    const sellersData = sellersDataFiltered
      .sort((a, b) => b.total - a.total)
      .slice(0, 10)
      .map((s) => ({ name: s.name, total: s.total }));

    const excludedIds = new Set(
      Object.values(sellerStats)
        .filter((s) => {
          const name = s.name.toLowerCase();
          const rules = sellerExclusions[s.companyId] || [];
          return rules.some((rule) => name.includes(rule));
        })
        .map((s) => s.id)
    );

    const monthlyGrowthMap: Record<string, number> = {};
    (historyInvoices || []).forEach((inv: any) => {
      const id = inv.invoice_user_id?.[0] || 0;
      if (excludedIds.has(id)) return;
      const invDate = inv.invoice_date || "";
      const monthKey = invDate.substring(0, 7);
      if (monthKey) {
        const amount = inv.amount_untaxed || 0;
        const signed = inv.move_type === "out_refund" ? -amount : amount;
        monthlyGrowthMap[monthKey] = (monthlyGrowthMap[monthKey] || 0) + signed;
      }
    });

    const monthlyGrowth = Object.entries(monthlyGrowthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, total]) => ({ month, total }));
    const lastMonthTotal = monthlyGrowth[monthlyGrowth.length - 2]?.total || 1;
    const growthPercent = (
      ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) *
      100
    ).toFixed(1);

    return NextResponse.json({
      topProducts: processedItems.slice(0, 5),
      bottomProducts: processedItems
        .filter((p) => p.revenue > 0 && p.stock > 0)
        .sort((a, b) => a.revenue - b.revenue)
        .slice(0, 5),
      brands: {
        mostSold: sortedBrands.slice(0, 5),
        leastSold: sortedBrands
          .filter((b) => b.revenue > 0)
          .reverse()
          .slice(0, 5),
      },
      salesByUser: sellersData,
      topClients: (clientsRanking || [])
        .filter((c: any) => {
          const name = (c.partner_id?.[1] || "").toLowerCase();
          return !name.includes("supricom");
        })
        .slice(0, 5)
        .map((c) => ({
          name: c.partner_id ? c.partner_id[1] : "Desconocido",
          total: c.amount_untaxed || 0,
        })),
      monthlyGrowth,
      summary: {
        totalMonth: currentMonthTotal,
        activeClientsCount: (allClientsCount || []).length,
        topProductName: processedItems[0]?.name || "N/A",
        growthRate: `${parseFloat(growthPercent) > 0 ? "+" : ""}${growthPercent}%`,
      },
    });
  } catch (error: any) {
    console.error("CRITICAL ERROR STATS API:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
