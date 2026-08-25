// // import { query } from "@/lib/db";
// // import { NextResponse } from "next/server";

// // export async function GET(request: Request) {
// //   try {
// //     const { searchParams } = new URL(request.url);
// //     const sellerId = searchParams.get("seller_id");
// //     const sellerFilter = sellerId ? "WHERE seller_id = ?" : "";
// //     const sellerParams = sellerId ? [sellerId] : [];

// //     // 1. KPIs Globales (filtrados por vendedor si aplica)
// //     const statsResult: any = await query(`
// //       SELECT
// //         IFNULL(SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre = 'VENTA' THEN monto_cerrado_usd ELSE 0 END), 0) as monto_total,
// //         (SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre = 'VENTA' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100 as tasa_efectividad,
// //         SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre = 'VENTA' THEN 1 ELSE 0 END) as total_ventas_filtradas,
// //         IFNULL(AVG(tiempo_primer_contacto_minutos), 0) as avg_tiempo_contacto,
// //         IFNULL(AVG(
// //           CASE
// //             WHEN fecha_venta IS NOT NULL AND tiempo_primer_contacto_minutos IS NOT NULL
// //             THEN TIMESTAMPDIFF(MINUTE, COALESCE(fecha_ingreso, created_at), fecha_venta) - tiempo_primer_contacto_minutos
// //             ELSE NULL
// //           END
// //         ), 0) as avg_tiempo_cierre,
// //         (SUM(CASE WHEN reactivacion = 1 THEN 1 ELSE 0 END) /
// //          NULLIF(SUM(CASE WHEN reactivacion = 1 OR (status = 'CERRADO' AND motivo_cierre = 'ABANDONO') THEN 1 ELSE 0 END), 0)) * 100 as tasa_reactivacion
// //       FROM leads ${sellerFilter}
// //     `, sellerParams);

// //     // 2. Distribución por etapas (filtrada por vendedor si aplica)
// //     const stageResult: any = await query(`
// //       SELECT
// //         status,
// //         COUNT(*) as count,
// //         SUM(CASE WHEN motivo_cierre = 'VENTA' THEN 1 ELSE 0 END) as venta,
// //         SUM(CASE WHEN status = 'CERRADO' AND (motivo_cierre = 'ABANDONO' OR motivo_cierre IS NULL OR motivo_cierre != 'VENTA') THEN 1 ELSE 0 END) as abandono
// //       FROM leads ${sellerFilter}
// //       GROUP BY status
// //       ORDER BY FIELD(status, 'NUEVO', 'CONTACTADO', 'CERRADO')
// //     `, sellerParams);

// //     // 3. Rendimiento por vendedores
// //     const vendorResult: any = await query(`
// //       SELECT
// //         s.id, s.name,
// //         COUNT(CASE WHEN l.status != 'CERRADO' THEN 1 END) as activos,
// //         COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'VENTA' THEN 1 END) as ganados,
// //         COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'ABANDONO' THEN 1 END) as perdidos,
// //         IFNULL(SUM(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'VENTA' THEN l.monto_cerrado_usd ELSE 0 END), 0) as recaudo,
// //         IFNULL((COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'VENTA' THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 0) as tasa_conversion
// //       FROM sellers s
// //       LEFT JOIN leads l ON s.id = l.seller_id
// //       GROUP BY s.id
// //     `);

// //     // 4. Top 5 Vendedores
// //     // 4. Top 5 Vendedores por Cierre
// //     const topVendorsResult: any = await query(`
// //   SELECT s.name, COUNT(l.id) as total_ventas
// //   FROM sellers s
// //   INNER JOIN leads l ON s.id = l.seller_id
// //   WHERE l.status = 'CERRADO'
// //   AND l.motivo_cierre = 'VENTA'
// //   GROUP BY s.id, s.name
// //   ORDER BY total_ventas DESC
// //   LIMIT 5
// // `);

