import { calcularMetricas } from "@/lib/adminleads/metricas";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles, ROLES_LEADS } from "@/lib/auth/roles";

export const runtime = "nodejs";
export const maxDuration = 60;

const SEDES: Record<string, string> = { "7": "Panama", "9": "Valencia", "10": "Caracas" };

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_LEADS);
  if (auth.error) return auth.error;

  try {
    // Mismos números que el Panel de Métricas desde el que se exporta.
    const m = await calcularMetricas(auth.payload, request.nextUrl.searchParams);
    const { sede, fechaInicio, fechaFin } = m;

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const statsRow = m.stats;

    // Sheet 1: KPIs
    const wsKpi = wb.addWorksheet("KPIs");
    wsKpi.columns = [
      { key: "metrica", width: 52 },
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
      ["Total Ventas (incluye leads de Excel cerrados en el panel)", Number(statsRow.total_ventas || 0)],
      ["Avg. Tiempo Contacto", formatMin(Number(statsRow.avg_tiempo_contacto))],
      ["Avg. Tiempo Cierre", formatMin(Number(statsRow.avg_tiempo_cierre))],
      ["Tasa de Reactivación (%)", Number(statsRow.tasa_reactivacion || 0).toFixed(1) + "%"],
      ["Ventas de Página Web (no suman)", Number(statsRow.ventas_pagina_web || 0)],
      ["Monto de Página Web (USD, no suma)", Number(statsRow.monto_pagina_web || 0)],
      ["Cierres \"Ya es cliente\" (no suman)", Number(statsRow.ventas_ya_cliente || 0)],
      ["Monto \"Ya es cliente\" (USD, no suma)", Number(statsRow.monto_ya_cliente || 0)],
    ];
    kpis.forEach(([metrica, valor]) => wsKpi.addRow({ metrica, valor }));
    wsKpi.getColumn("valor").alignment = { horizontal: "right" };
    for (const c of ["B3", "B10", "B12"]) wsKpi.getCell(c).numFmt = "#,##0.00"; // montos

    // Sheet 2: Leads por Etapa
    const wsStage = wb.addWorksheet("Leads por Etapa");
    wsStage.columns = [
      { key: "etapa", width: 22 },
      { key: "total", width: 12 },
      { key: "ventas", width: 12 },
      { key: "ya_cliente", width: 14 },
      { key: "abandonos", width: 12 },
    ];
    const hdr2s = wsStage.addRow(["Etapa", "Total", "Ventas", "Ya es cliente", "Abandonos"]);
    hdr2s.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    m.stageData.forEach((r: any) => {
      wsStage.addRow({
        etapa: r.status,
        total: Number(r.count),
        ventas: Number(r.venta),
        ya_cliente: Number(r.ya_cliente),
        abandonos: Number(r.abandono),
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
    m.vendorData.forEach((v: any) => {
      wsVendors.addRow({
        name: v.name,
        activos: Number(v.activos),
        ganados: Number(v.ganados),
        perdidos: Number(v.perdidos),
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
    m.ubicacionRanking.forEach((r: any) => {
      wsUbic.addRow({ estado: r.ubicacion_estado, total: Number(r.total) });
    });

    const buffer = await wb.xlsx.writeBuffer();
    const fecha = new Date().toISOString().slice(0, 10);
    const sedeName = sede ? `_${SEDES[String(sede)] || sede}` : "";
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
