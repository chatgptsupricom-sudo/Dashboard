// import { callOdooRPC } from "@/lib/odoo";
// import { NextResponse } from "next/server";

// export async function GET(request: Request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const companyId = searchParams.get("company_id"); // Filtro opcional por empresa

//     // Filtros base
//     const baseFilters: any[] = [
//       ["move_type", "=", "out_invoice"],
//       ["state", "=", "posted"],
//     ];
//     if (companyId && companyId !== "all") {
//       baseFilters.push(["company_id", "=", parseInt(companyId)]);
//     }

//     // 1. VENTAS POR COMPAÑÍA (Comparativo)
//     const companySales =
//       (await callOdooRPC<any[]>("account.move", "read_group", [
//         baseFilters,
//         ["amount_total", "company_id"],
//         ["company_id"],
//       ])) || [];

//     // 2. VENTAS POR ZONA GEOGRÁFICA (A través del Estado del Partner)
//     const zoneSales =
//       (await callOdooRPC<any[]>("account.move", "read_group", [
//         baseFilters,
//         ["amount_total", "partner_id"],
//         ["partner_id"],
//       ])) || [];

//     // 3. PRODUCTOS MÁS RENTABLES (Margen de contribución estimado)
//     const topProducts =
//       (await callOdooRPC<any[]>("account.move.line", "read_group", [
//         [
//           ["move_id.move_type", "=", "out_invoice"],
//           ["parent_state", "=", "posted"],
//           ["display_type", "=", "product"],
//         ],
//         ["price_subtotal", "product_id"],
//         ["product_id"],
//         0,
//         10,
//         "price_subtotal desc",
//       ])) || [];

//     // 4. LISTA DE EMPRESAS DISPONIBLES (Para el filtro)
//     const companies = await callOdooRPC<any[]>("res.company", "search_read", [
//       [],
//       ["name"],
//     ]);

//     return NextResponse.json({
//       summary: {
//         totalRevenue: companySales.reduce(
//           (acc, curr) => acc + curr.amount_total,
//           0,
//         ),
//         activeCompanies: companies.length,
//         topCompany:
//           companySales.sort((a, b) => b.amount_total - a.amount_total)[0]
//             ?.company_id[1] || "N/A",
//       },
//       companyPerformance: companySales.map((c) => ({
//         name: c.company_id[1],
//         total: c.amount_total,
//       })),
//       productRanking: topProducts.map((p) => ({
//         name: p.product_id[1].replace(/\[.*?\]/g, "").trim(),
//         value: p.price_subtotal,
//       })),
//       companies: companies.map((c) => ({ id: c.id, name: c.name })),
//     });
//   } catch (error: any) {
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const auth = await requireRoles(req, ["superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(req.url);
    const companyId = searchParams.get("company_id");
    const dateFrom = searchParams.get("date_from");
    const dateTo = searchParams.get("date_to");

    // 1. Filtros Base
    const baseFilters: any[] = [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
    ];

    if (companyId && companyId !== "all") {
      baseFilters.push(["company_id", "=", parseInt(companyId)]);
    }
    if (dateFrom) baseFilters.push(["invoice_date", ">=", dateFrom]);
    if (dateTo) baseFilters.push(["invoice_date", "<=", dateTo]);

    // 2. Ejecutar consultas
    // Ventas totales (search_read es más seguro para cálculos en JS)
    const salesData = await callOdooRPC<any[]>("account.move", "search_read", [
      baseFilters,
      ["amount_total", "partner_id", "invoice_user_id"],
    ]);

    // Ventas por Producto (read_group)
    // 3. Obtener Ventas por Producto (Filtrando basura contable)
    const brandSales = await callOdooRPC<any[]>(
      "account.move.line",
      "read_group",
      [
        [
          ["move_id.move_type", "=", "out_invoice"],
          ["parent_state", "=", "posted"],
        ],
        ["price_subtotal:sum", "product_id"],
        ["product_id"],
      ],
    );

    // Añade este log en tu API para ver qué recibes en el servidor
    console.log("Datos de Odoo recibidos:", brandSales);

    const companySales = await callOdooRPC<any[]>(
      "account.move",
      "read_group",
      [baseFilters, ["amount_total:sum", "company_id"], ["company_id"]],
    );

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

    const groupedByBrand = brandSales.reduce((acc: any, b: any) => {
      // Protección
      if (!b.product_id || !b.product_id[1]) return acc;

      // Limpiamos el nombre y extraemos la marca (primera palabra)
      const fullDescription =
        b.product_id[1].split("]")[1]?.trim() || b.product_id[1];
      const brand = fullDescription.split(" ")[0].toUpperCase();

      // Aplicar Blacklist
      const isBlacklisted = blacklistWords.some((word) => brand.includes(word));
      if (isBlacklisted) return acc;

      // Agrupar y sumar
      acc[brand] = (acc[brand] || 0) + Number(b.price_subtotal);
      return acc;
    }, {});

    const formattedBrands = Object.entries(groupedByBrand)
      .map(([name, ventas]) => ({
        name,
        ventas: Number((ventas as number).toFixed(2)),
      }))
      .sort((a: any, b: any) => b.ventas - a.ventas)
      .slice(0, 8);

    // Ventas por Vendedor (read_group)
    const sellerSales = await callOdooRPC<any[]>("account.move", "read_group", [
      baseFilters,
      ["amount_total:sum", "invoice_user_id"],
      ["invoice_user_id"],
    ]);

    // 3. Procesamiento y Ordenamiento
    const totalRevenue = salesData.reduce(
      (acc, curr) => acc + (curr.amount_total || 0),
      0,
    );
    const totalSellers = new Set(salesData.map((s) => s.invoice_user_id?.[0]))
      .size;
    const newClients = new Set(salesData.map((s) => s.partner_id?.[0])).size;

    // Ordenar Marcas por ventas (descendente)
    const sortedBrands = brandSales
      .filter((b) => b.product_id)
      .sort((a, b) => b.price_subtotal - a.price_subtotal);

    // Ordenar Vendedores por monto (descendente)
    const sortedSellers = sellerSales
      .filter((s) => s.invoice_user_id)
      .sort((a, b) => b.amount_total - a.amount_total);

    const topBrand =
      formattedBrands.length > 0 ? formattedBrands[0].name : "Sin ventas";

    // 1. Filtrar los productos (aplicando tu blacklist)
    // 1. Filtrar los productos (aplicando tu blacklist)
    const filteredProducts = brandSales
      .filter((b) => {
        if (!b.product_id || !b.product_id[1]) return false;
        const productName = b.product_id[1].toUpperCase();
        return !blacklistWords.some((word) => productName.includes(word));
      })
      .sort((a, b) => b.price_subtotal - a.price_subtotal); // Ordenar por ventas reales

    // 2. Definir el Producto Top (el primero de la lista ordenada)
    const topProduct =
      filteredProducts.length > 0
        ? filteredProducts[0].product_id[1].split("]")[1]?.trim() ||
          filteredProducts[0].product_id[1]
        : "Sin ventas";

    // 4. Respuesta consolidada
    return NextResponse.json({
      summary: {
        totalRevenue,
        totalSellers,
        newClients,
        topBrand: topProduct,
      },
      salesByBrand: formattedBrands,
      salesBySeller: sortedSellers.map((s) => ({
        name: s.invoice_user_id ? s.invoice_user_id[1] : "Sin vendedor",
        total: Number(s.amount_total),
      })),
      companies: await callOdooRPC<any[]>("res.company", "search_read", [
        [],
        ["name"],
      ]),
    });
  } catch (error: any) {
    console.error("Error en API Odoo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
