import { canalNormalizadoSql, SIN_CANAL } from "@/lib/canales";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

const SEDES: Record<string, string> = { "7": "Panama", "9": "Valencia", "10": "Caracas" };

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const userCids = auth.payload!.cids as number;

    const { searchParams } = new URL(request.url);
    const sellerId = searchParams.get("seller_id");
    const canal = searchParams.get("canal");
    let sede = searchParams.get("sede");
    if (userCids === 7) sede = "7";
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const fechaInicio = dateRegex.test(searchParams.get("fecha_inicio") || "") ? searchParams.get("fecha_inicio") : null;
    const fechaFin = dateRegex.test(searchParams.get("fecha_fin") || "") ? searchParams.get("fecha_fin") : null;

    const conditions: string[] = [];
    const params: any[] = [];

    if (sede) {
      conditions.push("seller_id IN (SELECT id FROM sellers WHERE cids = ?)");
      params.push(parseInt(sede));
    } else if (userCids !== 7) {
      conditions.push("seller_id IN (SELECT id FROM sellers WHERE cids != 7)");
    }
    if (sellerId) {
      conditions.push("seller_id = ?");
      params.push(sellerId);
    }
    if (canal) {
      conditions.push(`${canalNormalizadoSql("canal_origen")} = ?`);
      params.push(canal);
    }
    // Mismo criterio que el Panel de Metricas (ver app/api/adminleads/stats):
    // los leads pertenecen al periodo por su fecha de ENTRADA y las ventas por
    // su FECHA_VENTA. Si el export usara otro criterio, el Excel no cuadraria
    // con las tarjetas desde las que se exporta.
    const conFechas = Boolean(fechaInicio && fechaFin);
    const rangoParams = conFechas
      ? [`${fechaInicio} 00:00:00`, `${fechaFin} 23:59:59`]
      : [];

    const ES_VENTA =
      "status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO')";
    const entradaEnPeriodo = conFechas
      ? "COALESCE(fecha_ingreso, created_at) BETWEEN ? AND ?"
      : "1=1";
    const ventaEnPeriodo = conFechas
      ? `${ES_VENTA} AND fecha_venta IS NOT NULL AND fecha_venta BETWEEN ? AND ?`
      : ES_VENTA;

    if (conFechas) {
      conditions.push(`((${entradaEnPeriodo}) OR (${ventaEnPeriodo}))`);
      params.push(...rangoParams, ...rangoParams);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const statsResult: any = await query(`
      SELECT
        SUM(CASE WHEN ${entradaEnPeriodo} THEN 1 ELSE 0 END) as total_leads,
        IFNULL(SUM(CASE WHEN ${ventaEnPeriodo} THEN monto_cerrado_usd ELSE 0 END), 0) as monto_total,
        (SUM(CASE WHEN ${entradaEnPeriodo} AND ${ES_VENTA} THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN ${entradaEnPeriodo} THEN 1 ELSE 0 END), 0)) * 100 as tasa_efectividad,
        SUM(CASE WHEN ${ventaEnPeriodo} THEN 1 ELSE 0 END) as total_ventas,
        IFNULL(AVG(tiempo_primer_contacto_minutos), 0) as avg_tiempo_contacto,
        IFNULL(AVG(CASE WHEN fecha_venta IS NOT NULL THEN TIMESTAMPDIFF(MINUTE, COALESCE(fecha_ingreso, created_at), fecha_venta) ELSE NULL END), 0) as avg_tiempo_cierre,
        (SUM(CASE WHEN reactivacion = 1 THEN 1 ELSE 0 END) /
         NULLIF(SUM(CASE WHEN reactivacion = 1 OR (status = 'CERRADO' AND motivo_cierre = 'ABANDONO') THEN 1 ELSE 0 END), 0)) * 100 as tasa_reactivacion
      FROM leads ${whereClause}
    `, [...Array(5).fill(rangoParams).flat(), ...params]);

    const sedeJoin = sede ? `AND s.cids = ${parseInt(sede)}` : userCids !== 7 ? "AND s.cids != 7" : "";
    // Esta consulta arma el SQL por concatenacion: el canal se valida contra la
    // lista real antes de incrustarlo, nunca se interpola lo que llego crudo.
    const canalesResult: any = await query(
      `SELECT DISTINCT ${canalNormalizadoSql("canal_origen")} AS canal FROM leads`,
    );
    const canalesDisponibles: string[] = (canalesResult.rows || []).map(
      (r: any) => r.canal,
    );
    const canalJoinCond =
      canal && (canal === SIN_CANAL || canalesDisponibles.includes(canal))
        ? `AND ${canalNormalizadoSql("l.canal_origen")} = '${canal.replace(/'/g, "''")}'`
        : "";

    const dateJoinCond = [
      fechaInicio ? `AND COALESCE(l.fecha_venta, l.fecha_ingreso, l.created_at) >= '${fechaInicio} 00:00:00'` : "",
      fechaFin ? `AND COALESCE(l.fecha_venta, l.fecha_ingreso, l.created_at) <= '${fechaFin} 23:59:59'` : "",
      canalJoinCond,
    ].join(" ");
    const vendorResult: any = await query(`
      SELECT
        s.name,
        COUNT(CASE WHEN l.status != 'CERRADO' THEN 1 END) as activos,
        COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 END) as ganados,
        COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre = 'ABANDONO' THEN 1 END) as perdidos,
        IFNULL(SUM(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO') THEN l.monto_cerrado_usd ELSE 0 END), 0) as recaudo,
        IFNULL((COUNT(CASE WHEN l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 END) / NULLIF(COUNT(*), 0)) * 100, 0) as tasa_conversion
      FROM sellers s
      LEFT JOIN leads l ON s.id = l.seller_id ${sellerId ? `AND l.seller_id = ${parseInt(sellerId)}` : ""} ${dateJoinCond}
      WHERE 1=1 AND s.activo = 1 ${sedeJoin}
      GROUP BY s.id, s.name
    `);

    const stageConditions = conditions.map((c) =>
      c
        .replace(/\bseller_id\b/g, "l.seller_id")
        .replace(/\bfecha_venta\b/g, "l.fecha_venta")
        .replace(/\bfecha_ingreso\b/g, "l.fecha_ingreso")
        .replace(/\bcreated_at\b/g, "l.created_at")
    );
    const stageWhere = stageConditions.length > 0 ? `WHERE ${stageConditions.join(" AND ")}` : "";
    const stageResult: any = await query(`
      SELECT
        l.status,
        COUNT(*) as total,
        SUM(CASE WHEN l.motivo_cierre IN ('VENTA', 'GANADO') THEN 1 ELSE 0 END) as ventas,
        SUM(CASE WHEN l.status = 'CERRADO' AND (l.motivo_cierre = 'ABANDONO' OR l.motivo_cierre IS NULL OR l.motivo_cierre NOT IN ('VENTA', 'GANADO')) THEN 1 ELSE 0 END) as abandonos,
        COALESCE(ls.order_index, 9999) as order_index
      FROM leads l
      LEFT JOIN lead_statuses ls ON l.status COLLATE utf8mb4_unicode_ci = ls.name COLLATE utf8mb4_unicode_ci
      ${stageWhere}
      GROUP BY l.status, ls.order_index
      ORDER BY order_index ASC
    `, params);

    const ubicacionResult: any = await query(`
      SELECT ubicacion_estado, COUNT(*) as total
      FROM leads
      ${whereClause ? whereClause + " AND ubicacion_estado IS NOT NULL AND ubicacion_estado != ''" : "WHERE ubicacion_estado IS NOT NULL AND ubicacion_estado != ''"}
      GROUP BY ubicacion_estado
      ORDER BY total DESC
      LIMIT 10
    `, params);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const statsRow = statsResult.rows?.[0] || {};

    // Sheet 1: KPIs
    const wsKpi = wb.addWorksheet("KPIs");
    wsKpi.columns = [
      { key: "metrica", width: 30 },
      { key: "valor", width: 20 },
    ];
    const hdr1 = wsKpi.addRow(["Métrica", "Valor"]);
    hdr1.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const formatMin = (min: number) => {
      if (!min || min <= 0) return "< 1m";
      const d = Math.floor(min / 1440);
      const h = Math.floor((min % 1440) / 60);
      const m = Math.round(min % 60);
      if (d > 0) return `${d}d ${h}h ${m}m`;
      if (h > 0) return `${h}h ${m}m`;
      return `${m}m`;
    };

    const kpis = [
      ["Total Leads", Number(statsRow.total_leads || 0)],
      ["Monto Total (USD)", Number(statsRow.monto_total || 0)],
      ["Tasa de Efectividad (%)", Number(statsRow.tasa_efectividad || 0).toFixed(1) + "%"],
      ["Total Ventas", Number(statsRow.total_ventas || 0)],
      ["Avg. Tiempo Contacto", formatMin(Number(statsRow.avg_tiempo_contacto))],
      ["Avg. Tiempo Cierre", formatMin(Number(statsRow.avg_tiempo_cierre))],
      ["Tasa de Reactivación (%)", Number(statsRow.tasa_reactivacion || 0).toFixed(1) + "%"],
    ];
    kpis.forEach(([metrica, valor]) => wsKpi.addRow({ metrica, valor }));
    wsKpi.getColumn("valor").alignment = { horizontal: "right" };
    wsKpi.getCell("B2").numFmt = "#,##0.00";

    // Sheet 2: Leads por Etapa
    const wsStage = wb.addWorksheet("Leads por Etapa");
    wsStage.columns = [
      { key: "etapa", width: 22 },
      { key: "total", width: 12 },
      { key: "ventas", width: 12 },
      { key: "abandonos", width: 12 },
    ];
    const hdr2s = wsStage.addRow(["Etapa", "Total", "Ventas", "Abandonos"]);
    hdr2s.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    (stageResult.rows || []).forEach((r: any) => {
      wsStage.addRow({
        etapa: r.status,
        total: Number(r.total),
        ventas: Number(r.ventas),
        abandonos: Number(r.abandonos),
      });
    });

    // Sheet 3: Vendedores
    const wsVendors = wb.addWorksheet("Rendimiento por Vendedor");
    wsVendors.columns = [
      { key: "name", width: 28 },
      { key: "activos", width: 12 },
      { key: "ganados", width: 12 },
      { key: "perdidos", width: 12 },
      { key: "recaudo", width: 18 },
      { key: "tasa_conversion", width: 16 },
    ];
    const hdr4 = wsVendors.addRow(["Vendedor", "Activos", "Ganados", "Perdidos", "Recaudo (USD)", "Conversión (%)"]);
    hdr4.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    (vendorResult.rows || []).forEach((v: any) => {
      wsVendors.addRow({
        name: v.name,
        activos: v.activos,
        ganados: v.ganados,
        perdidos: v.perdidos,
        recaudo: Number(v.recaudo),
        tasa_conversion: Number(v.tasa_conversion).toFixed(1) + "%",
      });
    });
    wsVendors.getColumn("recaudo").numFmt = "#,##0.00";

    // Sheet 4: Ubicaciones
    const wsUbic = wb.addWorksheet("Leads por Estado");
    wsUbic.columns = [
      { key: "estado", width: 28 },
      { key: "total", width: 14 },
    ];
    const hdr5 = wsUbic.addRow(["Estado", "Total Leads"]);
    hdr5.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    (ubicacionResult.rows || []).forEach((r: any) => {
      wsUbic.addRow({ estado: r.ubicacion_estado, total: Number(r.total) });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const fecha = new Date().toISOString().slice(0, 10);
    const sedeName = sede ? `_${SEDES[sede] || sede}` : "";
    const rangeName = fechaInicio && fechaFin ? `_${fechaInicio}_al_${fechaFin}` : fechaInicio ? `_desde_${fechaInicio}` : fechaFin ? `_hasta_${fechaFin}` : "";
    const filename = `metricas${sedeName}${rangeName}_${fecha}.xlsx`;

    return new NextResponse(buffer as any, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error exportando métricas:", error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}
