// // import { callOdooRPC } from "@/lib/odoo";
import { jwtSecretBytes, jwtSecretString } from "@/lib/secretos";
// // import { jwtVerify } from "jose";
// // import { NextResponse } from "next/server";

// // const JWT_SECRET = new TextEncoder().encode(
// //   jwtSecretString(),
// // );

// // export async function GET(request: Request) {
// //   const { searchParams } = new URL(request.url);
// //   const periodo = searchParams.get("periodo") || "total";

// //   const token = request.headers
// //     .get("cookie")
// //     ?.split(";")
// //     .find((c) => c.trim().startsWith("token="))
// //     ?.split("=")[1];
// //   if (!token)
// //     return NextResponse.json({ error: "No autorizado" }, { status: 401 });

// //   try {
// //     const { payload } = await jwtVerify(token, JWT_SECRET, {
// //       algorithms: ["HS256"],
// //     });
// //     const uid = parseInt(payload.uid as string);

// //     // 1. Obtener usuario y empresa
// //     const [user] = await callOdooRPC<any[]>("res.users", "read", [[uid]], {
// //       fields: ["name", "company_id"],
// //     });
// //     const userName = user.name;
// //     const userCompanyId = user.company_id[0];

// //     // 2. Lógica de fechas
// //     const ahora = new Date();
// //     let fechaInicio = "";
// //     let fechaFin = "";

// //     if (periodo === "mes") {
// //       fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
// //         .toISOString()
// //         .split("T")[0];
// //     } else if (periodo === "mes_pasado") {
// //       fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
// //         .toISOString()
// //         .split("T")[0];
// //       fechaFin = new Date(ahora.getFullYear(), ahora.getMonth(), 0)
// //         .toISOString()
// //         .split("T")[0];
// //     } else if (periodo === "dia") {
// //       fechaInicio = ahora.toISOString().split("T")[0];
// //     }

// //     // 3. Consulta a Facturación (account.move)
// //     const domain: any[] = [
// //       ["move_type", "=", "out_invoice"],
// //       ["state", "=", "posted"],
// //       ["company_id", "=", userCompanyId],
// //     ];
// //     if (periodo !== "total") {
// //       domain.push(["invoice_date", ">=", fechaInicio]);
// //       if (fechaFin) domain.push(["invoice_date", "<=", fechaFin]);
// //     }

// //     const facturas = await callOdooRPC<any[]>(
// //       "account.move",
// //       "search_read",
// //       [domain],
// //       {
// //         fields: ["amount_total_signed", "invoice_user_id", "partner_id", "id"],
// //       },
// //     );

// //     // 4. Rankings y Cálculos
// //     const stats: Record<string, { total: number; count: number }> = {};
// //     facturas.forEach((f) => {
// //       const name = f.invoice_user_id ? f.invoice_user_id[1] : "Sin Vendedor";
// //       if (!stats[name]) stats[name] = { total: 0, count: 0 };
// //       stats[name].total += f.amount_total_signed;
// //       stats[name].count += 1;
// //     });

// //     const rankVentas = Object.entries(stats).sort(
// //       (a, b) => b[1].total - a[1].total,
// //     );
// //     const rankLeads = Object.entries(stats).sort(
// //       (a, b) => b[1].count - a[1].count,
// //     );

// //     // 5. Top Productos (Basado en account.move.line)
// //     const misFacturasIds = facturas
// //       .filter((f) => f.invoice_user_id && f.invoice_user_id[1] === userName)
// //       .map((f) => f.id);
// //     let topProductos: string[] = [];
// //     if (misFacturasIds.length > 0) {
// //       // En tu bloque 5, ajusta el read_group:
// //       const raw = await callOdooRPC<any[]>("account.move.line", "read_group", [
// //         [
// //           ["move_id", "in", misFacturasIds],
// //           ["product_id", "!=", false],
// //         ],
// //         ["product_id", "quantity"],
// //         ["product_id"],
// //         0,
// //         5,
// //         "quantity desc", // Cambia "quantity:sum" por "quantity desc" para asegurar el orden
// //       ]);
// //       topProductos = raw.map((p) => p.product_id[1]);
// //     }

// //     // 6. Respuesta final
// //     const misFacturas = facturas.filter(
// //       (f) => f.invoice_user_id && f.invoice_user_id[1] === userName,
// //     );

