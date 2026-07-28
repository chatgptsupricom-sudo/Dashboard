import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. AUTENTICACIÓN
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload)
      return NextResponse.json({ error: "Token inválido" }, { status: 401 });

    // 2. CONFIGURACIÓN DE FECHAS (Global para toda la función)
    const { searchParams } = new URL(request.url);
    const start =
      searchParams.get("startDate") ||
      new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        .toISOString()
        .split("T")[0];
    const end =
      searchParams.get("endDate") || new Date().toISOString().split("T")[0];

    // 3. FILTRADO DE EMPRESA
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

    // 4. DEFINIR FILTROS (Ya con start y end definidos arriba)
    const lineFilters = [
      ["move_id.move_type", "=", "out_invoice"],
      ["parent_state", "=", "posted"],
      ["display_type", "=", "product"],
      ["product_id", "!=", false],
      ["date", ">=", start],
      ["date", "<=", end],
      companyFilter,
    ];

    const invoiceFilters = [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["invoice_date", ">=", start],
      ["invoice_date", "<=", end],
      companyFilter,
    ];

    // 5. OBTENER LÍNEAS Y STOCK
    // const linesData =
    //   (await callOdooRPC<any[]>("account.move.line", "read_group", [
    //     lineFilters,
    //     ["price_subtotal", "product_id"],
    //     ["product_id"],
    //     0,
    //     0,
    //     "price_subtotal desc",
    //   ])) || [];
    const linesData =
      (await callOdooRPC<any[]>("account.move.line", "read_group", [
        lineFilters,
        // 👇 AQUÍ AGREGAMOS "quantity"
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

    // 6. PROCESAMIENTO (Marcas y productos)
    const brandMap: Record<string, { revenue: number; cantidad: number }> = {};
    const blacklistWords = [
      "SALDO",
      "INICIAL",
      "FLETE",
      "SERVICIO",
      "AJUSTE",
      "IVA",
      "COBRO",
      "POLO",
      "GORRAS",
      "INSTALACION",
      "ENVOPLAST",
      "VARIOS",
      "PROMO",
    ];

    // const processedItems = linesData
    //   .filter(
    //     (p) =>
    //       !blacklistWords.some((word) =>
    //         p.product_id[1].toUpperCase().includes(word),
    //       ),
    //   )
    //   .map((p) => {
    //     const rawName = p.product_id[1]
    //       .replace(/\[.*?\]/g, "")
    //       .replace(/^\d+-\S+\s+/, "")
    //       .trim();
    //     const brandName = rawName.split(" ")[0].toUpperCase();
    //     const revenue = p.price_subtotal || 0;
    //     if (
    //       brandName.length > 2 &&
    //       !/^\d+$/.test(brandName) &&
    //       !blacklistWords.includes(brandName)
    //     ) {
    //       brandMap[brandName] = (brandMap[brandName] || 0) + revenue;
    //     }
    //     return {
    //       id: p.product_id[0],
    //       name: rawName.substring(0, 25),
    //       brand: brandName,
    //       revenue,
    //       stock: stockMap.get(p.product_id[0]) || 0,
    //     };
    //   });
    // const processedItems = linesData
    //   .filter(
    //     (p) =>
    //       !blacklistWords.some((word) =>
    //         p.product_id[1].toUpperCase().includes(word),
    //       ),
    //   )
    //   .map((p) => {
    //     const rawName = p.product_id[1]
    //       .replace(/\[.*?\]/g, "")
    //       .replace(/^\d+-\S+\s+/, "")
    //       .trim();
    //     const brandName = rawName.split(" ")[0].toUpperCase();
    //     const revenue = p.price_subtotal || 0;

    //     if (
    //       brandName.length > 2 &&
    //       !/^\d+$/.test(brandName) &&
    //       !blacklistWords.includes(brandName)
    //     ) {
    //       brandMap[brandName] = (brandMap[brandName] || 0) + revenue;
    //     }

    //     return {
    //       id: p.product_id[0],
    //       // 👇 AQUÍ QUITAMOS EL .substring(0, 25)
    //       name: rawName,
    //       brand: brandName,
    //       revenue,
    //       // 👇 AQUÍ AGREGAMOS LA CANTIDAD VENDIDA PARA EL FRONTEND
    //       cantidad: p.quantity || 0,
    //       stock: stockMap.get(p.product_id[0]) || 0,
    //     };
    //   });
    const processedItems = linesData
      .filter(
        (p) =>
          !blacklistWords.some((word) =>
            p.product_id[1].toUpperCase().includes(word),
          ),
      )
      .map((p) => {
        const rawName = p.product_id[1]
          .replace(/\[.*?\]/g, "")
          .replace(/^\d+-\S+\s+/, "")
          .trim();
        const brandName = rawName.split(" ")[0].toUpperCase();

        const revenue = p.price_subtotal || 0;
        const cantidad = p.quantity || 0; // Capturamos la cantidad

        if (
          brandName.length > 2 &&
          !/^\d+$/.test(brandName) &&
          !blacklistWords.includes(brandName)
        ) {
          // 2. Si la marca no existe en el mapa, la creamos en 0
          if (!brandMap[brandName]) {
            brandMap[brandName] = { revenue: 0, cantidad: 0 };
          }
          // 3. Sumamos el dinero y las unidades a la marca
          brandMap[brandName].revenue += revenue;
          brandMap[brandName].cantidad += cantidad;
        }

        return {
          id: p.product_id[0],
          name: rawName,
          brand: brandName,
          revenue,
          cantidad,
          stock: stockMap.get(p.product_id[0]) || 0,
        };
      });
    // const sortedBrands = Object.entries(brandMap)
    //   .map(([name, total]) => ({ name, total }))
    //   .sort((a, b) => b.total - a.total);
    const sortedBrands = Object.entries(brandMap)
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        cantidad: data.cantidad,
      }))
      .sort((a, b) => b.revenue - a.revenue);
    // 7. DATOS DE CLIENTES, VENTAS Y VENDEDORES (Promise.all)
    const [clientsRanking, allClientsCount, salesByMonth, sellersData] =
      await Promise.all([
        callOdooRPC<any[]>("account.move", "read_group", [
          invoiceFilters,
          ["amount_total", "partner_id"],
          ["partner_id"],
          0,
          0,
          "amount_total desc",
        ]),
        callOdooRPC<any[]>("account.move", "read_group", [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            companyFilter,
          ],
          ["partner_id"],
          ["partner_id"],
        ]),
        callOdooRPC<any[]>("account.move", "read_group", [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            companyFilter,
          ],
          ["amount_total", "invoice_date"],
          ["invoice_date:month"],
        ]),
        callOdooRPC<any[]>("account.move", "read_group", [
          invoiceFilters,
          ["amount_total", "invoice_user_id"],
          ["invoice_user_id"],
          0,
          5,
          "amount_total desc",
        ]),
      ]);

    // 8. CÁLCULOS Y RESPUESTA
    const monthlyGrowth = (salesByMonth || []).map((s: any) => ({
      month: s["invoice_date:month"],
      total: s.amount_total || 0,
    }));
    const currentMonthTotal = processedItems.reduce((acc, p) => acc + (p.revenue || 0), 0);
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
          // 👇 EL PROBLEMA ESTABA AQUÍ. Asegúrate de que diga b.revenue y no b.total
          .filter((b) => b.revenue > 0)
          .reverse()
          .slice(0, 5),
      },
      salesByUser: (sellersData || [])
        .filter((s: any) => {
          const name = (s.invoice_user_id?.[1] || "").toLowerCase();
          return !name.includes("asistente");
        })
        .map((s: any) => ({
          name: s.invoice_user_id?.[1] || "Sin Vendedor",
          total: s.amount_total || 0,
        })),
      topClients: (clientsRanking || []).slice(0, 10).map((c: any) => ({
        name: c.partner_id?.[1] || "Desconocido",
        total: c.amount_total || 0,
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
