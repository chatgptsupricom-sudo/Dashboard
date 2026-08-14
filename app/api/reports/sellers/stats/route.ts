// app/api/reports/sellers/stats/route.ts
import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const sellerName = searchParams.get("sellerName");

    if (!sellerName) {
      return NextResponse.json(
        { error: "Falta el parámetro sellerName" },
        { status: 400 },
      );
    }

    // 1. Obtener actividades y tareas locales del mes en curso
    const [activities]: any = await db.execute(
      `
      SELECT
        COUNT(*) as total_assigned,
        SUM(CASE WHEN CONVERT(status USING utf8mb4) = 'culminada' THEN 1 ELSE 0 END) as total_completed
      FROM activities
      WHERE
        (CONVERT(assigned_by USING utf8mb4) = ? OR CONVERT(user_email USING utf8mb4) = (
          SELECT CONVERT(email USING utf8mb4) FROM users_config WHERE CONVERT(name USING utf8mb4) = ? LIMIT 1
        ))
        AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE())
    `,
      [sellerName, sellerName],
    );

    // 2. Variables comerciales Odoo
    let totalRevenueMonth = 0;
    let totalOrdersMonth = 0;
    let productPerformance: any[] = [];

    // Obtener días transcurridos en el mes actual (excluyendo domingos) para el promedio diario
    const date = new Date();
    let workingDaysPassed = 0;
    for (let d = 1; d <= date.getDate(); d++) {
      const checkDate = new Date(date.getFullYear(), date.getMonth(), d);
      if (checkDate.getDay() !== 0) workingDaysPassed++;
    }
    if (workingDaysPassed === 0) workingDaysPassed = 1;

    try {
      // Buscar ID del usuario en Odoo por su nombre
      const sellerIds = await callOdooRPC<number[]>("res.users", "search", [
        [["name", "=", sellerName]],
      ]);

      if (sellerIds && sellerIds.length > 0) {
        const odooUserId = sellerIds[0];

        // Obtener líneas de venta confirmadas del mes actual
        const currentMonthStart = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01 00:00:00`;
        const saleLines = await callOdooRPC<any[]>(
          "sale.order.line",
          "search_read",
          [
            [
              ["order_id.user_id", "=", odooUserId],
              ["order_id.state", "in", ["sale", "done"]],
              ["order_id.date_order", ">=", currentMonthStart],
            ],
          ],
          {
            fields: [
              "product_id",
              "product_uom_qty",
              "price_subtotal",
              "order_id",
            ],
          },
        );

        if (saleLines && saleLines.length > 0) {
          const productMap: {
            [key: string]: { units: number; revenue: number };
          } = {};
          const uniqueOrders = new Set();

          saleLines.forEach((line: any) => {
            if (line.order_id) uniqueOrders.add(line.order_id[0]);

            if (line.product_id) {
              const prodName = line.product_id[1];
              if (!productMap[prodName]) {
                productMap[prodName] = { units: 0, revenue: 0 };
              }
              productMap[prodName].units += line.product_uom_qty || 0;
              productMap[prodName].revenue += line.price_subtotal || 0;
              totalRevenueMonth += line.price_subtotal || 0;
            }
          });

          totalOrdersMonth = uniqueOrders.size;

          productPerformance = Object.keys(productMap)
            .map((name) => ({
              product_name: name,
              units_sold: productMap[name].units,
              total_revenue_usd: productMap[name].revenue,
            }))
            .sort((a, b) => b.units_sold - a.units_sold);
        }
      }
    } catch (odooError) {
      console.error("Error en Odoo RPC:", odooError);
    }

    // Definición de Objetivos (Cuotas) de Supricom
    const targetRevenueMonth = 5000; // Objetivo mensual base de ejemplo en USD
    const targetRevenuePerDay = targetRevenueMonth / 26; // 26 días hábiles promedio
    const actualRevenuePerDay = totalRevenueMonth / workingDaysPassed;

    const performanceData = {
      seller: sellerName,
      metrics: {
        totalRevenue: totalRevenueMonth,
        totalOrders: totalOrdersMonth,
        revenueTargetDay: Math.round(targetRevenuePerDay),
        revenueActualDay: Math.round(actualRevenuePerDay),
        revenuePerformancePercent:
          targetRevenuePerDay > 0
            ? ((actualRevenuePerDay / targetRevenuePerDay) * 100).toFixed(1)
            : 0,
        activityCompletionRate:
          activities[0]?.total_assigned > 0
            ? (
                (activities[0].total_completed / activities[0].total_assigned) *
                100
              ).toFixed(1)
            : 0,
        productsArray: productPerformance,
      },
    };

    return NextResponse.json(performanceData);
  } catch (error) {
    console.error("Error en reporte de vendedor:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