// //     const statsRow = statsResult.rows?.[0] || {};
// //     const totalVentas = sellerId
// //       ? (parseInt(statsRow.total_ventas_filtradas) || 0)
// //       : vendorResult.rows?.reduce((acc: number, curr: any) => acc + (curr.ganados || 0), 0) || 0;

// //     return NextResponse.json({
// //       stats: { ...statsRow, total_ventas: totalVentas },
// //       stageData: stageResult.rows || [],
// //       vendorData: vendorResult.rows || [],
// //       topVendors: topVendorsResult.rows || [],
// //     });
// //   } catch (error) {
// //     console.error("Error en API stats:", error);
// //     return NextResponse.json(
// //       { error: "Error en base de datos" },
// //       { status: 500 },
// //     );
// //   }
// // }
// import { query } from "@/lib/db";
// import { NextResponse } from "next/server";

// export async function GET(request: Request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const sellerId = searchParams.get("seller_id");
//     const sellerFilter = sellerId ? "WHERE seller_id = ?" : "";
//     const sellerParams = sellerId ? [sellerId] : [];

//     // 1. KPIs Globales (filtrados por vendedor si aplica)
//     const statsResult: any = await query(
//       `
//       SELECT
//         IFNULL(SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre = 'VENTA' THEN monto_cerrado_usd ELSE 0 END), 0) as monto_total,
//         (SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre = 'VENTA' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100 as tasa_efectividad,
//         SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre = 'VENTA' THEN 1 ELSE 0 END) as total_ventas_filtradas,
//         IFNULL(AVG(tiempo_primer_contacto_minutos), 0) as avg_tiempo_contacto,
//         IFNULL(AVG(
//           CASE
//             WHEN fecha_venta IS NOT NULL AND tiempo_primer_contacto_minutos IS NOT NULL
//             THEN TIMESTAMPDIFF(MINUTE, COALESCE(fecha_ingreso, created_at), fecha_venta) - tiempo_primer_contacto_minutos
//             ELSE NULL
//           END
//         ), 0) as avg_tiempo_cierre,
//         (SUM(CASE WHEN reactivacion = 1 THEN 1 ELSE 0 END) /
//          NULLIF(SUM(CASE WHEN reactivacion = 1 OR (status = 'CERRADO' AND motivo_cierre = 'ABANDONO') THEN 1 ELSE 0 END), 0)) * 100 as tasa_reactivacion
//       FROM leads ${sellerFilter}
//     `,
//       sellerParams,
//     );

//     // 2. Distribución por etapas (filtrada por vendedor si aplica)
//     const stageResult: any = await query(
//       `
//       SELECT
//         l.status,
//         COUNT(*) as count,
//         SUM(CASE WHEN l.motivo_cierre = 'VENTA' THEN 1 ELSE 0 END) as venta,
//         SUM(CASE WHEN l.status = 'CERRADO' AND (l.motivo_cierre = 'ABANDONO' OR l.motivo_cierre IS NULL OR l.motivo_cierre != 'VENTA') THEN 1 ELSE 0 END) as abandono,
//         COALESCE(ls.order_index, 9999) as order_index
//       FROM leads l
//       LEFT JOIN lead_statuses ls ON l.status COLLATE utf8mb4_unicode_ci = ls.name COLLATE utf8mb4_unicode_ci
//       ${sellerId ? "WHERE l.seller_id = ?" : ""}
//       GROUP BY l.status, ls.order_index
//       ORDER BY order_index ASC
//     `,
//       sellerParams,
//     );

//     // 3. Rendimiento por vendedores
//     const vendorResult: any = await query(`
//       SELECT
//         s.id, s.name,
//         COUNT(CASE WHEN l.status != 'CERRADO' THEN 1 END) as activos,
//         COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'VENTA' THEN 1 END) as ganados,
//         COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'ABANDONO' THEN 1 END) as perdidos,
//         IFNULL(SUM(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'VENTA' THEN l.monto_cerrado_usd ELSE 0 END), 0) as recaudo,
//         IFNULL((COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'VENTA' THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 0) as tasa_conversion
//       FROM sellers s
//       LEFT JOIN leads l ON s.id = l.seller_id
//       GROUP BY s.id
//     `);

