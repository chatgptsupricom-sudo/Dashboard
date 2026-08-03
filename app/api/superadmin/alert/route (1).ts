// // import { callOdooRPC } from "@/lib/odoo";
// // import { NextResponse } from "next/server";

// // export async function GET() {
// //   try {
// //     const today = new Date();
// //     const COMPANY_IDS = [9]; // Definimos las empresas objetivo

// //     // Configuración de fechas
// //     const threeDaysAgo = new Date();
// //     threeDaysAgo.setDate(today.getDate() - 3);
// //     const dateLimit3Days = threeDaysAgo.toISOString().split("T")[0];

// //     const thirtyDaysAgo = new Date();
// //     thirtyDaysAgo.setDate(today.getDate() - 30);
// //     const dateLimit30 = thirtyDaysAgo.toISOString().split("T")[0];

// //     const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

// //     const [
// //       facturasVencidas,
// //       movimientosRecientes,
// //       productos,
// //       usuarios,
// //       clientesInactivosRaw,
// //     ] = await Promise.all([
// //       // 1. Facturas vencidas de clientes por empresa
// //       callOdooRPC(
// //         "account.move",
// //         "search_read",
// //         [
// //           [
// //             ["move_type", "=", "out_invoice"], // Solo facturas de clientes
// //             ["state", "=", "posted"],
// //             ["payment_state", "in", ["not_paid", "partial"]],
// //             ["invoice_date_due", "<", dateLimit3Days],
// //             ["company_id", "in", COMPANY_IDS],
// //           ],
// //         ],
// //         { fields: ["name", "partner_id", "invoice_date_due", "amount_total"] },
// //       ),

// //       // 2. Facturas de últimas 24h por empresa
// //       callOdooRPC(
// //         "account.move",
// //         "search_read",
// //         [
// //           [
// //             ["move_type", "=", "out_invoice"],
// //             ["state", "=", "posted"],
// //             ["create_date", ">", yesterday],
// //             ["company_id", "in", COMPANY_IDS],
// //           ],
// //         ],
// //         { fields: ["invoice_user_id"] },
// //       ),

// //       // 3. Productos con stock crítico filtrados por empresa
// //       callOdooRPC(
// //         "product.product",
// //         "search_read",
// //         [
// //           [
// //             ["qty_available", "<=", 5],
// //             ["company_id", "in", [...COMPANY_IDS, false]], // Incluimos 'false' para productos globales
// //           ],
// //         ],
// //         { fields: ["name", "qty_available"], limit: 10 },
// //       ),

// //       // 4. Usuarios totales activos
// //       callOdooRPC("res.users", "search_read", [[["active", "=", true]]], {
// //         fields: ["name", "id"],
// //       }),

// //       // 5. Clientes inactivos por empresa
// //       callOdooRPC(
// //         "account.move",
// //         "search_read",
// //         [
// //           [
// //             ["move_type", "=", "out_invoice"],
// //             ["state", "=", "posted"],
// //             ["invoice_date", "<", dateLimit30],
// //             ["company_id", "in", COMPANY_IDS],
// //           ],
// //         ],
// //         { fields: ["partner_id", "invoice_date"], order: "invoice_date desc" },
// //       ),
// //     ]);

// //     // Lógica de procesamiento de seguridad de tipos
// //     const facturasList = Array.isArray(facturasVencidas)
// //       ? facturasVencidas
// //       : [];
// //     const movsList = Array.isArray(movimientosRecientes)
// //       ? movimientosRecientes
// //       : [];
// //     const usuariosList = Array.isArray(usuarios) ? usuarios : [];
// //     const productosList = Array.isArray(productos) ? productos : [];
// //     const clientesList = Array.isArray(clientesInactivosRaw)
// //       ? clientesInactivosRaw
// //       : [];

// //     // Vendedores que no han hecho movimientos en las últimas 24h
// //     const usuariosActivosIds = new Set(
// //       movsList
// //         .filter((m) => m.invoice_user_id && Array.isArray(m.invoice_user_id))
// //         .map((m) => m.invoice_user_id[0]),
// //     );
// //     const vendedoresInactivos = usuariosList.filter(
// //       (u) => !usuariosActivosIds.has(u.id),
// //     );

// //     // Mapeo único de clientes sin actividad en 30 días
// //     const clientesInactivosUnicos = Array.from(
// //       new Map(
// //         clientesList
// //           .filter((c) => c.partner_id)
// //           .map((c) => [
// //             c.partner_id[0],
// //             { id: c.partner_id[0], name: c.partner_id[1] },
// //           ]),
// //       ).values(),
// //     );

// //     return NextResponse.json({
// //       alertas: {
// //         vencimiento_facturas: facturasList,
// //         vendedores_inactivos: vendedoresInactivos,
// //         productos_alerta: productosList,
// //         inactividad_clientes: clientesInactivosUnicos,
// //       },
// //     });
// //   } catch (error: any) {
// //     console.error("Error en API alertas:", error);
// //     return NextResponse.json({ error: error.message }, { status: 500 });
// //   }
// // }
// import { callOdooRPC } from "@/lib/odoo";
// import { NextRequest, NextResponse } from "next/server";

// // Mapeo de empresas a sus IDs de Odoo
// const COMPANY_MAP: Record<string, number> = {
//   valencia: 9,
//   caracas: 10,
//   panama: 7,
// };

// export async function GET(request: NextRequest) {
//   try {
//     const today = new Date();

//     // 1. Obtener el parámetro 'empresa' de la URL (ej: ?empresa=caracas)
//     const { searchParams } = new URL(request.url);
//     const empresaParam = searchParams.get("empresa")?.toLowerCase();

//     // 2. Determinar qué IDs usar. Si es válido usa ese, si no, por defecto Valencia [9]
//     // (Puedes cambiarlo para que si no viene ninguno, use todos: [9, 10, 7])
//     let COMPANY_IDS = [9];
//     if (empresaParam && COMPANY_MAP[empresaParam]) {
//       COMPANY_IDS = [COMPANY_MAP[empresaParam]];
//     }

