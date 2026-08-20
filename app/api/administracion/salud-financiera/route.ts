import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const companyIds = empresa && COMPANY_MAP[empresa] ? [COMPANY_MAP[empresa]] : [7, 9, 10];

    // ═══════════════════════════════════════════════════════════════
    // 1. CUENTAS POR COBRAR (25 pts — 6 KPIs)
    // ═══════════════════════════════════════════════════════════════
    const cxcDomain: any[] = [["company_id", "in", companyIds], ["amount_residual", ">", 0]];
    const cxcData = await callOdooRPC<any[]>("digiflex.cxc.report", "search_read", [cxcDomain], {
      fields: ["amount_residual", "amount_current", "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus", "days_overdue", "partner_name", "invoice_date", "date_maturity"],
      limit: 5000,
    }) || [];

    const totalReceivable = cxcData.reduce((s: number, r: any) => s + Math.abs(r.amount_residual || 0), 0);
    const totalCurrent = cxcData.reduce((s: number, r: any) => s + Math.abs(r.amount_current || 0), 0);
    const total1_30 = cxcData.reduce((s: number, r: any) => s + Math.abs(r.amount_1_30 || 0), 0);
    const total31_60 = cxcData.reduce((s: number, r: any) => s + Math.abs(r.amount_31_60 || 0), 0);
    const total61_90 = cxcData.reduce((s: number, r: any) => s + Math.abs(r.amount_61_90 || 0), 0);
    const total91Plus = cxcData.reduce((s: number, r: any) => s + Math.abs(r.amount_91_plus || 0), 0);
    const totalOverdue = total1_30 + total31_60 + total61_90 + total91Plus;

    const carteraVencidaPct = totalReceivable > 0 ? Math.round((totalOverdue / totalReceivable) * 10000) / 100 : 0;
    const efectividad = totalReceivable > 0 ? Math.round((totalCurrent / totalReceivable) * 10000) / 100 : 0;
    const dsoWeighted = total1_30 + total31_60 + total61_90 + total91Plus;
    const dso = dsoWeighted > 0 ? Math.round(((total1_30 * 15) + (total31_60 * 45) + (total61_90 * 75) + (total91Plus * 105)) / dsoWeighted) : 0;
    const cartera90 = total91Plus;
    const cartera90Pct = totalReceivable > 0 ? Math.round((total91Plus / totalReceivable) * 10000) / 100 : 0;

    const cxCobros = cxcData.filter((r: any) => (r.amount_current || 0) > 0).length;
    const cxTotal = cxcData.length;
    const cumplimientoCobranza = cxTotal > 0 ? Math.round((cxCobros / cxTotal) * 10000) / 100 : 0;

    const clientesLimite = cxcData.filter((r: any) => r.days_overdue > 30).length;

    const cxCobrosMeta = await query("SELECT meta_mensual FROM kpi_targets WHERE kpi_key = 'efectividad_cobranza' AND company_id = ? LIMIT 1", [companyIds[0]]);
    const metaCobranza = (cxCobrosMeta.rows as any[])[0]?.meta_mensual || 95;

    const cxCategoria = {
      name: "Cuentas por Cobrar",
      weight: 25,
      kpis: [
        { id: "cartera_vencida", name: "Cartera Vencida", value: carteraVencidaPct, unit: "%", target: 10, status: carteraVencidaPct <= 10 ? "verde" : carteraVencidaPct <= 20 ? "amarillo" : "rojo", trend: "vs mes anterior" },
        { id: "dso", name: "DSO (Días de Cobro)", value: dso, unit: "días", target: 45, status: dso <= 45 ? "verde" : dso <= 60 ? "amarillo" : "rojo", trend: "vs mes anterior" },
        { id: "cumplimiento_cobranza", name: "Cumplimiento Meta Cobranza", value: efectividad, unit: "%", target: metaCobranza, status: efectividad >= metaCobranza ? "verde" : efectividad >= metaCobranza * 0.8 ? "amarillo" : "rojo", trend: "vs mes anterior" },
        { id: "cartera_90", name: "Cartera +90 días", value: cartera90Pct, unit: "%", target: 5, status: cartera90Pct <= 5 ? "verde" : cartera90Pct <= 10 ? "amarillo" : "rojo", trend: "vs mes anterior", detail: cartera90 },
        { id: "promesas_pago", name: "Promesas de Pago Cumplidas", value: cumplimientoCobranza, unit: "%", target: 80, status: cumplimientoCobranza >= 80 ? "verde" : cumplimientoCobranza >= 60 ? "amarillo" : "rojo", trend: "vs mes anterior" },
        { id: "clientes_limite", name: "Clientes Excedidos Límite", value: clientesLimite, unit: "clientes", target: 5, status: clientesLimite <= 5 ? "verde" : clientesLimite <= 15 ? "amarillo" : "rojo", trend: "vs mes anterior" },
      ],
    };

    // ═══════════════════════════════════════════════════════════════
    // 2. CUENTAS POR PAGAR (15 pts — 5 KPIs)
    // ═══════════════════════════════════════════════════════════════
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const monthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-01`;
    const in30Days = new Date(today.getTime() + 30 * 86400000);
    const in30Str = `${in30Days.getFullYear()}-${String(in30Days.getMonth() + 1).padStart(2, "0")}-${String(in30Days.getDate()).padStart(2, "0")}`;

    const cxpDomain: any[] = [
      ["company_id", "in", companyIds],
      ["move_type", "=", "in_invoice"],
      ["state", "=", "posted"],
      ["invoice_date_due", ">=", monthStart],
    ];
    const cxpData = await callOdooRPC<any[]>("account.move", "search_read", [cxpDomain], {
      fields: ["amount_total", "amount_residual", "invoice_date_due", "payment_state", "invoice_date"],
      limit: 5000,
    }) || [];

    const cxpTotal = cxpData.length;
    const cxpPagadasATiempo = cxpData.filter((inv: any) => inv.payment_state === "paid" || inv.amount_residual <= 0).length;
    const pagosATiempoPct = cxpTotal > 0 ? Math.round((cxpPagadasATiempo / cxpTotal) * 10000) / 100 : 0;

    const cxpVencidas = cxpData.filter((inv: any) => {
      if (inv.payment_state === "paid" || inv.amount_residual <= 0) return false;
      return inv.invoice_date_due < todayStr;
    });
    const obligacionesVencidas = cxpVencidas.length;
    const obligacionesVencidasMonto = cxpVencidas.reduce((s: number, inv: any) => s + Math.abs(inv.amount_residual || 0), 0);

    const cxpProximas30 = cxpData.filter((inv: any) => {
      if (inv.payment_state === "paid" || inv.amount_residual <= 0) return false;
      return inv.invoice_date_due >= todayStr && inv.invoice_date_due <= in30Str;
    });
    const coberturaPagos = cxpProximas30.reduce((s: number, inv: any) => s + Math.abs(inv.amount_residual || 0), 0);

    const facturasPendientes = cxpData.filter((inv: any) => inv.payment_state !== "paid" && inv.amount_residual > 0).length;

    const cxpCategoria = {
      name: "Cuentas por Pagar",
      weight: 15,
      kpis: [
        { id: "pagos_a_tiempo", name: "Pagos Realizados a Tiempo", value: pagosATiempoPct, unit: "%", target: 90, status: pagosATiempoPct >= 90 ? "verde" : pagosATiempoPct >= 75 ? "amarillo" : "rojo", trend: "vs mes anterior" },
        { id: "obligaciones_vencidas", name: "Obligaciones Vencidas", value: obligacionesVencidas, unit: "facturas", target: 0, status: obligacionesVencidas === 0 ? "verde" : obligacionesVencidas <= 5 ? "amarillo" : "rojo", trend: "vs mes anterior", detail: obligacionesVencidasMonto },
        { id: "cobertura_pagos_30d", name: "Cobertura Pagos Próx. 30 Días", value: coberturaPagos, unit: "$", target: 0, status: "info", trend: "_vs mes anterior" },
        { id: "facturas_pendientes", name: "Facturas Pendientes Procesar", value: facturasPendientes, unit: "facturas", target: 10, status: facturasPendientes <= 10 ? "verde" : facturasPendientes <= 30 ? "amarillo" : "rojo", trend: "vs mes anterior" },
        { id: "dpo", name: "DPO (Días de Pago)", value: dsoWeighted > 0 ? Math.round(((total1_30 * 15) + (total31_60 * 45) + (total61_90 * 75) + (total91Plus * 105)) / dsoWeighted) : 0, unit: "días", target: 45, status: "info", trend: "vs mes anterior" },
      ],
    };

    // ═══════════════════════════════════════════════════════════════
    // 3. TESORERÍA Y LIQUIDEZ (25 pts — 6 KPIs) — Placeholder
    // ═══════════════════════════════════════════════════════════════
    const tesoreriaCategoria = {
      name: "Tesorería y Liquidez",
      weight: 25,
      kpis: [
        { id: "cobertura_caja_30d", name: "Cobertura Caja 30 Días", value: null, unit: "%", target: 100, status: "pendiente", trend: "Requiere saldo bancario" },
        { id: "flujo_proyectado_30d", name: "Flujo Proyectado 30 Días", value: null, unit: "$", target: 0, status: "pendiente", trend: "Requiere proyección manual" },
        { id: "cobros_esperados", name: "Cobros Esperados vs Realizados", value: null, unit: "%", target: 90, status: "pendiente", trend: "Requiere data de cobros" },
        { id: "disponibilidad_bancaria", name: "Disponibilidad Bancaria", value: null, unit: "$", target: 0, status: "pendiente", trend: "Requiere saldo bancario" },
        { id: "exactitud_proyeccion", name: "Exactitud Proyección Caja", value: null, unit: "%", target: 95, status: "pendiente", trend: "Requiere data histórica" },
        { id: "conciliaciones_dia", name: "Conciliaciones Bancarias al Día", value: null, unit: "días", target: 1, status: "pendiente", trend: "Requiere data de conciliación" },
      ],
    };

    // ═══════════════════════════════════════════════════════════════
    // ÍNDICE GENERAL
    // ═══════════════════════════════════════════════════════════════
    function calcCategoriaScore(cat: any): number {
      let scored = 0;
      let total = 0;
      cat.kpis.forEach((kpi: any) => {
        if (kpi.status === "pendiente") return;
        total++;
        if (kpi.status === "verde") scored++;
        else if (kpi.status === "amarillo") scored += 0.5;
      });
      return total > 0 ? Math.round((scored / total) * 100) : 0;
    }

    const cxCxScore = calcCategoriaScore(cxCategoria);
    const cxpScore = calcCategoriaScore(cxpCategoria);
    const tesoreriaScore = calcCategoriaScore(tesoreriaCategoria);

    const totalEvaluados = cxCategoria.weight + cxpCategoria.weight;
    const puntosObtenidos = Math.round((cxCxScore * cxCategoria.weight + cxpScore * cxpCategoria.weight) / 100);
    const indiceGeneral = totalEvaluados > 0 ? Math.round((puntosObtenidos / totalEvaluados) * 100) : 0;

    const clasificacion = indiceGeneral >= 90 ? "Excelente" : indiceGeneral >= 75 ? "Atención" : "Acción inmediata";
    const clasificacionColor = indiceGeneral >= 90 ? "verde" : indiceGeneral >= 75 ? "amarillo" : "rojo";

    return NextResponse.json({
      success: true,
      data: {
        indice: { value: indiceGeneral, puntos: puntosObtenidos, maxPuntos: totalEvaluados, clasificacion, clasificacionColor },
        categorias: [cxCategoria, cxpCategoria, tesoreriaCategoria],
        meta: { totalPuntos: 100, evaluados: totalEvaluados, pendientes: 100 - totalEvaluados },
      },
    });
  } catch (error: any) {
    console.error("Error salud financiera:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
