// import { callOdooRPC } from "@/lib/odoo";
// import { NextRequest, NextResponse } from "next/server";

// // Fuerza a que la ruta sea dinámica y no se guarde en caché
// export const dynamic = "force-dynamic";

// export async function GET(request: NextRequest) {
//   try {
//     // 1. OBTENER PARÁMETRO DE SEDE
//     const { searchParams } = new URL(request.url);
//     const companyIdParam = searchParams.get("company_id");

//     // Lógica de filtro dinámico
//     let companyFilter: any[] = [];
//     if (
//       companyIdParam &&
//       companyIdParam !== "all" &&
//       companyIdParam !== "null"
//     ) {
//       companyFilter = ["company_id", "=", parseInt(companyIdParam)];
//     } else {
//       companyFilter = ["company_id", "in", [9, 10, 7]];
//     }

//     // 2. CONFIGURACIÓN DE FECHAS
//     const now = new Date();
//     const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
//       .toISOString()
//       .split("T")[0];

//     // FILTROS BASE
//     const baseFilters = [
//       ["move_id.move_type", "=", "out_invoice"],
//       ["parent_state", "=", "posted"],
//       ["display_type", "=", "product"],
//       ["product_id", "!=", false],
//       companyFilter,
//     ];

//     const currentMonthFilters = [
//       ...baseFilters,
//       ["date", ">=", firstDayOfMonth],
//     ];

//     // 3. OBTENER LÍNEAS DE FACTURACIÓN
//     const linesData =
//       (await callOdooRPC<any[]>("account.move.line", "read_group", [
//         currentMonthFilters,
//         ["price_subtotal", "product_id"],
//         ["product_id"],
//         0,
//         0,
//         "price_subtotal desc",
//       ])) || [];

//     // 4. OBTENER STOCK (Opcional: Si quieres que el stock sea global, no filtres aquí)
//     const productIds = linesData.map((l) => l.product_id[0]);
//     const productsInfo =
//       productIds.length > 0
//         ? (await callOdooRPC<any[]>("product.product", "read", [
//             productIds,
//             ["qty_available"],
//           ])) || []
//         : [];
//     const stockMap = new Map(
//       productsInfo.map((p) => [p.id, p.qty_available || 0]),
//     );

//     // 5. PROCESAMIENTO
//     const brandMap: Record<string, number> = {};
//     const blacklistWords = [
//       "SALDO",
//       "INICIAL",
//       "FLETE",
//       "SERVICIO",
//       "AJUSTE",
//       "IVA",
//       "COBRO",
//       "POLO",
//       "GORRAS",
//       "INSTALACION",
//       "ENVOPLAST",
//       "VARIOS",
//       "PROMO",
//     ];

//     const processedItems = linesData
//       .filter(
//         (p) =>
//           !blacklistWords.some((word) =>
//             p.product_id[1].toUpperCase().includes(word),
//           ),
//       )
//       .map((p) => {
//         const id = p.product_id[0];
//         const rawName = p.product_id[1]
//           .replace(/\[.*?\]/g, "")
//           .replace(/^\d+-\S+\s+/, "")
//           .trim();
//         const brandName = rawName.split(" ")[0].toUpperCase();
//         const revenue = p.price_subtotal || 0;

//         if (
//           brandName.length > 2 &&
//           !/^\d+$/.test(brandName) &&
//           !blacklistWords.includes(brandName)
//         ) {
//           brandMap[brandName] = (brandMap[brandName] || 0) + revenue;
//         }

//         return {
//           id,
//           name: rawName.substring(0, 25),
//           brand: brandName,
//           revenue,
//           stock: stockMap.get(id) || 0,
//         };
//       });

//     const sortedBrands = Object.entries(brandMap)
//       .map(([name, total]) => ({ name, total }))
//       .sort((a, b) => b.total - a.total);

//     // 6. DATOS DE CLIENTES, VENTAS Y VENDEDORES
//     const [clientsRanking, allClientsCount, salesByMonth, sellersData] =
//       await Promise.all([
//         callOdooRPC<any[]>("account.move", "read_group", [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             ["invoice_date", ">=", firstDayOfMonth],
//             companyFilter,
//           ],
//           ["amount_total", "partner_id"],
//           ["partner_id"],
//           0,
//           0,
//           "amount_total desc",
//         ]),
//         callOdooRPC<any[]>("account.move", "read_group", [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             companyFilter,
//           ],
//           ["partner_id"],
//           ["partner_id"],
//         ]),
//         callOdooRPC<any[]>("account.move", "read_group", [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             companyFilter,
//           ],
//           ["amount_total", "invoice_date"],
//           ["invoice_date:month"],
//         ]),
//         callOdooRPC<any[]>("account.move", "read_group", [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             ["invoice_date", ">=", firstDayOfMonth],
//             companyFilter,
//           ],
//           ["amount_total", "invoice_user_id"],
//           ["invoice_user_id"],
//           0,
//           5,
//           "amount_total desc",
//         ]),
//       ]);

//     // 7. CÁLCULOS FINALES
//     const monthlyGrowth = (salesByMonth || []).map((s) => ({
//       month: s["invoice_date:month"],
//       total: s.amount_total || 0,
//     }));
//     const currentMonthTotal =
//       monthlyGrowth[monthlyGrowth.length - 1]?.total || 0;
//     const lastMonthTotal = monthlyGrowth[monthlyGrowth.length - 2]?.total || 1;
//     const growthPercent = (
//       ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) *
//       100
//     ).toFixed(1);