//     // 4. Top 5 Vendedores
//     // 4. Top 5 Vendedores por Cierre
//     const topVendorsResult: any = await query(`
//   SELECT s.name, COUNT(l.id) as total_ventas
//   FROM sellers s
//   INNER JOIN leads l ON s.id = l.seller_id
//   WHERE l.status = 'CERRADO'
//   AND l.motivo_cierre = 'VENTA'
//   GROUP BY s.id, s.name
//   ORDER BY total_ventas DESC
//   LIMIT 5
// `);

//     // 5. Ranking de estados por volumen de leads
//     const ubicacionRankingResult: any = await query(
//       `
//       SELECT ubicacion_estado, COUNT(*) as total
//       FROM leads
//       WHERE ubicacion_estado IS NOT NULL AND ubicacion_estado != ''
//       ${sellerId ? "AND seller_id = ?" : ""}
//       GROUP BY ubicacion_estado
//       ORDER BY total DESC
//       LIMIT 10
//     `,
//       sellerParams,
//     );

//     const statsRow = statsResult.rows?.[0] || {};
//     const totalVentas = sellerId
//       ? parseInt(statsRow.total_ventas_filtradas) || 0
//       : vendorResult.rows?.reduce(
//           (acc: number, curr: any) => acc + (curr.ganados || 0),
//           0,
//         ) || 0;

