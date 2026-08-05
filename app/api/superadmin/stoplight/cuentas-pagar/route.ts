import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function isBusinessDay(d: Date): boolean {
  const day = d.getDay();
  return day !== 0 && day !== 6;
}

function countBusinessDays(start: Date, end: Date): number {
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (isBusinessDay(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

function getAgingBand(daysOverdue: number): string {
  if (daysOverdue <= 0) return "corriente";
  if (daysOverdue <= 15) return "1-15";
  if (daysOverdue <= 30) return "16-30";
  if (daysOverdue <= 60) return "31-60";
  if (daysOverdue <= 90) return "61-90";
  return "90+";
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = new Date(currentYear, currentMonth, 1);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyId = empresa && COMPANY_MAP[empresa]
      ? COMPANY_MAP[empresa]
      : 9;

    // ========================================
    // Fetch ALL vendor bills (in_invoice + in_refund) posted
    // ========================================
    const moveDomain: any[] = [
      ["move_type", "in", ["in_invoice", "in_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
    ];

    const allBills = (await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [moveDomain],
      {
        fields: [
          "id", "name", "partner_id", "invoice_date", "invoice_date_due",
          "amount_untaxed", "amount_total", "amount_residual",
          "payment_state", "company_id", "invoice_user_id",
          "create_date", "ref",
        ],
        limit: 10000,
      }
    )) || [];

    // Fetch 90-day window for DPO
    const dpoWindowStart = new Date(today);
    dpoWindowStart.setDate(dpoWindowStart.getDate() - 90);

    const dpoDomain: any[] = [
      ["move_type", "=", "in_invoice"],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
      ["invoice_date", ">=", formatDate(dpoWindowStart)],
      ["invoice_date", "<=", formatDate(today)],
    ];

    const dpoBills = (await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [dpoDomain],
      {
        fields: [
          "id", "invoice_date", "invoice_date_due", "amount_untaxed",
          "amount_residual", "payment_state",
        ],
        limit: 10000,
      }
    )) || [];

    // Fetch purchase orders for SLA calculation
    const poDomain: any[] = [
      ["company_id", "=", companyId],
      ["state", "in", ["purchase", "done"]],
      ["date_order", ">=", formatDate(monthStart)],
      ["date_order", "<=", formatDate(monthEnd)],
    ];

    const purchaseOrders = (await callOdooRPC<any[]>(
      "purchase.order",
      "search_read",
      [poDomain],
      {
        fields: ["id", "partner_id", "date_order", "date_planned", "company_id"],
        limit: 5000,
      }
    )) || [];

    const poMap: Record<number, any> = {};
    purchaseOrders.forEach((po: any) => { poMap[po.id] = po; });

    // ========================================
    // Process each bill
    // ========================================
    let totalCxPOpen = 0;
    let totalVencido = 0;
    let agingBuckets: Record<string, number> = {
      corriente: 0, "1-15": 0, "16-30": 0, "31-60": 0, "61-90": 0, "90+": 0,
    };

    // KPI1: Pagos a tiempo
    let montoExigible = 0;
    let montoPagadoATiempo = 0;
    let facturasQueVencian = 0;
    let facturasPagadasPuntualmente = 0;

    // KPI3: Procesamiento oportuno
    let facturasRecibidas = 0;
    let facturasProcesadasATiempo = 0;
    let tiemposProcesamiento: number[] = [];

    // KPI4: DPO
    let dpoCxPTotal = 0;
    let dpoComprasCredito = 0;

    // Weekly data arrays
    const semanas: { inicio: Date; fin: Date }[] = [];
    let current = new Date(monthStart);
    while (current <= monthEnd) {
      const start = new Date(current);
      let end = new Date(current);
      end.setDate(end.getDate() + 6);
      if (end > monthEnd) end = new Date(monthEnd);
      semanas.push({ inicio: start, fin: end });
      current = new Date(end);
      current.setDate(current.getDate() + 1);
    }

    const weeklyData: {
      pagosATiempoMonto: number; exigibleMonto: number;
      pagadosPuntual: number; queVencian: number;
      vencido: number; totalAbierto: number;
      procesadasATiempo: number; recibidas: number;
    }[] = Array(semanas.length).fill(null).map(() => ({
      pagosATiempoMonto: 0, exigibleMonto: 0,
      pagadosPuntual: 0, queVencian: 0,
      vencido: 0, totalAbierto: 0,
      procesadasATiempo: 0, recibidas: 0,
    }));

    for (const bill of allBills) {
      const invDate = bill.invoice_date ? new Date(bill.invoice_date) : null;
      const dueDate = bill.invoice_date_due ? new Date(bill.invoice_date_due) : null;
      const amount = Math.abs(Number(bill.amount_untaxed) || 0);
      const residual = Math.abs(Number(bill.amount_residual) || 0);
      const paymentState = bill.payment_state || "not_paid";
      const isRefund = bill.move_type === "in_refund";

      const findWeekIdx = (date: Date | null): number => {
        if (!date) return -1;
        for (let i = 0; i < semanas.length; i++) {
          if (date >= semanas[i].inicio && date <= semanas[i].fin) return i;
        }
        return -1;
      };

      const weekIdxInv = findWeekIdx(invDate);
      const weekIdxDue = findWeekIdx(dueDate);

      // ========================================
      // KPI2: Aging / CxP vencida (por fecha vencimiento)
      // ========================================
      if (residual > 0 && !isRefund) {
        totalCxPOpen += residual;
        if (weekIdxDue >= 0) weeklyData[weekIdxDue].totalAbierto += residual;

        if (dueDate && dueDate < today) {
          const daysOverdue = daysBetween(dueDate, today);
          const band = getAgingBand(daysOverdue);
          agingBuckets[band] += residual;
          totalVencido += residual;
          if (weekIdxDue >= 0) weeklyData[weekIdxDue].vencido += residual;
        } else {
          agingBuckets.corriente += residual;
        }
      }

      // ========================================
      // KPI1: Pagos realizados a tiempo (por fecha vencimiento)
      // ========================================
      if (dueDate && !isRefund) {
        facturasQueVencian++;
        montoExigible += amount;
        if (weekIdxDue >= 0) {
          weeklyData[weekIdxDue].exigibleMonto += amount;
          weeklyData[weekIdxDue].queVencian++;
        }

        if (paymentState === "paid" || paymentState === "partial") {
          const paidAmount = amount - residual;
          if (paidAmount > 0) {
            if (today <= dueDate || paymentState === "paid") {
              montoPagadoATiempo += paidAmount;
              facturasPagadasPuntualmente++;
              if (weekIdxDue >= 0) weeklyData[weekIdxDue].pagosATiempoMonto += paidAmount;
            }
          }
        }
      }

      // ========================================
      // KPI3: Procesamiento oportuno (por fecha factura)
      // ========================================
      if (invDate && !isRefund) {
        facturasRecibidas++;
        if (weekIdxInv >= 0) weeklyData[weekIdxInv].recibidas++;

        const createDate = bill.create_date ? new Date(bill.create_date) : invDate;
        const processingDays = countBusinessDays(invDate, createDate);

        const hasPO = bill.ref && bill.ref.includes("PO") || false;
        const sla = hasPO ? 3 : 5;

        tiemposProcesamiento.push(processingDays);
        if (processingDays <= sla) {
          facturasProcesadasATiempo++;
          if (weekIdxInv >= 0) weeklyData[weekIdxInv].procesadasATiempo++;
        }
      }

      // ========================================
      // KPI4: DPO (90-day window)
      // ========================================
      if (invDate && invDate >= dpoWindowStart && !isRefund) {
        dpoCxPTotal += residual;
      }
    }

    // DPO: Compras netas a crédito del período (90 días)
    for (const bill of dpoBills) {
      const amount = Math.abs(Number(bill.amount_untaxed) || 0);
      if (bill.move_type === "in_invoice") {
        dpoComprasCredito += amount;
      } else if (bill.move_type === "in_refund") {
        dpoComprasCredito -= amount;
      }
    }

    // ========================================
    // Calculate final KPI values
    // ========================================

    // KPI1: Pagos a tiempo por monto
    const pagosATiempoPct = montoExigible > 0
      ? Math.round((montoPagadoATiempo / montoExigible) * 100)
      : 100;

    // KPI1 diagnóstico: por cantidad
    const pagosATiempoCantidad = facturasQueVencian > 0
      ? Math.round((facturasPagadasPuntualmente / facturasQueVencian) * 100)
      : 100;

    // KPI2: CxP vencida
    const cuentasVencidasPct = totalCxPOpen > 0
      ? Math.round((totalVencido / totalCxPOpen) * 100)
      : 0;

    // KPI3: Procesamiento oportuno
    const procesamientoOportunoPct = facturasRecibidas > 0
      ? Math.round((facturasProcesadasATiempo / facturasRecibidas) * 100)
      : 100;

    const avgProcessingDays = tiemposProcesamiento.length > 0
      ? Math.round(tiemposProcesamiento.reduce((a, b) => a + b, 0) / tiemposProcesamiento.length)
      : 0;

    // KPI4: DPO (90-day window)
    const daysInPeriod = 90;
    const dpo = dpoComprasCredito > 0
      ? Math.round((dpoCxPTotal / dpoComprasCredito) * daysInPeriod)
      : 0;

    // ========================================
    // Weekly KPI calculations
    // ========================================
    const semanaPagosATiempo = weeklyData.map((w) => {
      if (w.exigibleMonto <= 0 || w.queVencian <= 0) return null;
      const pct = Math.round((w.pagosATiempoMonto / w.exigibleMonto) * 100);
      return `${pct}%`;
    });

    const semanaVencidas = weeklyData.map((w) => {
      if (w.totalAbierto <= 0) return null;
      const pct = Math.round((w.vencido / w.totalAbierto) * 100);
      return `${pct}%`;
    });

    const semanaProcesamiento = weeklyData.map((w) => {
      if (w.recibidas <= 0) return null;
      const pct = Math.round((w.procesadasATiempo / w.recibidas) * 100);
      return `${pct}%`;
    });

    const semanaDpo = weeklyData.map(() => {
      if (dpoComprasCredito <= 0 || dpoCxPTotal <= 0) return null;
      return `${dpo}`;
    });

    return NextResponse.json({
      success: true,
      data: {
        // Summary
        totalCxPOpen: Math.round(totalCxPOpen * 100) / 100,
        totalVencido: Math.round(totalVencido * 100) / 100,
        agingBuckets: Object.fromEntries(
          Object.entries(agingBuckets).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),

        // KPI1
        pagosATiempoPct,
        pagosATiempoCantidad,
        montoExigible: Math.round(montoExigible * 100) / 100,
        montoPagadoATiempo: Math.round(montoPagadoATiempo * 100) / 100,
        facturasQueVencian,
        facturasPagadasPuntualmente,

        // KPI2
        cuentasVencidasPct,

        // KPI3
        procesamientoOportunoPct,
        facturasRecibidas,
        facturasProcesadasATiempo,
        avgProcessingDays,

        // KPI4
        dpo,
        dpoCxPTotal: Math.round(dpoCxPTotal * 100) / 100,
        dpoComprasCredito: Math.round(dpoComprasCredito * 100) / 100,

        // Weekly
        semanaPagosATiempo,
        semanaVencidas,
        semanaProcesamiento,
        semanaDpo,
      },
    });
  } catch (error: any) {
    console.error("Error en API cuentas-pagar:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