//     // Configuración de fechas
//     const threeDaysAgo = new Date();
//     threeDaysAgo.setDate(today.getDate() - 3);
//     const dateLimit3Days = threeDaysAgo.toISOString().split("T")[0];

//     const thirtyDaysAgo = new Date();
//     thirtyDaysAgo.setDate(today.getDate() - 30);
//     const dateLimit30 = thirtyDaysAgo.toISOString().split("T")[0];

//     const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

//     const [
//       facturasVencidas,
//       movimientosRecientes,
//       productos,
//       usuarios,
//       clientesInactivosRaw,
//     ] = await Promise.all([
//       // 1. Facturas vencidas de clientes por empresa
//       callOdooRPC(
//         "account.move",
//         "search_read",
//         [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             ["payment_state", "in", ["not_paid", "partial"]],
//             ["invoice_date_due", "<", dateLimit3Days],
//             ["company_id", "in", COMPANY_IDS],
//           ],
//         ],
//         {
//           fields: [
//             "name",
//             "partner_id",
//             "invoice_date_due",
//             "amount_total",
//             "invoice_user_id", // <- Añadido: Vendedor
//             "invoice_line_ids", // <- Añadido: IDs de las líneas de producto
//           ],
//         },
//       ),

//       // 2. Facturas de últimas 24h por empresa
//       callOdooRPC(
//         "account.move",
//         "search_read",
//         [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             ["create_date", ">", yesterday],
//             ["company_id", "in", COMPANY_IDS],
//           ],
//         ],
//         { fields: ["invoice_user_id"] },
//       ),

//       // 3. Productos con stock crítico filtrados por empresa
//       callOdooRPC(
//         "product.product",
//         "search_read",
//         [
//           [
//             ["qty_available", "<=", 5],
//             ["company_id", "in", [...COMPANY_IDS, false]], // Incluye globales
//           ],
//         ],
//         { fields: ["name", "qty_available"], limit: 10 },
//       ),

//       // 4. Usuarios totales activos
//       callOdooRPC("res.users", "search_read", [[["active", "=", true]]], {
//         fields: ["name", "id"],
//       }),

//       // 5. Clientes inactivos por empresa
//       callOdooRPC(
//         "account.move",
//         "search_read",
//         [
//           [
//             ["move_type", "=", "out_invoice"],
//             ["state", "=", "posted"],
//             ["invoice_date", "<", dateLimit30],
//             ["company_id", "in", COMPANY_IDS],
//           ],
//         ],
//         { fields: ["partner_id", "invoice_date"], order: "invoice_date desc" },
//       ),
//     ]);

//     // Lógica de procesamiento de seguridad de tipos
//     const facturasList = Array.isArray(facturasVencidas)
//       ? facturasVencidas
//       : [];
//     const movsList = Array.isArray(movimientosRecientes)
//       ? movimientosRecientes
//       : [];
//     const usuariosList = Array.isArray(usuarios) ? usuarios : [];
//     const productosList = Array.isArray(productos) ? productos : [];
//     const clientesList = Array.isArray(clientesInactivosRaw)
//       ? clientesInactivosRaw
//       : [];

//     // Vendedores que no han hecho movimientos en las últimas 24h
//     const usuariosActivosIds = new Set(
//       movsList
//         .filter((m) => m.invoice_user_id && Array.isArray(m.invoice_user_id))
//         .map((m) => m.invoice_user_id[0]),
//     );
//     const vendedoresInactivos = usuariosList.filter(
//       (u) => !usuariosActivosIds.has(u.id),
//     );

//     // Mapeo único de clientes sin actividad en 30 días
//     const clientesInactivosUnicos = Array.from(
//       new Map(
//         clientesList
//           .filter((c) => c.partner_id)
//           .map((c) => [
//             c.partner_id[0],
//             { id: c.partner_id[0], name: c.partner_id[1] },
//           ]),
//       ).values(),
//     );

//     return NextResponse.json({
//       alertas: {
//         vencimiento_facturas: facturasList,
//         vendedores_inactivos: vendedoresInactivos,
//         productos_alerta: productosList,
//         inactividad_clientes: clientesInactivosUnicos,
//       },
//     });
//   } catch (error: any) {
//     console.error("Error en API alertas:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { callOdooRPC } from "@/lib/odoo";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

const VENDEDOR_EXCLUSIONS: Record<number, string[]> = {
  9: ["bladimir vasquez", "asistente de ventas"],
  10: ["antonella zampetti", "asistente de ventas"],
  7: ["hercilio camacho", "asistente de ventas"],
};