//     return NextResponse.json({
//       topProducts: processedItems.slice(0, 5).map((p) => ({ name: p.name })),
//       bottomProducts: processedItems
//         .filter((p) => p.revenue > 0 && p.stock > 0)
//         .sort((a, b) => a.revenue - b.revenue)
//         .slice(0, 5)
//         .map((p) => ({ name: p.name })),
//       brands: {
//         mostSold: sortedBrands.slice(0, 5),
//         leastSold: sortedBrands
//           .filter((b) => b.total > 0)
//           .reverse()
//           .slice(0, 5),
//       },
//       salesByUser: (sellersData || []).map((s) => ({
//         name: s.invoice_user_id ? s.invoice_user_id[1] : "Sin Vendedor",
//         total: s.amount_total || 0,
//       })),
//       topClients: (clientsRanking || []).slice(0, 5).map((c) => ({
//         name: c.partner_id ? c.partner_id[1] : "Desconocido",
//         total: c.amount_total || 0,
//       })),
//       monthlyGrowth,
//       summary: {
//         totalMonth: currentMonthTotal,
//         activeClientsCount: (allClientsCount || []).length,
//         topProductName: processedItems[0]?.name || "N/A",
//         growthRate: `${parseFloat(growthPercent) > 0 ? "+" : ""}${growthPercent}%`,
//       },
//     });
//   } catch (error: any) {
//     console.error("CRITICAL ERROR STATS API:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

// Fuerza a que la ruta sea dinámica y no se guarde en caché
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // 1. OBTENER PARÁMETRO DE SEDE
    const { searchParams } = new URL(request.url);
    const companyIdParam = searchParams.get("company_id");

    // Lógica de filtro dinámico
    let companyFilter: any[] = [];
    if (
      companyIdParam &&
      companyIdParam !== "all" &&
      companyIdParam !== "null"
    ) {
      companyFilter = ["company_id", "=", parseInt(companyIdParam)];
    } else {
      companyFilter = ["company_id", "in", [9, 10, 7]];
    }

    // 2. CONFIGURACIÓN DE FECHAS
    const now = new Date();
    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split("T")[0];

    // FILTROS BASE
    const baseFilters = [
      ["move_id.move_type", "=", "out_invoice"],
      ["parent_state", "=", "posted"],
      ["display_type", "=", "product"],
      ["product_id", "!=", false],
      companyFilter,
    ];

    const currentMonthFilters = [
      ...baseFilters,
      ["date", ">=", firstDayOfMonth],
    ];

    // 3. OBTENER LÍNEAS DE FACTURACIÓN
    const linesData =
      (await callOdooRPC<any[]>("account.move.line", "read_group", [
        currentMonthFilters,
        // 👇 CAMBIO 1: Agregamos "quantity" para obtener las unidades
        ["price_subtotal", "quantity", "product_id"],
        ["product_id"],
        0,
        0,
        "price_subtotal desc",
      ])) || [];

    // 4. OBTENER STOCK (Opcional: Si quieres que el stock sea global, no filtres aquí)
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

    // 5. PROCESAMIENTO
    // 👇 CAMBIO 2: Cambiamos brandMap para almacenar revenue y cantidad
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

        return {
          id,
          // 👇 CAMBIO 3: Quitamos el .substring(0, 25) para enviar el nombre completo
          name: rawName,
          brand: brandName,
          revenue,
          cantidad, // Agregamos la cantidad al producto
          stock: stockMap.get(id) || 0,
        };
      });

    const sortedBrands = Object.entries(brandMap)
      .map(([name, data]) => ({
        name,
        revenue: data.revenue,
        cantidad: data.cantidad,
      }))
      .sort((a, b) => b.revenue - a.revenue);

    // 6. DATOS DE CLIENTES, VENTAS Y VENDEDORES
    const [clientsRanking, allClientsCount, salesByMonth, sellersData] =
      await Promise.all([
        callOdooRPC<any[]>("account.move", "read_group", [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["invoice_date", ">=", firstDayOfMonth],
            companyFilter,
          ],
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
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["invoice_date", ">=", firstDayOfMonth],
            companyFilter,
          ],
          ["amount_total", "invoice_user_id"],
          ["invoice_user_id"],
          0,
          5,
          "amount_total desc",
        ]),
      ]);

    // 7. CÁLCULOS FINALES
    const monthlyGrowth = (salesByMonth || []).map((s) => ({
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
      // 👇 CAMBIO 4: Quitamos .map((p) => ({ name: p.name })) en topProducts y bottomProducts
      // para que el frontend reciba el revenue y cantidad de los productos
      topProducts: processedItems.slice(0, 5),
      bottomProducts: processedItems
        .filter((p) => p.revenue > 0 && p.stock > 0)
        .sort((a, b) => a.revenue - b.revenue)
        .slice(0, 5),
      brands: {
        mostSold: sortedBrands.slice(0, 5),
        leastSold: sortedBrands
          .filter((b) => b.revenue > 0) // Cambiado a b.revenue
          .reverse()
          .slice(0, 5),
      },
      salesByUser: (sellersData || [])
        .filter((s) => {
          const name = (s.invoice_user_id?.[1] || "").toLowerCase();
          return !name.includes("asistente");
        })
        .map((s) => ({
          name: s.invoice_user_id ? s.invoice_user_id[1] : "Sin Vendedor",
          total: s.amount_total || 0,
        })),
      topClients: (clientsRanking || [])
        .slice(0, 10)
        .map((c) => ({
          name: c.partner_id ? c.partner_id[1] : "Desconocido",
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