// //     // Log de Top Clientes con Facturación
// //     const clientesMap: Record<string, number> = {};
// //     misFacturas.forEach((f) => {
// //       const nombre = f.partner_id ? f.partner_id[1] : "Sin Cliente";
// //       clientesMap[nombre] = (clientesMap[nombre] || 0) + f.amount_total_signed;
// //     });
// //     const top5Clientes = Object.entries(clientesMap)
// //       .sort((a, b) => b[1] - a[1])
// //       .slice(0, 5)
// //       .map((c) => c[0]);

// //     return NextResponse.json({
// //       rankingVentas: rankVentas.findIndex((v) => v[0] === userName) + 1,
// //       rankingLeads: rankLeads.findIndex((v) => v[0] === userName) + 1,
// //       totalFacturado: misFacturas.reduce(
// //         (acc, f) => acc + f.amount_total_signed,
// //         0,
// //       ),
// //       closedLeads: misFacturas.length,
// //       topClients: top5Clientes,
// //       topProducts: topProductos,
// //     });
// //   } catch (e: any) {
// //     return NextResponse.json({ error: e.message }, { status: 500 });
// //   }
// // }
// import { callOdooRPC } from "@/lib/odoo";
// import { jwtVerify } from "jose";
// import { NextResponse } from "next/server";

// const JWT_SECRET = new TextEncoder().encode(
//   jwtSecretString(),
// );

// export async function GET(request: Request) {
//   const { searchParams } = new URL(request.url);
//   const periodo = searchParams.get("periodo") || "total";

//   const token = request.headers
//     .get("cookie")
//     ?.split(";")
//     .find((c) => c.trim().startsWith("token="))
//     ?.split("=")[1];
//   if (!token)
//     return NextResponse.json({ error: "No autorizado" }, { status: 401 });

//   try {
//     const { payload } = await jwtVerify(token, JWT_SECRET, {
//       algorithms: ["HS256"],
//     });
//     const uid = parseInt(payload.uid as string);

//     // 1. Obtener usuario y empresa
//     const [user] = await callOdooRPC<any[]>("res.users", "read", [[uid]], {
//       fields: ["name", "company_id"],
//     });
//     const userName = user.name;
//     const userCompanyId = user.company_id[0];

//     // 2. Lógica de fechas
//     const ahora = new Date();
//     let fechaInicio = "";
//     let fechaFin = "";

//     if (periodo === "mes") {
//       fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
//         .toISOString()
//         .split("T")[0];
//     } else if (periodo === "mes_pasado") {
//       fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
//         .toISOString()
//         .split("T")[0];
//       fechaFin = new Date(ahora.getFullYear(), ahora.getMonth(), 0)
//         .toISOString()
//         .split("T")[0];
//     } else if (periodo === "dia") {
//       fechaInicio = ahora.toISOString().split("T")[0];
//     }

//     // 3. Consulta a Facturación (account.move)
//     const domain: any[] = [
//       ["move_type", "=", "out_invoice"],
//       ["state", "=", "posted"],
//       ["company_id", "=", userCompanyId],
//     ];
//     if (periodo !== "total") {
//       domain.push(["invoice_date", ">=", fechaInicio]);
//       if (fechaFin) domain.push(["invoice_date", "<=", fechaFin]);
//     }

//     const facturas = await callOdooRPC<any[]>(
//       "account.move",
//       "search_read",
//       [domain],
//       {
//         fields: ["amount_total_signed", "invoice_user_id", "partner_id", "id"],
//       },
//     );

//     // 4. Rankings y Cálculos
//     const stats: Record<string, { total: number; count: number }> = {};
//     facturas.forEach((f) => {
//       const name = f.invoice_user_id ? f.invoice_user_id[1] : "Sin Vendedor";
//       if (!stats[name]) stats[name] = { total: 0, count: 0 };
//       stats[name].total += f.amount_total_signed;
//       stats[name].count += 1;
//     });

//     const rankVentas = Object.entries(stats).sort(
//       (a, b) => b[1].total - a[1].total,
//     );
//     const rankLeads = Object.entries(stats).sort(
//       (a, b) => b[1].count - a[1].count,
//     );