export async function GET(request: NextRequest) {
  try {
    const today = new Date();
    const { searchParams } = new URL(request.url);
    const empresaParam = searchParams.get("empresa")?.toLowerCase();

    let COMPANY_IDS = [9];
    if (empresaParam && COMPANY_MAP[empresaParam]) {
      COMPANY_IDS = [COMPANY_MAP[empresaParam]];
    }
    const companyId = COMPANY_IDS[0];

    const todayStr = today.toISOString().split("T")[0];
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(today.getDate() + 3);
    const dateLimit3Days = threeDaysFromNow.toISOString().split("T")[0];

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    const dateLimit30 = thirtyDaysAgo.toISOString().split("T")[0];

    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(today.getDate() - 60);
    const dateLimit60 = sixtyDaysAgo.toISOString().split("T")[0];

    // Venezuela = UTC-4; 2pm VE = 18:00 UTC
    const VE_OFFSET_MS = 4 * 60 * 60 * 1000;
    const nowVE = new Date(Date.now() - VE_OFFSET_MS);
    const todayVE = nowVE.toISOString().split("T")[0];
    const dayOfWeekVE = nowVE.getUTCDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeekVE === 0 || dayOfWeekVE === 6;
    const startOfDayVEinUTC = `${todayVE} 04:00:00`; // midnight VE in UTC
    const cutoff2pmVEinUTC = `${todayVE} 18:00:00`; // 2pm VE in UTC

    const thirtyDaysAgoVE = new Date(nowVE);
    thirtyDaysAgoVE.setDate(nowVE.getUTCDate() - 30);
    const date30VE = thirtyDaysAgoVE.toISOString().split("T")[0];

    const firstOfMonthVE = `${todayVE.slice(0, 7)}-01`;

    const [
      facturasVencidasRaw,
      currentLines,
      priorLines,
      ordersThisMonthRaw,
      ordersTodayAfter2pmRaw,
      clientesInactivosRaw,
      moraAvanzadaRaw,
      devolucionesRecientesRaw,
      facturasBajoMinimoRaw,
      facturasMesVendedoresRaw,
      facturasHoyRaw,
    ] = await Promise.all([
      // 1. Facturas vencidas de clientes por empresa
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["payment_state", "in", ["not_paid", "partial"]],
            ["invoice_date_due", ">=", todayStr],
            ["invoice_date_due", "<=", dateLimit3Days],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: [
            "name",
            "partner_id",
            "invoice_date_due",
            "amount_untaxed",
            "amount_tax",
            "amount_total",
            "invoice_user_id",
            "invoice_line_ids",
          ],
        },
      ),

      // 3a. Líneas de ventas — período actual (últimos 30 días)
      callOdooRPC(
        "sale.order.line",
        "search_read",
        [
          [
            ["order_id.state", "in", ["sale", "done"]],
            ["order_id.date_order", ">=", `${dateLimit30} 00:00:00`],
            ["order_id.date_order", "<=", `${todayStr} 23:59:59`],
            ["order_id.company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: ["product_id", "product_uom_qty", "price_subtotal"],
          limit: 5000,
        },
      ),

      // 3b. Líneas de ventas — período anterior (días 31-60)
      callOdooRPC(
        "sale.order.line",
        "search_read",
        [
          [
            ["order_id.state", "in", ["sale", "done"]],
            ["order_id.date_order", ">=", `${dateLimit60} 00:00:00`],
            ["order_id.date_order", "<=", `${dateLimit30} 23:59:59`],
            ["order_id.company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: ["product_id", "product_uom_qty", "price_subtotal"],
          limit: 5000,
        },
      ),

      // 4. Pedidos del mes actual — para stats de vendedores
      callOdooRPC(
        "sale.order",
        "search_read",
        [
          [
            ["state", "in", ["sale", "done"]],
            ["date_order", ">=", `${firstOfMonthVE} 00:00:00`],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: ["user_id", "partner_id", "date_order", "amount_untaxed"],
          limit: 5000,
        },
      ),

      // 5. Pedidos de hoy (cualquier hora) — para saber quién ya vendió algo hoy
      callOdooRPC(
        "sale.order",
        "search_read",
        [
          [
            ["state", "in", ["sale", "done"]],
            ["date_order", ">=", startOfDayVEinUTC],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        { fields: ["user_id", "date_order"], limit: 1000 },
      ),

      // 6. Historial de facturas (hasta 3 años) — base real para inactividad de clientes
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            [
              "invoice_date",
              ">=",
              (() => {
                const d = new Date();
                d.setFullYear(d.getFullYear() - 3);
                return d.toISOString().split("T")[0];
              })(),
            ],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: [
            "partner_id",
            "invoice_user_id",
            "invoice_date",
            "amount_total",
            "name",
            "id",
          ],
          order: "invoice_date desc",
          limit: 20000,
        },
      ),

      // 7. Clientes en mora avanzada (facturas +30 días vencidas)
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["payment_state", "in", ["not_paid", "partial"]],
            ["invoice_date_due", "<", dateLimit30],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: [
            "name",
            "partner_id",
            "invoice_date_due",
            "amount_untaxed",
            "amount_tax",
            "amount_total",
            "invoice_user_id",
            "invoice_line_ids",
          ],
        },
      ),

      // 8. Devoluciones recientes (notas de crédito últimas 24h)
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_refund"],
            ["state", "=", "posted"],
            ["invoice_date", ">=", dateLimit30],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: [
            "name",
            "partner_id",
            "invoice_date",
            "amount_total",
            "amount_untaxed",
            "invoice_user_id",
            "invoice_line_ids",
          ],
        },
      ),

      // 9. Facturas por debajo del mínimo de venta ($200)
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["amount_total", "<", 200],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: [
            "name",
            "partner_id",
            "invoice_date",
            "amount_total",
            "amount_untaxed",
            "invoice_user_id",
            "invoice_line_ids",
          ],
        },
      ),

      // 10. Facturas del mes — para stats de vendedores basados en facturación
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["invoice_date", ">=", `${firstOfMonthVE} 00:00:00`],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        {
          fields: ["invoice_user_id", "partner_id", "invoice_date", "amount_untaxed", "invoice_line_ids"],
          limit: 5000,
        },
      ),

      // 11. Facturas de hoy — para saber quiénes facturaron hoy (sin límite de mes)
      callOdooRPC(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["invoice_date", "=", todayVE],
            ["company_id", "in", COMPANY_IDS],
          ],
        ],
        { fields: ["invoice_user_id"] },
      ),
    ]);

    // Asegurar listas base
    let facturasList = Array.isArray(facturasVencidasRaw)
      ? facturasVencidasRaw
      : [];
    const ordersThisMonth = Array.isArray(ordersThisMonthRaw)
      ? ordersThisMonthRaw
      : [];
    const ordersTodayAfter2pm = Array.isArray(ordersTodayAfter2pmRaw)
      ? ordersTodayAfter2pmRaw
      : [];

    // Calcular caída de ventas por producto (unidades + monto)
    function aggregateByProduct(
      lines: any[],
    ): Record<number, { name: string; qty: number; amount: number }> {
      const map: Record<number, { name: string; qty: number; amount: number }> =
        {};
      for (const l of Array.isArray(lines) ? lines : []) {
        if (!l.product_id) continue;
        const id = l.product_id[0];
        if (!map[id])
          map[id] = { name: l.product_id[1] || "", qty: 0, amount: 0 };
        map[id].qty += l.product_uom_qty || 0;
        map[id].amount += l.price_subtotal || 0;
      }
      return map;
    }
    const currentMap = aggregateByProduct(currentLines);
    const priorMap = aggregateByProduct(priorLines);

    // P75 dinámico basado en monto (más representativo de "producto estrella")
    const priorAmounts = Object.values(priorMap)
      .map((p) => p.amount)
      .filter((a) => a > 0)
      .sort((a, b) => a - b);
    const p75Index = Math.floor(priorAmounts.length * 0.75);
    const p75AmountThreshold = priorAmounts[p75Index] ?? 0;

    // P75 también sobre unidades
    const priorQtys = Object.values(priorMap)
      .map((p) => p.qty)
      .filter((q) => q > 0)
      .sort((a, b) => a - b);
    const p75QtyThreshold = priorQtys[Math.floor(priorQtys.length * 0.75)] ?? 0;

    let productosCaida = Object.entries(priorMap)
      .filter(
        ([, prior]) =>
          (prior.amount >= p75AmountThreshold && prior.amount > 0) ||
          (prior.qty >= p75QtyThreshold && prior.qty > 0),
      )
      .map(([idStr, prior]) => {
        const id = Number(idStr);
        const cur = currentMap[id] || { qty: 0, amount: 0 };
        const decline_qty_pct =
          prior.qty > 0
            ? Math.round(((prior.qty - cur.qty) / prior.qty) * 100)
            : 0;
        const decline_amt_pct =
          prior.amount > 0
            ? Math.round(((prior.amount - cur.amount) / prior.amount) * 100)
            : 0;
        const decline_pct = Math.max(decline_qty_pct, decline_amt_pct);
        return {
          id,
          name: prior.name,
          current_qty: Math.round(cur.qty),
          prior_qty: Math.round(prior.qty),
          current_amount: Math.round(cur.amount),
          prior_amount: Math.round(prior.amount),
          decline_qty_pct,
          decline_amt_pct,
          decline_pct,
        };
      })
      .filter((p) => p.decline_pct > 30)
      .sort((a, b) => b.decline_pct - a.decline_pct)
      .slice(0, 20);

    // ── Enriquecer productos en caída con última venta, cliente, vendedor ──
    if (productosCaida.length > 0) {
      const productoIds = productosCaida.map((p) => p.id);

      const productSaleLines = await callOdooRPC(
        "sale.order.line",
        "search_read",
        [[
          ["product_id", "in", productoIds],
          ["order_id.state", "in", ["sale", "done"]],
        ]],
        {
          fields: ["product_id", "order_id", "price_subtotal"],
          limit: 10000,
        },
      );

      if (Array.isArray(productSaleLines) && productSaleLines.length > 0) {
        const orderIdsSet = new Set<number>();
        for (const l of productSaleLines) {
          if (l.order_id && Array.isArray(l.order_id)) orderIdsSet.add(l.order_id[0]);
        }
        const orderIds = [...orderIdsSet];

        let ordersMap: Record<number, any> = {};
        if (orderIds.length > 0) {
          const orders = await callOdooRPC(
            "sale.order",
            "search_read",
            [[["id", "in", orderIds]]],
            { fields: ["partner_id", "user_id", "date_order"], limit: 5000 },
          );
          if (Array.isArray(orders)) {
            for (const o of orders) ordersMap[o.id] = o;
          }
        }

        const linesByProduct: Record<number, any[]> = {};
        for (const l of productSaleLines) {
          if (!l.product_id || !Array.isArray(l.product_id)) continue;
          const pid = l.product_id[0];
          if (!linesByProduct[pid]) linesByProduct[pid] = [];
          const oid = Array.isArray(l.order_id) ? l.order_id[0] : null;
          const order = oid ? ordersMap[oid] : null;
          linesByProduct[pid].push({
            price_subtotal: l.price_subtotal || 0,
            date_order: order?.date_order || "",
            partner: order?.partner_id || null,
            user: order?.user_id || null,
          });
        }

        productosCaida = productosCaida.map((p) => {
          const lines = linesByProduct[p.id] || [];
          const sorted = [...lines].sort((a, b) => b.date_order.localeCompare(a.date_order));
          const last = sorted[0] || null;

          const sellerAmounts: Record<string, number> = {};
          for (const l of sorted) {
            const sName = Array.isArray(l.user) ? l.user[1] : "—";
            sellerAmounts[sName] = (sellerAmounts[sName] || 0) + (l.price_subtotal || 0);
          }
          const topSeller = Object.entries(sellerAmounts)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || "—";

          return {
            ...p,
            last_sale_date: last?.date_order?.split(" ")[0] || "—",
            last_client: Array.isArray(last?.partner) ? last.partner[1] : "—",
            last_client_amount: Math.round(last?.price_subtotal || 0),
            top_seller: topSeller,
          };
        });
      }
    }

    // === NUEVA LÓGICA: Resolver las líneas de las facturas vencidas ===
    if (facturasList.length > 0) {
      // Recolectar todos los IDs de líneas que pertenecen a estas facturas
      const allLineIds = facturasList.flatMap((f) => f.invoice_line_ids || []);

      if (allLineIds.length > 0) {
        // Consultar los datos detallados de las líneas en Odoo
        const lineasDetalle = await callOdooRPC(
          "account.move.line",
          "search_read",
          [[["id", "in", allLineIds]]],
          { fields: ["product_id", "quantity", "price_subtotal", "name"] },
        );

        if (Array.isArray(lineasDetalle)) {
          // Mapear los datos de las líneas de vuelta a su respectiva factura
          facturasList = facturasList.map((factura) => {
            const susLineas = lineasDetalle.filter((line) =>
              factura.invoice_line_ids?.includes(line.id),
            );
            return {
              ...factura,
              invoice_line_ids: susLineas, // Reemplazamos los IDs [1,2] por los objetos [{...},{...}]
            };
          });
        }
      }
    }
    // ===============================================================

    // ── Procesar mora avanzada (facturas +30 días vencidas) ──
    let moraAvanzada = Array.isArray(moraAvanzadaRaw) ? moraAvanzadaRaw : [];
    if (moraAvanzada.length > 0) {
      const allLineIds = moraAvanzada.flatMap((f) => f.invoice_line_ids || []);
      if (allLineIds.length > 0) {
        const lineasDetalle = await callOdooRPC(
          "account.move.line",
          "search_read",
          [[["id", "in", allLineIds]]],
          { fields: ["product_id", "quantity", "price_subtotal", "name"] },
        );
        if (Array.isArray(lineasDetalle)) {
          moraAvanzada = moraAvanzada.map((factura) => ({
            ...factura,
            invoice_line_ids: lineasDetalle.filter((line) =>
              factura.invoice_line_ids?.includes(line.id),
            ),
          }));
        }
      }
    }

    // ── Procesar devoluciones recientes ──
    let devolucionesRecientes = Array.isArray(devolucionesRecientesRaw) ? devolucionesRecientesRaw : [];
    if (devolucionesRecientes.length > 0) {
      const allLineIds = devolucionesRecientes.flatMap((f) => f.invoice_line_ids || []);
      if (allLineIds.length > 0) {
        const lineasDetalle = await callOdooRPC(
          "account.move.line",
          "search_read",
          [[["id", "in", allLineIds]]],
          { fields: ["product_id", "quantity", "price_subtotal", "name"] },
        );
        if (Array.isArray(lineasDetalle)) {
          devolucionesRecientes = devolucionesRecientes.map((factura) => ({
            ...factura,
            invoice_line_ids: lineasDetalle.filter((line) =>
              factura.invoice_line_ids?.includes(line.id),
            ),
          }));
        }
      }
    }

    // ── Procesar facturas por debajo del mínimo ($200) ──
    let facturasBajoMinimo = Array.isArray(facturasBajoMinimoRaw) ? facturasBajoMinimoRaw : [];
    if (facturasBajoMinimo.length > 0) {
      const allLineIds = facturasBajoMinimo.flatMap((f) => f.invoice_line_ids || []);
      if (allLineIds.length > 0) {
        const lineasDetalle = await callOdooRPC(
          "account.move.line",
          "search_read",
          [[["id", "in", allLineIds]]],
          { fields: ["product_id", "quantity", "price_subtotal", "name"] },
        );
        if (Array.isArray(lineasDetalle)) {
          facturasBajoMinimo = facturasBajoMinimo.map((factura) => ({
            ...factura,
            invoice_line_ids: lineasDetalle.filter((line) =>
              factura.invoice_line_ids?.includes(line.id),
            ),
            _tipo: "bajo_minimo",
          }));
        }
      }
      facturasBajoMinimo = facturasBajoMinimo.map((f) => ({ ...f, _tipo: f._tipo || "bajo_minimo" }));
    }

    // ── Metas de vendedores (venta del mes vs cuota) ──
    let metasVendedores: any[] = [];
    try {
      const [resultSellers]: any = await db.query(
        "SELECT id, name, user_id FROM sellers WHERE cids = ? AND activo = 1",
        [companyId],
      );
      const sellers = resultSellers || [];

      const [resultCuotas]: any = await db.query(`
        SELECT c.seller_id, c.cuota FROM cuota c
        INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest
        ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date
      `);
      const cuotas = resultCuotas || [];

      if (sellers.length > 0) {
        metasVendedores = sellers.map((seller: any) => {
          const cuota = cuotas.find((c: any) => c.seller_id === seller.id)?.cuota || 0;
          const facturado = ordersThisMonth.reduce((sum: number, o: any) => {
            if (!o.user_id || !Array.isArray(o.user_id)) return sum;
            const odooId = Number(o.user_id[0]);
            const odooName = (o.user_id[1] || "").toUpperCase().trim();
            const sellerName = (seller.name || "").toUpperCase().trim();
            const sellerUserId = Number(seller.user_id);
            if (odooId === sellerUserId || odooName === sellerName) {
              return sum + (o.amount_untaxed || 0);
            }
            return sum;
          }, 0);
          const porcentaje = cuota > 0 ? Math.round((facturado / cuota) * 100) : 0;
          return {
            seller_id: seller.id,
            name: seller.name,
            user_id: seller.user_id,
            meta: Math.round(cuota),
            facturado: Math.round(facturado),
            porcentaje,
            falta: Math.round(Math.max(0, cuota - facturado)),
          };
        }).sort((a, b) => b.porcentaje - a.porcentaje);
      }
    } catch (dbErr) {
      console.error("Error consultando metas de vendedores:", dbErr);
      metasVendedores = [];
    }

    function toVEDatetime(utcStr: string): string {
      if (!utcStr) return "";
      const d = new Date(utcStr.replace(" ", "T") + "Z");
      return new Date(d.getTime() - VE_OFFSET_MS)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
    }

    // ── Vendedores sin facturación hoy (basado en account.move) ─────────────
    const facturasMes = Array.isArray(facturasMesVendedoresRaw)
      ? facturasMesVendedoresRaw
      : [];

    // Quienes ya facturaron hoy (query dedicada con filtro Odoo, 100 % fiable)
    const facturasHoy = Array.isArray(facturasHoyRaw) ? facturasHoyRaw : [];
    const vendedoresActivosHoy = new Set(
      facturasHoy
        .filter(
          (f: any) =>
            f.invoice_user_id && Array.isArray(f.invoice_user_id),
        )
        .map((f: any) => f.invoice_user_id[0]),
    );

    // Construir stats por vendedor desde facturación del mes
    type VendedorStat = {
      id: number;
      name: string;
      amount_this_month: number;
      last_invoice_date: string;
      last_invoice_client: string;
      last_invoice_amount: number;
      last_invoice_id: number | null;
      last_invoice_line_ids: number[];
      top_client: string;
      client_amounts: Record<string, number>;
    };
    const vendedorStats: Record<number, VendedorStat> = {};
    for (const f of facturasMes) {
      if (!f.invoice_user_id || !Array.isArray(f.invoice_user_id)) continue;
      const uid = f.invoice_user_id[0];
      const uName = f.invoice_user_id[1] || "";
      const partnerName = Array.isArray(f.partner_id) ? f.partner_id[1] : "";
      const amount = f.amount_untaxed || 0;
      const date = f.invoice_date || "";
      if (!vendedorStats[uid]) {
        vendedorStats[uid] = {
          id: uid,
          name: uName,
          amount_this_month: 0,
          last_invoice_date: "",
          last_invoice_client: "",
          last_invoice_amount: 0,
          last_invoice_id: null,
          last_invoice_line_ids: [],
          top_client: "",
          client_amounts: {},
        };
      }
      vendedorStats[uid].amount_this_month += amount;
      if (
        !vendedorStats[uid].last_invoice_date ||
        date > vendedorStats[uid].last_invoice_date
      ) {
        vendedorStats[uid].last_invoice_date = date;
        vendedorStats[uid].last_invoice_client = partnerName;
        vendedorStats[uid].last_invoice_amount = amount;
        vendedorStats[uid].last_invoice_id = f.id || null;
        vendedorStats[uid].last_invoice_line_ids = Array.isArray(
          f.invoice_line_ids,
        )
          ? f.invoice_line_ids
          : [];
      }
      if (partnerName) {
        vendedorStats[uid].client_amounts[partnerName] =
          (vendedorStats[uid].client_amounts[partnerName] || 0) + amount;
      }
    }
    // Resolver top_client
    for (const v of Object.values(vendedorStats)) {
      v.top_client =
        Object.entries(v.client_amounts).sort(
          ([, a], [, b]) => b - a,
        )[0]?.[0] || "N/A";
    }

    const exclusions = (VENDEDOR_EXCLUSIONS[COMPANY_IDS[0]] ?? []).map((s) =>
      s.toLowerCase(),
    );

    // Obtener vendedores reales desde la tabla local
    let vendedoresInactivos: any[] = [];
    try {
      const placeholders = COMPANY_IDS.map(() => "?").join(",");
      const [resultSellers]: any = await db.query(
        `SELECT id, name, user_id, cids FROM sellers WHERE activo = 1 AND cids IN (${placeholders})`,
        COMPANY_IDS,
      );
      const allSellers = resultSellers || [];

      if (!isWeekend) {
        vendedoresInactivos = allSellers
          .map((seller: any) => {
            const stat = Object.values(vendedorStats).find((vs: any) => {
              const byId = Number(vs.id) === Number(seller.user_id);
              const byName =
                vs.name.toUpperCase().trim() ===
                seller.name.toUpperCase().trim();
              return byId || byName;
            }) as VendedorStat | undefined;
            return {
              id: seller.id,
              name: seller.name,
              user_id: seller.user_id,
              amount_this_month: stat
                ? Math.round(stat.amount_this_month)
                : 0,
              last_invoice_date: stat ? stat.last_invoice_date : "",
              last_invoice_client: stat?.last_invoice_client || "",
              last_invoice_amount: stat
                ? Math.round(stat.last_invoice_amount)
                : 0,
              last_invoice_id: stat?.last_invoice_id || null,
              last_invoice_line_ids: stat?.last_invoice_line_ids || [],
              top_client: stat?.top_client || "N/A",
              _tipo: "sin_actividad",
            };
          })
          .filter(
            (v: any) =>
              !vendedoresActivosHoy.has(v.user_id) &&
              !exclusions.includes(v.name.toLowerCase()),
          )
          .sort((a: any, b: any) => a.name.localeCompare(b.name));
      }
    } catch (dbErr) {
      console.error("Error consultando vendedores sin facturación:", dbErr);
      vendedoresInactivos = [];
    }

    // Resolver productos de la última factura para cada vendedor inactivo
    if (vendedoresInactivos.length > 0) {
      const allLineIds = vendedoresInactivos.flatMap(
        (v: any) => v.last_invoice_line_ids || [],
      );
      if (allLineIds.length > 0) {
        try {
          const linesResult = await callOdooRPC(
            "account.move.line",
            "search_read",
            [[["id", "in", allLineIds]]],
            {
              fields: [
                "move_id",
                "product_id",
                "quantity",
                "price_subtotal",
                "name",
              ],
            },
          );
          const linesData = Array.isArray(linesResult) ? linesResult : [];
          const linesByInvoice: Record<number, any[]> = {};
          for (const ln of linesData) {
            const mid = Array.isArray(ln.move_id) ? ln.move_id[0] : ln.move_id;
            if (!linesByInvoice[mid]) linesByInvoice[mid] = [];
            linesByInvoice[mid].push(ln);
          }
          for (const v of vendedoresInactivos as any[]) {
            v.last_sale_lines =
              linesByInvoice[v.last_invoice_id] || [];
            delete v.last_invoice_id;
            delete v.last_invoice_line_ids;
          }
        } catch (e) {
          console.error("Error resolviendo líneas de última factura:", e);
          for (const v of vendedoresInactivos as any[]) {
            v.last_sale_lines = [];
            delete v.last_invoice_id;
            delete v.last_invoice_line_ids;
          }
        }
      } else {
        for (const v of vendedoresInactivos as any[]) {
          v.last_sale_lines = [];
          delete v.last_invoice_id;
          delete v.last_invoice_line_ids;
        }
      }
    }

    // ── Vendedores por debajo de cuota mínima diaria ──────────────────────────
    const COMPANY_NAME_MAP: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
    let vendedoresCuotaAlerta: any[] = [];
    try {
      const placeholders = COMPANY_IDS.map(() => "?").join(",");
      const [resultSellers]: any = await db.query(
        `SELECT id, name, user_id, cids FROM sellers WHERE activo = 1 AND cids IN (${placeholders})`,
        COMPANY_IDS,
      );
      const allSellers = resultSellers || [];

      const [resultCuotas]: any = await db.query(`
        SELECT c.seller_id, c.cuota FROM cuota c
        INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest
        ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date
      `);
      const cuotas = resultCuotas || [];

      const dayOfMonth = today.getDate();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

      for (const seller of allSellers) {
        const cuota = cuotas.find((c: any) => c.seller_id === seller.id)?.cuota || 0;
        if (cuota <= 0) continue;

        const dailyMin = cuota / daysInMonth;
        const expectedMin = dailyMin * dayOfMonth;

        const sellerMatch = Object.values(vendedorStats).find((vs: any) => {
          const byId = Number(vs.id) === Number(seller.user_id);
          const byName = vs.name.toUpperCase().trim() === seller.name.toUpperCase().trim();
          return byId || byName;
        });
        const facturado = sellerMatch ? (sellerMatch as any).amount_this_month : 0;

        if (facturado < expectedMin) {
          const faltaPct = Math.round(((expectedMin - facturado) / expectedMin) * 100);
          vendedoresCuotaAlerta.push({
            id: seller.id,
            name: seller.name,
            user_id: seller.user_id,
            cuota: Math.round(cuota),
            daily_min: Math.round(dailyMin),
            expected: Math.round(expectedMin),
            facturado: Math.round(facturado),
            falta: Math.round(expectedMin - facturado),
            falta_pct: faltaPct,
            cids: seller.cids,
            sucursal: COMPANY_NAME_MAP[seller.cids] || `Sucursal ${seller.cids}`,
          });
        }
      }
      vendedoresCuotaAlerta.sort((a, b) => b.falta_pct - a.falta_pct);
    } catch (dbErr) {
      console.error("Error consultando cuota alerta:", dbErr);
      vendedoresCuotaAlerta = [];
    }

    // ── Clientes inactivos (umbral inteligente) ───────────────────────────────
    const clientesHistRaw = Array.isArray(clientesInactivosRaw)
      ? clientesInactivosRaw
      : [];
    const nowMs = Date.now();

    // Agrupar facturas por cliente
    type ClientStat = {
      id: number;
      name: string;
      orders: { date: string; amount: number; orderId: number; ref: string }[];
      salespersonByOrder: Record<number, string>;
    };
    const clientMap: Record<number, ClientStat> = {};
    for (const o of clientesHistRaw) {
      if (!o.partner_id || !Array.isArray(o.partner_id)) continue;
      const cid = o.partner_id[0];
      if (!clientMap[cid]) {
        clientMap[cid] = {
          id: cid,
          name: o.partner_id[1] || "",
          orders: [],
          salespersonByOrder: {},
        };
      }
      // invoice_date es solo fecha (YYYY-MM-DD), sin hora — lo usamos tal cual para comparar
      const invoiceRef =
        o.name && o.name !== "/" && o.name !== "false" ? o.name : "";
      clientMap[cid].orders.push({
        date: o.invoice_date || "",
        amount: o.amount_total || 0,
        orderId: o.id,
        ref: invoiceRef,
      });
      if (o.invoice_user_id && Array.isArray(o.invoice_user_id)) {
        clientMap[cid].salespersonByOrder[o.id] = o.invoice_user_id[1] || "";
      }
    }

    // Identificar clientes con última compra > 30 días
    const inactiveClients: any[] = [];
    for (const c of Object.values(clientMap)) {
      if (c.orders.length === 0) continue;
      const sorted = [...c.orders].sort((a, b) => b.date.localeCompare(a.date));
      const lastOrder = sorted[0];
      const lastDateMs = new Date(lastOrder.date).getTime(); // invoice_date = YYYY-MM-DD
      const daysInactive = Math.floor(
        (nowMs - lastDateMs) / (1000 * 60 * 60 * 24),
      );
      if (daysInactive < 30) continue; // todavía activo

      const totalSpent = Math.round(c.orders.reduce((s, o) => s + o.amount, 0));
      const avgOrderAmount = Math.round(totalSpent / c.orders.length);
      const salesperson =
        c.salespersonByOrder[lastOrder.orderId] ||
        Object.values(c.salespersonByOrder)[0] ||
        "—";

      // Cliente con una sola compra: sin historial suficiente para calcular intervalo
      if (c.orders.length === 1) {
        inactiveClients.push({
          id: c.id,
          name: c.name,
          salesperson,
          last_sale_date: lastOrder.date,
          last_order_ref: lastOrder.ref,
          days_inactive: daysInactive,
          last_order_amount: Math.round(lastOrder.amount),
          avg_order_amount: null,
          total_spent: totalSpent,
          threshold: 30,
          risk: "Sin historial",
          single_order: true,
          _orderIds: [lastOrder.orderId],
        });
        continue;
      }

      // Intervalo promedio entre pedidos (hasta últimos 12)
      const recent = sorted.slice(0, 12);
      const firstMs = new Date(recent[recent.length - 1].date).getTime();
      const lastMs = new Date(recent[0].date).getTime();
      let avgInterval = Math.round(
        (lastMs - firstMs) / (1000 * 60 * 60 * 24) / (recent.length - 1),
      );
      if (avgInterval < 7) avgInterval = 7;

      // Factor de tamaño: pedido grande → umbral más alto (cap ×3)
      const sizeFactor =
        avgOrderAmount > 0 ? Math.min(3, lastOrder.amount / avgOrderAmount) : 1;
      const threshold = Math.max(
        30,
        Math.round(avgInterval * 1.5 * sizeFactor),
      );

      const ratio = daysInactive / threshold;
      const risk = ratio >= 2 ? "Crítico" : ratio >= 1 ? "Alto" : "Medio";

      inactiveClients.push({
        id: c.id,
        name: c.name,
        salesperson,
        last_sale_date: lastOrder.date,
        last_order_ref: lastOrder.ref,
        days_inactive: daysInactive,
        last_order_amount: Math.round(lastOrder.amount),
        avg_order_amount: avgOrderAmount,
        total_spent: totalSpent,
        threshold,
        risk,
        single_order: false,
        _orderIds: sorted.map((o) => o.orderId),
      });
    }
    inactiveClients.sort((a, b) => b.days_inactive - a.days_inactive);

    // Enriquecer con top_product — todas las líneas de factura del cliente (historial completo)
    const inactivePartnerIds = inactiveClients.map((c) => c.id);
    let clientesInactivosUnicos: any[] = inactiveClients.map(
      ({ _orderIds: _, ...rest }) => ({ ...rest, top_product: "—" }),
    );

    if (inactivePartnerIds.length > 0) {
      const inactiveLines = await callOdooRPC(
        "account.move.line",
        "search_read",
        [
          [
            ["move_id.partner_id", "in", inactivePartnerIds],
            ["move_id.move_type", "=", "out_invoice"],
            ["move_id.state", "=", "posted"],
            ["product_id", "!=", false],
            ["display_type", "=", "product"],
          ],
        ],
        {
          fields: ["partner_id", "product_id", "quantity", "move_id"],
          limit: 10000,
        },
      );
      if (Array.isArray(inactiveLines)) {
        // Set de facturas que tienen al menos una línea de producto real, por cliente
        const clientInvoicesWithProducts: Record<number, number[]> = {}; // cid → [invoiceId, ...]

        const clientProductQty: Record<
          number,
          Record<number, { name: string; qty: number }>
        > = {};
        for (const l of inactiveLines) {
          if (!l.product_id || !Array.isArray(l.product_id)) continue;
          const productName: string = l.product_id[1] || "";
          if (/saldo inicial|SAL_INI|apertura|ajuste/i.test(productName))
            continue;
          const cid = Array.isArray(l.partner_id)
            ? l.partner_id[0]
            : l.partner_id;
          if (!cid || !inactivePartnerIds.includes(cid)) continue;

          // Registrar qué facturas tienen productos reales
          const invId = Array.isArray(l.move_id) ? l.move_id[0] : l.move_id;
          if (invId) {
            if (!clientInvoicesWithProducts[cid])
              clientInvoicesWithProducts[cid] = [];
            if (!clientInvoicesWithProducts[cid].includes(invId))
              clientInvoicesWithProducts[cid].push(invId);
          }

          if (!clientProductQty[cid]) clientProductQty[cid] = {};
          const pid = l.product_id[0];
          if (!clientProductQty[cid][pid])
            clientProductQty[cid][pid] = { name: productName, qty: 0 };
          clientProductQty[cid][pid].qty += l.quantity || 0;
        }

        // Construir mapa invoiceId → { ref, date } desde el historial original
        const invoiceInfo: Record<number, { ref: string; date: string }> = {};
        for (const o of clientesHistRaw) {
          if (o.id)
            invoiceInfo[o.id] = {
              ref: o.name && o.name !== "/" ? o.name : "",
              date: o.invoice_date || "",
            };
        }

        clientesInactivosUnicos = clientesInactivosUnicos.map((c) => {
          const prods = clientProductQty[c.id];
          const top = prods
            ? Object.values(prods).sort((a, b) => b.qty - a.qty)[0]?.name
            : null;

          // Factura más reciente con productos reales
          const validInvoices = (clientInvoicesWithProducts[c.id] || [])
            .map((iid) => invoiceInfo[iid])
            .filter(Boolean)
            .sort((a, b) => b.date.localeCompare(a.date));
          const lastInvoiceRef =
            validInvoices[0]?.ref || c.last_order_ref || "—";

          return {
            ...c,
            top_product: top || "—",
            last_order_ref: lastInvoiceRef,
          };
        });
      }
    }

    // ── KPIs de sucursal ────────────────────────────────────────────────
    const totalFacturadoMes = ordersThisMonth.reduce((sum, o) => sum + (o.amount_untaxed || 0), 0);
    const totalCarteraVencida = [
      ...(Array.isArray(moraAvanzada) ? moraAvanzada : []),
      ...facturasList,
    ].reduce((sum, f) => sum + (f.amount_total || 0), 0);
    const totalDevoluciones = (Array.isArray(devolucionesRecientes) ? devolucionesRecientes : [])
      .reduce((sum, d) => sum + (d.amount_total || 0), 0);
    const vendedoresActivosHoyCount = vendedoresActivosHoy.size;
    const totalSellersCount = metasVendedores.length + vendedoresInactivos.length;

    const kpiSucursal = {
      facturado_mes: Math.round(totalFacturadoMes),
      cartera_vencida: Math.round(totalCarteraVencida),
      devoluciones_mes: Math.round(totalDevoluciones),
      devoluciones_count: (Array.isArray(devolucionesRecientes) ? devolucionesRecientes : []).length,
      vendedores_activos_hoy: vendedoresActivosHoyCount,
      vendedores_inactivos_count: vendedoresInactivos.length,
      total_vendedores: totalSellersCount || vendedoresActivosHoyCount + vendedoresInactivos.length,
      clientes_inactivos_count: clientesInactivosUnicos.length,
      productos_caida_count: productosCaida.length,
      mora_count: (Array.isArray(moraAvanzada) ? moraAvanzada : []).length,
      vendedores_cuota_alerta_count: vendedoresCuotaAlerta.length,
    };

    return NextResponse.json({
      alertas: {
        vencimiento_facturas: facturasList,
        vendedores_inactivos: vendedoresInactivos,
        productos_alerta: productosCaida,
        inactividad_clientes: clientesInactivosUnicos,
        mora_avanzada: moraAvanzada,
        devoluciones_recientes: devolucionesRecientes,
        metas_vendedores: metasVendedores,
        vendedores_cuota_alerta: vendedoresCuotaAlerta,
        facturas_bajo_minimo: facturasBajoMinimo,
      },
    });
  } catch (error: any) {
    console.error("Error en API alertas:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