//     return NextResponse.json({
//       stats: { ...statsRow, total_ventas: totalVentas },
//       stageData: stageResult.rows || [],
//       vendorData: vendorResult.rows || [],
//       topVendors: topVendorsResult.rows || [],
//       ubicacionRanking: ubicacionRankingResult.rows || [],
//     });
//   } catch (error: any) {
//     console.error("Error en API stats:", error);
//     return NextResponse.json(
//       {
//         error: "Error en base de datos",
//         detail: error?.message || String(error),
//       },
//       { status: 500 },
//     );
//   }
// }
import { db, query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader?.split(";").find((c) => c.trim().startsWith("token="))?.split("=")[1];
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userCids = payload.cids as number;

    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("seller_id");
    const canal = searchParams.get("canal");
    let sede = searchParams.get("sede"); // cids value: "9" (Valencia) or "10" (Caracas)
    if (userCids === 7) sede = "7";
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const fechaInicio = dateRegex.test(searchParams.get("fecha_inicio") || "") ? searchParams.get("fecha_inicio") : null;
    const fechaFin = dateRegex.test(searchParams.get("fecha_fin") || "") ? searchParams.get("fecha_fin") : null;

    // Build filter conditions
    const conditions: string[] = [];
    const params: any[] = [];

    if (sede) {
      conditions.push("seller_id IN (SELECT id FROM sellers WHERE cids = ?)");
      params.push(parseInt(sede));
    } else if (userCids !== 7) {
      // Venezuela admin leads: exclude Panama sellers
      conditions.push("seller_id IN (SELECT id FROM sellers WHERE cids != 7)");
    }
    if (sellerId) {
      conditions.push("seller_id = ?");
      params.push(sellerId);
    }
    if (canal) {
      // "Sin canal" agrupa los leads sin origen registrado.
      if (canal === "Sin canal") {
        conditions.push("(canal_origen IS NULL OR canal_origen = '')");
      } else {
        conditions.push("canal_origen = ?");
        params.push(canal);
      }
    }
    if (fechaInicio) {
      conditions.push("COALESCE(fecha_venta, fecha_ingreso, created_at) >= ?");
      params.push(`${fechaInicio} 00:00:00`);
    }
    if (fechaFin) {
      conditions.push("COALESCE(fecha_venta, fecha_ingreso, created_at) <= ?");
      params.push(`${fechaFin} 23:59:59`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // 1. KPIs Globales
    const statsResult: any = await query(
      `
      SELECT
        COUNT(*) as total_leads,
        IFNULL(SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO') THEN monto_cerrado_usd ELSE 0 END), 0) as monto_total,
        (SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO') THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0)) * 100 as tasa_efectividad,
        SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO') THEN 1 ELSE 0 END) as total_ventas_filtradas,
        IFNULL(AVG(tiempo_primer_contacto_minutos), 0) as avg_tiempo_contacto,
        IFNULL(AVG(CASE WHEN fecha_venta IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, COALESCE(fecha_ingreso, created_at), fecha_venta) ELSE NULL END), 0) as avg_tiempo_cierre,
        (SUM(CASE WHEN reactivacion = 1 THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN reactivacion = 1 OR (status = 'CERRADO' AND motivo_cierre = 'ABANDONO') THEN 1 ELSE 0 END), 0)) * 100 as tasa_reactivacion
      FROM leads ${whereClause}
    `,
      params,
    );

    // 2. Distribución por etapas
    const stageConditions = conditions.map((c) =>
      c
        .replace(/\bseller_id\b/g, "l.seller_id")
        .replace(/\bfecha_venta\b/g, "l.fecha_venta")
        .replace(/\bfecha_ingreso\b/g, "l.fecha_ingreso")
        .replace(/\bcreated_at\b/g, "l.created_at"),
    );
    const stageWhere =
      stageConditions.length > 0
        ? `WHERE ${stageConditions.join(" AND ")}`
        : "";
    const stageResult: any = await query(
      `
      SELECT
        l.status,
        COUNT(*) as count,
        SUM(CASE WHEN l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 ELSE 0 END) as venta,
        SUM(CASE WHEN l.status = 'CERRADO' AND (l.motivo_cierre = 'ABANDONO' OR l.motivo_cierre IS NULL OR l.motivo_cierre NOT IN ('VENTA', 'GANADO')) THEN 1 ELSE 0 END) as abandono,
        COALESCE(ls.order_index, 9999) as order_index
      FROM leads l
      LEFT JOIN lead_statuses ls ON l.status COLLATE utf8mb4_unicode_ci = ls.name COLLATE utf8mb4_unicode_ci
      ${stageWhere}
      GROUP BY l.status, ls.order_index
      ORDER BY order_index ASC
    `,
      params,
    );

    // 3. Rendimiento por vendedores
    const sedeJoin = sede ? `AND s.cids = ${parseInt(sede)}` : userCids !== 7 ? "AND s.cids != 7" : "";
    // El canal se valida contra la lista real de la tabla antes de interpolarlo,
    // porque esta consulta arma el SQL por concatenacion y no por parametros.
    const canalesResult: any = await query(
      "SELECT DISTINCT canal_origen FROM leads WHERE canal_origen IS NOT NULL AND canal_origen != ''",
    );
    const canalesDisponibles: string[] = (canalesResult.rows || []).map(
      (r: any) => r.canal_origen,
    );
    const canalJoinCond =
      canal === "Sin canal"
        ? "AND (l.canal_origen IS NULL OR l.canal_origen = '')"
        : canal && canalesDisponibles.includes(canal)
          ? `AND l.canal_origen = ${db.escape(canal)}`
          : "";

    const dateJoinCond = [
      fechaInicio ? `AND COALESCE(l.fecha_venta, l.fecha_ingreso, l.created_at) >= '${fechaInicio} 00:00:00'` : "",
      fechaFin ? `AND COALESCE(l.fecha_venta, l.fecha_ingreso, l.created_at) <= '${fechaFin} 23:59:59'` : "",
      canalJoinCond,
    ].join(" ");
    const vendorResult: any = await query(`
      SELECT
        s.id, s.name,
        COUNT(CASE WHEN l.status != 'CERRADO' THEN 1 END) as activos,
        COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 END) as ganados,
        COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'ABANDONO' THEN 1 END) as perdidos,
        IFNULL(SUM(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO') THEN l.monto_cerrado_usd ELSE 0 END), 0) as recaudo,
        IFNULL((COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 0) as tasa_conversion
      FROM sellers s
      LEFT JOIN leads l ON s.id = l.seller_id ${sellerId ? "AND l.seller_id = " + parseInt(sellerId) : ""} ${dateJoinCond}
      WHERE (s.activo = 1 OR l.id IS NOT NULL) ${sedeJoin}
      GROUP BY s.id
    `);

    // 4. Top 5 Vendedores por Cierre
    const topVendorsResult: any = await query(`
      SELECT s.name, COUNT(l.id) as total_ventas
      FROM sellers s
      INNER JOIN leads l ON s.id = l.seller_id
      WHERE l.status = 'CERRADO'
      AND l.motivo_cierre IN ('VENTA', 'GANADO')
      AND s.activo = 1
      ${sede ? `AND s.cids = ${parseInt(sede)}` : ""}
      ${fechaInicio ? `AND COALESCE(l.fecha_venta, l.fecha_ingreso, l.created_at) >= '${fechaInicio} 00:00:00'` : ""}
      ${fechaFin ? `AND COALESCE(l.fecha_venta, l.fecha_ingreso, l.created_at) <= '${fechaFin} 23:59:59'` : ""}
      GROUP BY s.id, s.name
      ORDER BY total_ventas DESC
      LIMIT 5
    `);

    // 5. Ranking de estados por volumen de leads
    const ubicacionRankingResult: any = await query(
      `
      SELECT ubicacion_estado, COUNT(*) as total
      FROM leads
      ${whereClause ? whereClause + " AND ubicacion_estado IS NOT NULL AND ubicacion_estado != ''" : "WHERE ubicacion_estado IS NOT NULL AND ubicacion_estado != ''"}
      GROUP BY ubicacion_estado
      ORDER BY total DESC
      LIMIT 10
    `,
      params,
    );

    const statsRow = statsResult.rows?.[0] || {};
    // Las ventas salen siempre de la query principal sobre `leads`, igual que
    // Monto total y Efectividad. Antes, sin sede ni vendedor elegido, se sumaba
    // vendorResult, que arranca en `sellers` con `activo = 1`: una venta hecha
    // por un vendedor dado de baja desaparecia de la tarjeta de Cierres aunque
    // si estuviera contada en el monto y en la efectividad.
    const totalVentas = parseInt(statsRow.total_ventas_filtradas) || 0;

    // 6. Top productos sin stock (motivo_perdido = 'Sin inventario')
    const topProductosSinStockResult: any = await query(`
      SELECT producto_perdido as producto, COUNT(*) as total
      FROM leads
      WHERE status = 'CERRADO'
        AND motivo_cierre = 'PERDIDO'
        AND motivo_perdido = 'Sin inventario'
        AND producto_perdido IS NOT NULL
        AND producto_perdido != ''
        AND producto_perdido != 'OTRO'
        ${sede ? `AND seller_id IN (SELECT id FROM sellers WHERE cids = ${parseInt(sede)})` : ""}
        ${fechaInicio ? `AND COALESCE(fecha_venta, fecha_ingreso, created_at) >= '${fechaInicio} 00:00:00'` : ""}
        ${fechaFin ? `AND COALESCE(fecha_venta, fecha_ingreso, created_at) <= '${fechaFin} 23:59:59'` : ""}
      GROUP BY producto_perdido
      ORDER BY total DESC
      LIMIT 10
    `);

    return NextResponse.json({
      stats: { ...statsRow, total_ventas: totalVentas },
      canales: canalesDisponibles,
      stageData: stageResult.rows || [],
      vendorData: vendorResult.rows || [],
      topVendors: topVendorsResult.rows || [],
      ubicacionRanking: ubicacionRankingResult.rows || [],
      topProductosSinStock: topProductosSinStockResult.rows || [],
    });
  } catch (error: any) {
    console.error("Error en API stats:", error);
    return NextResponse.json(
      {
        error: "Error en base de datos",
        detail: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}