//     // 5. Top Productos (Basado en account.move.line)
//     const misFacturasIds = facturas
//       .filter((f) => f.invoice_user_id && f.invoice_user_id[1] === userName)
//       .map((f) => f.id);
//     let topProductos: string[] = [];
//     if (misFacturasIds.length > 0) {
//       // En tu bloque 5, ajusta el read_group:
//       const raw = await callOdooRPC<any[]>("account.move.line", "read_group", [
//         [
//           ["move_id", "in", misFacturasIds],
//           ["product_id", "!=", false],
//         ],
//         ["product_id", "quantity"],
//         ["product_id"],
//         0,
//         5,
//         "quantity desc", // Cambia "quantity:sum" por "quantity desc" para asegurar el orden
//       ]);
//       topProductos = raw.map((p) => p.product_id[1]);
//     }

//     // 6. Respuesta final
//     const misFacturas = facturas.filter(
//       (f) => f.invoice_user_id && f.invoice_user_id[1] === userName,
//     );

//     const meses = [
//       "Jan",
//       "Feb",
//       "Mar",
//       "Apr",
//       "May",
//       "Jun",
//       "Jul",
//       "Aug",
//       "Sep",
//       "Oct",
//       "Nov",
//       "Dec",
//     ];
//     const chartData = meses.map((m) => ({ month: m, total: 0 }));

//     misFacturas.forEach((f) => {
//       const mes = new Date(f.invoice_date).getMonth();
//       chartData[mes].total += f.amount_total_signed;
//     });

//     // Log de Top Clientes con Facturación
//     const clientesMap: Record<string, number> = {};
//     misFacturas.forEach((f) => {
//       const nombre = f.partner_id ? f.partner_id[1] : "Sin Cliente";
//       clientesMap[nombre] = (clientesMap[nombre] || 0) + f.amount_total_signed;
//     });
//     const top5Clientes = Object.entries(clientesMap)
//       .sort((a, b) => b[1] - a[1])
//       .slice(0, 5)
//       .map((c) => c[0]);

//     return NextResponse.json({
//       rankingVentas: rankVentas.findIndex((v) => v[0] === userName) + 1,
//       rankingLeads: rankLeads.findIndex((v) => v[0] === userName) + 1,
//       totalFacturado: misFacturas.reduce(
//         (acc, f) => acc + f.amount_total_signed,
//         0,
//       ),
//       closedLeads: misFacturas.length,
//       topClients: top5Clientes,
//       topProducts: topProductos,
//       chartData: chartData,
//     });
//   } catch (e: any) {
//     return NextResponse.json({ error: e.message }, { status: 500 });
//   }
// }
import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const periodo = searchParams.get("periodo") || "total";

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];

  if (!token)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ["HS256"],
    });
    const uid = parseInt(payload.uid as string);

    // Asumimos que 'uid' es el seller_id en tu tabla 'leads'

    // --- NUEVAS CONSULTAS A MYSQL (Leads) ---
    const leadsMetricsRes: any = await query(
      `
  SELECT
    AVG(monto_cerrado_usd) as monto_promedio,
    AVG(tiempo_primer_contacto_minutos) as avg_tiempo_contacto,
    AVG(CASE WHEN fecha_venta IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, COALESCE(fecha_ingreso, created_at), fecha_venta) ELSE NULL END) as avg_tiempo_cierre,
    COUNT(CASE WHEN motivo_cierre = 'VENTA' OR motivo_cierre = 'GANADO' OR motivo_cierre = 'YA_ES_CLIENTE' THEN 1 END) as leads_exitosos
  FROM leads WHERE seller_id = ?
`,
      [uid],
    );

    const metrics = leadsMetricsRes.rows
      ? leadsMetricsRes.rows[0]
      : Array.isArray(leadsMetricsRes)
        ? leadsMetricsRes[0]
        : null;

    // 3. Define valores por defecto si no hay datos
    const safeMetrics = metrics || {
      monto_promedio: 0,
      avg_tiempo_contacto: 0,
      avg_tiempo_cierre: 0,
      leads_exitosos: 0,
    };

    const rankingLeads = await query(`
      SELECT seller_id, COUNT(*) as total_cerrados
      FROM leads WHERE motivo_cierre IN ('VENTA', 'GANADO', 'YA_ES_CLIENTE')
      GROUP BY seller_id ORDER BY total_cerrados DESC
    `);

    // 1. Obtener usuario y empresa
    const [user] = await callOdooRPC<any[]>("res.users", "read", [[uid]], {
      fields: ["name", "company_id"],
    });
    const userName = user.name;
    const userCompanyId = user.company_id[0];

    // 2. Lógica de fechas
    const ahora = new Date();
    let fechaInicio = "";
    let fechaFin = "";

    if (periodo === "mes") {
      fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
        .toISOString()
        .split("T")[0];
    } else if (periodo === "mes_pasado") {
      fechaInicio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
        .toISOString()
        .split("T")[0];
      fechaFin = new Date(ahora.getFullYear(), ahora.getMonth(), 0)
        .toISOString()
        .split("T")[0];
    } else if (periodo === "dia") {
      fechaInicio = ahora.toISOString().split("T")[0];
    } else if (/^\d{4}-\d{2}$/.test(periodo)) {
      const [anio, mesNum] = periodo.split("-").map(Number);
      fechaInicio = new Date(anio, mesNum - 1, 1).toISOString().split("T")[0];
      fechaFin = new Date(anio, mesNum, 0).toISOString().split("T")[0];
    }

    // 3. Consulta a Facturación
    const domain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", userCompanyId],
    ];
    if (periodo !== "total") {
      domain.push(["invoice_date", ">=", fechaInicio]);
      if (fechaFin) domain.push(["invoice_date", "<=", fechaFin]);
    }

    const facturas = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domain],
      {
        fields: ["amount_untaxed", "amount_total_signed", "invoice_user_id", "partner_id", "id", "invoice_date", "move_type"],
      },
    );

    const totalFacturadoExact = (facturas || [])
      .filter((f: any) => f.invoice_user_id && Number(f.invoice_user_id[0]) === uid)
      .reduce((acc: number, f: any) => {
        const amount = f.amount_untaxed || 0;
        return acc + (f.move_type === "out_refund" ? -amount : amount);
      }, 0);

    // 4. Rankings (amount_untaxed from account.move, negating credit notes)
    const stats: Record<string, { total: number; count: number; id: number }> = {};
    (facturas || []).forEach((f: any) => {
      const id = f.invoice_user_id ? f.invoice_user_id[0] : 0;
      const name = f.invoice_user_id ? f.invoice_user_id[1] : "Sin Vendedor";
      if (!stats[name]) stats[name] = { total: 0, count: 0, id };
      const amount = f.amount_untaxed || 0;
      stats[name].total += f.move_type === "out_refund" ? -amount : amount;
      stats[name].count += 1;
    });

    const excludedSellers = ["asis", "yusne"];
    const rankVentas = Object.entries(stats)
      .filter(([name]) => !excludedSellers.some((ex) => name.toLowerCase().includes(ex)))
      .sort((a, b) => b[1].total - a[1].total);

    // 5. Top Productos
    const misFacturas = facturas.filter(
      (f) => f.invoice_user_id && Number(f.invoice_user_id[0]) === uid,
    );
    const misFacturasIds = misFacturas.map((f) => f.id);

    let topProductos: string[] = [];
    if (misFacturasIds.length > 0) {
      const raw = await callOdooRPC<any[]>("account.move.line", "read_group", [
        [
          ["move_id", "in", misFacturasIds],
          ["product_id", "!=", false],
        ],
        ["product_id", "quantity"],
        ["product_id"],
        0,
        5,
        "quantity desc",
      ]);
      topProductos = raw.map((p) => p.product_id[1]);
    }

    // 6. Gráfico de Evolución
    let chartData: { month: string; total: number }[] = [];

    if (/^\d{4}-\d{2}$/.test(periodo)) {
      const [anio, mesNum] = periodo.split("-").map(Number);
      const hoy = new Date();
      const esMesActual = anio === hoy.getFullYear() && mesNum === hoy.getMonth() + 1;
      const diasEnMes = esMesActual ? hoy.getDate() : new Date(anio, mesNum, 0).getDate();
      const statsPorDia: Record<string, number> = {};
      for (let d = 1; d <= diasEnMes; d++) {
        const dia = `${anio}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        statsPorDia[dia] = 0;
      }
      misFacturas.forEach((f) => {
        if (f.invoice_date) {
          const dia = f.invoice_date.substring(0, 10);
          if (statsPorDia[dia] !== undefined) {
            statsPorDia[dia] += f.move_type === "out_refund" ? -(f.amount_untaxed || 0) : (f.amount_untaxed || 0);
          }
        }
      });
      chartData = Object.entries(statsPorDia)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([dia, total]) => ({
          month: dia.substring(8, 10),
          total,
        }));
    } else {
      const statsPorMes: Record<string, number> = {};
      misFacturas.forEach((f) => {
        if (f.invoice_date) {
          const mesKey = f.invoice_date.substring(0, 7);
          statsPorMes[mesKey] = (statsPorMes[mesKey] || 0) + (f.move_type === "out_refund" ? -(f.amount_untaxed || 0) : (f.amount_untaxed || 0));
        }
      });
      chartData = Object.entries(statsPorMes)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, total]) => {
          const [y, m] = mes.split("-");
          const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
          return {
            month: `${monthNames[parseInt(m) - 1]} ${y.substring(2)}`,
            total,
          };
        });
    }

    // 7. Top Clientes
    const clientesMap: Record<string, number> = {};
    misFacturas.forEach((f) => {
      const nombre = f.partner_id ? f.partner_id[1] : "Sin Cliente";
      clientesMap[nombre] = (clientesMap[nombre] || 0) + (f.move_type === "out_refund" ? -(f.amount_untaxed || 0) : (f.amount_untaxed || 0));
    });
    const top5Clientes = Object.entries(clientesMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map((c) => c[0]);

    // --- CÁLCULO DE CRECIMIENTO ---
    const hoy = new Date();
    // Mes Actual (Junio)
    const mesActualInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    // Mes Pasado (Mayo)
    const mesPasadoInicio = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
    // Mes Antepasado (Abril)
    const mesAntepasadoInicio = new Date(
      hoy.getFullYear(),
      hoy.getMonth() - 2,
      1,
    );

    // --- 2. Consulta para obtener datos de los últimos 3 meses ---
    // Esto garantiza que siempre tengamos datos de Mayo y Abril para comparar
    const domainCrecimiento = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", userCompanyId],
      ["invoice_date", ">=", mesAntepasadoInicio.toISOString().split("T")[0]],
    ];

    const facturasCrecimiento = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domainCrecimiento],
      {
        fields: ["amount_untaxed", "invoice_date", "invoice_user_id", "move_type"],
      },
    );
    const misFacturasC = facturasCrecimiento.filter(
      (f) => f.invoice_user_id && Number(f.invoice_user_id[0]) === uid,
    );

    // --- 3. Calcular según el filtro del usuario ---
    const signedAmount = (f: any) => f.move_type === "out_refund" ? -(f.amount_untaxed || 0) : (f.amount_untaxed || 0);
    let vActual = 0;
    let vAnterior = 0;

    if (periodo === "mes_pasado") {
      vActual = misFacturasC
        .filter(
          (f) =>
            f.invoice_date >= mesPasadoInicio.toISOString().split("T")[0] &&
            f.invoice_date < mesActualInicio.toISOString().split("T")[0],
        )
        .reduce((a, b) => a + signedAmount(b), 0);
      vAnterior = misFacturasC
        .filter(
          (f) =>
            f.invoice_date >= mesAntepasadoInicio.toISOString().split("T")[0] &&
            f.invoice_date < mesPasadoInicio.toISOString().split("T")[0],
        )
        .reduce((a, b) => a + signedAmount(b), 0);
    } else if (/^\d{4}-\d{2}$/.test(periodo)) {
      const [anio, mesNum] = periodo.split("-").map(Number);
      const selInicio = new Date(anio, mesNum - 1, 1);
      const selFin = new Date(anio, mesNum, 0);
      const mesAntInicio = new Date(anio, mesNum - 2, 1);
      const mesAntFin = new Date(anio, mesNum - 1, 0);
      vActual = misFacturasC
        .filter(
          (f) =>
            f.invoice_date >= selInicio.toISOString().split("T")[0] &&
            f.invoice_date <= selFin.toISOString().split("T")[0],
        )
        .reduce((a, b) => a + signedAmount(b), 0);
      vAnterior = misFacturasC
        .filter(
          (f) =>
            f.invoice_date >= mesAntInicio.toISOString().split("T")[0] &&
            f.invoice_date <= mesAntFin.toISOString().split("T")[0],
        )
        .reduce((a, b) => a + signedAmount(b), 0);
    } else {
      // Comparar mismo día: mes actual (1 até hoy) vs mes anterior (1 até mismo día)
      const diaActual = hoy.getDate();
      const mesAnteriorMismoDia = new Date(hoy.getFullYear(), hoy.getMonth() - 1, diaActual);
      vActual = misFacturasC
        .filter(
          (f) => f.invoice_date >= mesActualInicio.toISOString().split("T")[0],
        )
        .reduce((a, b) => a + signedAmount(b), 0);
      vAnterior = misFacturasC
        .filter(
          (f) =>
            f.invoice_date >= mesPasadoInicio.toISOString().split("T")[0] &&
            f.invoice_date <= mesAnteriorMismoDia.toISOString().split("T")[0],
        )
        .reduce((a, b) => a + signedAmount(b), 0);
      console.log(`[CRECIMIENTO] Usuario: ${userName} | Periodo: ${mesActualInicio.toISOString().split("T")[0]} → hoy (${hoy.toISOString().split("T")[0]}) = $${vActual.toFixed(2)} | vs ${mesPasadoInicio.toISOString().split("T")[0]} → ${mesAnteriorMismoDia.toISOString().split("T")[0]} = $${vAnterior.toFixed(2)}`);
    }

    const crecimiento =
      vAnterior > 0 ? ((vActual - vAnterior) / vAnterior) * 100 : 0;

    console.log(`[CRECIMIENTO] Resultado: ${crecimiento.toFixed(1)}%`);

    // Leads cerrados desde la DB de leads (independiente de Odoo)
    let closedLeadsDB = 0;
    let montoLeads = 0;
    let crecimientoLeads = 0;
    let miRankingLeads = 0;
    try {
      const sellerResult = await query(
        "SELECT id FROM sellers WHERE user_id = ?",
        [uid],
      );
      const sellerRows = Array.isArray(sellerResult)
        ? sellerResult
        : (sellerResult as any).rows;

      if (sellerRows && sellerRows.length > 0) {
        const sellerId = sellerRows[0].id;

        let leadsQuery = `
          SELECT COUNT(*) as count, COALESCE(SUM(monto_cerrado_usd), 0) as total
          FROM leads
          WHERE seller_id = ? AND status = 'CERRADO' AND (motivo_cierre = 'VENTA' OR motivo_cierre = 'GANADO' OR motivo_cierre = 'YA_ES_CLIENTE')
        `;
        const leadsParams: any[] = [sellerId];

        if (periodo !== "total" && fechaInicio) {
          leadsQuery += " AND fecha_venta >= ?";
          leadsParams.push(fechaInicio);
        }
        if (fechaFin) {
          leadsQuery += " AND fecha_venta <= ?";
          leadsParams.push(fechaFin);
        }

        const leadsResult = await query(leadsQuery, leadsParams);
        const leadsRows = Array.isArray(leadsResult)
          ? leadsResult
          : (leadsResult as any).rows;

        if (leadsRows && leadsRows.length > 0) {
          closedLeadsDB = parseInt(leadsRows[0].count) || 0;
          montoLeads = parseFloat(leadsRows[0].total) || 0;
        }

        // Crecimiento mensual basado en leads DB
        const mesActualInicioStr = mesActualInicio.toISOString().split("T")[0];
        const mesPasadoInicioStr = mesPasadoInicio.toISOString().split("T")[0];
        const mesAntepasadoInicioStr = mesAntepasadoInicio
          .toISOString()
          .split("T")[0];

        // Rangos para comparación de crecimiento según período
        const añoActualInicio = new Date(hoy.getFullYear(), 0, 1)
          .toISOString()
          .split("T")[0];
        const añoAnteriorInicio = new Date(hoy.getFullYear() - 1, 0, 1)
          .toISOString()
          .split("T")[0];
        const añoAnteriorFin = añoActualInicio;
        const ayerStr = new Date(
          hoy.getFullYear(),
          hoy.getMonth(),
          hoy.getDate(),
        )
          .toISOString()
          .split("T")[0];
        const antesDeAyerStr = new Date(
          hoy.getFullYear(),
          hoy.getMonth(),
          hoy.getDate() - 1,
        )
          .toISOString()
          .split("T")[0];

        let inicioActual: string,
          finActual: string | null,
          inicioAnterior: string,
          finAnterior: string;
        if (periodo === "mes_pasado") {
          [inicioActual, finActual, inicioAnterior, finAnterior] = [
            mesPasadoInicioStr,
            mesActualInicioStr,
            mesAntepasadoInicioStr,
            mesPasadoInicioStr,
          ];
        } else if (periodo === "dia") {
          [inicioActual, finActual, inicioAnterior, finAnterior] = [
            ayerStr,
            null,
            antesDeAyerStr,
            ayerStr,
          ];
        } else if (periodo === "total") {
          // Este año vs año anterior
          [inicioActual, finActual, inicioAnterior, finAnterior] = [
            añoActualInicio,
            null,
            añoAnteriorInicio,
            añoAnteriorFin,
          ];
        } else {
          // mes: este mes vs mes pasado
          [inicioActual, finActual, inicioAnterior, finAnterior] = [
            mesActualInicioStr,
            null,
            mesPasadoInicioStr,
            mesActualInicioStr,
          ];
        }

        const leadsMontoActual: any = await query(
          `SELECT COALESCE(SUM(monto_cerrado_usd), 0) as total FROM leads
           WHERE seller_id = ? AND status = 'CERRADO' AND (motivo_cierre = 'VENTA' OR motivo_cierre = 'GANADO' OR motivo_cierre = 'YA_ES_CLIENTE')
           AND fecha_venta >= ?${finActual ? " AND fecha_venta < ?" : ""}`,
          finActual
            ? [sellerId, inicioActual, finActual]
            : [sellerId, inicioActual],
        );
        const leadsMontoAnterior: any = await query(
          `SELECT COALESCE(SUM(monto_cerrado_usd), 0) as total FROM leads
           WHERE seller_id = ? AND status = 'CERRADO' AND (motivo_cierre = 'VENTA' OR motivo_cierre = 'GANADO' OR motivo_cierre = 'YA_ES_CLIENTE')
           AND fecha_venta >= ? AND fecha_venta < ?`,
          [sellerId, inicioAnterior, finAnterior],
        );

        const rowsActual = Array.isArray(leadsMontoActual)
          ? leadsMontoActual
          : leadsMontoActual.rows;
        const rowsAnterior = Array.isArray(leadsMontoAnterior)
          ? leadsMontoAnterior
          : leadsMontoAnterior.rows;
        const vLeadsActual = parseFloat(rowsActual?.[0]?.total) || 0;
        const vLeadsAnterior = parseFloat(rowsAnterior?.[0]?.total) || 0;
        crecimientoLeads =
          vLeadsAnterior > 0
            ? ((vLeadsActual - vLeadsAnterior) / vLeadsAnterior) * 100
            : vLeadsActual > 0
              ? 100
              : 0;

        // Ranking leads desde DB (respetando período)
        let rankingLeadsSQL = `
          SELECT s.id as seller_id, COUNT(l.id) as total_cerrados
          FROM sellers s
          LEFT JOIN leads l ON s.id = l.seller_id AND l.motivo_cierre IN ('VENTA', 'GANADO', 'YA_ES_CLIENTE')
            AND l.status = 'CERRADO'
        `;
        const rankingParams: any[] = [];
        if (periodo !== "total" && fechaInicio) {
          rankingLeadsSQL += ` AND l.fecha_venta >= ?`;
          rankingParams.push(fechaInicio);
        }
        if (fechaFin) {
          rankingLeadsSQL += ` AND l.fecha_venta <= ?`;
          rankingParams.push(fechaFin);
        }
        rankingLeadsSQL += ` GROUP BY s.id ORDER BY total_cerrados DESC`;
        const rankingLeadsRes: any = await query(
          rankingLeadsSQL,
          rankingParams,
        );
        const rankingLeadsData = Array.isArray(rankingLeadsRes)
          ? rankingLeadsRes
          : rankingLeadsRes.rows;
        const miEntrada = rankingLeadsData?.find(
          (r: any) => Number(r.seller_id) === Number(sellerId),
        );
        const miTotalCerrados = parseInt(miEntrada?.total_cerrados) || 0;
        const miPosicion =
          rankingLeadsData?.findIndex(
            (r: any) => Number(r.seller_id) === Number(sellerId),
          ) ?? -1;
        // Solo asignar ranking si tiene al menos 1 cierre en el período
        miRankingLeads = miTotalCerrados > 0 ? miPosicion + 1 : 0;
      }
    } catch (_e) {
      // DB leads query failed, defaults remain 0
    }

    return NextResponse.json({
      rankingVentas: rankVentas.findIndex((v) => v[1].id === uid) + 1,
      rankingLeads: miRankingLeads > 0 ? miRankingLeads : "-",
      totalFacturado: totalFacturadoExact,
      closedLeads: misFacturas.length,
      topClients: top5Clientes,
      topProducts: topProductos,
      chartData: chartData,
      crecimiento: crecimiento,
      crecimientoLeads,
      closedLeadsDB,
      montoLeads,
    });
  } catch (e: any) {
    console.error("Error API:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
