import { callOdooRPC, OdooUnreachableError } from "@/lib/odoo";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
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
  const auth = await requireRoles(request, ["superadmin", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    const now = new Date();
    let monthStart: Date, monthEnd: Date, currentYear: number, currentMonth: number;

    if (startDateParam && endDateParam) {
      monthStart = new Date(startDateParam + "T00:00:00");
      monthEnd = new Date(endDateParam + "T23:59:59");
      currentYear = monthStart.getFullYear();
      currentMonth = monthStart.getMonth();
    } else {
      currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
      currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
      monthStart = new Date(currentYear, currentMonth, 1);
      monthEnd = new Date(currentYear, currentMonth + 1, 0);
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyId = empresa && COMPANY_MAP[empresa]
      ? COMPANY_MAP[empresa]
      : 9;

    const mes = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const cppMetasResult = await query(
      "SELECT kpi_key, meta_mensual FROM kpi_targets WHERE company_id = ? AND mes = ? AND kpi_key IN ('pagos_a_tiempo', 'cuentas_pagar_vencidas', 'procesamiento_oportuno', 'dpo')",
      [companyId, mes]
    );
    const cppMetas: Record<string, number> = {};
    (cppMetasResult.rows as any[]).forEach((r: any) => { cppMetas[r.kpi_key] = Number(r.meta_mensual); });

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
          "id", "name", "move_type", "partner_id", "invoice_date", "invoice_date_due",
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

    const billIds = allBills.map((b: any) => b.id);

    // Ordenes de compra ligadas a ESTAS facturas (para el SLA de "Procesamiento
    // oportuno": 3 dias habiles si viene de una PO, 5 si no). Se busca por
    // invoice_ids en vez de filtrar purchase.order por fecha del mes: una PO
    // de un mes anterior se puede facturar este mes, y con el filtro de fecha
    // esos casos se perdian. Antes esto se decidia adivinando si el texto
    // "po" aparecia en la referencia de la factura, lo cual daba falsos
    // positivos/negativos con cualquier numero de factura que lo contuviera.
    const purchaseOrders = billIds.length > 0
      ? (await callOdooRPC<any[]>(
          "purchase.order",
          "search_read",
          [[["invoice_ids", "in", billIds]]],
          { fields: ["id", "invoice_ids"], limit: 5000 }
        )) || []
      : [];
    const billIdsConPO = new Set<number>();
    purchaseOrders.forEach((po: any) => {
      (po.invoice_ids || []).forEach((id: number) => billIdsConPO.add(id));
    });

    // Fecha real del ultimo pago que salda cada factura (para "Pagos a
    // tiempo"): hace falta CUANDO se pago, no solo si ya esta pagada hoy —
    // antes, una factura pagada meses tarde contaba igual como "a tiempo"
    // con tal de estar saldada al momento de correr el reporte.
    const pagos = billIds.length > 0
      ? (await callOdooRPC<any[]>(
          "account.payment",
          "search_read",
          [[["reconciled_bill_ids", "in", billIds]]],
          { fields: ["date", "reconciled_bill_ids"], limit: 10000 }
        )) || []
      : [];
    const ultimoPagoPorFactura: Record<number, string> = {};
    pagos.forEach((p: any) => {
      (p.reconciled_bill_ids || []).forEach((billId: number) => {
        if (!ultimoPagoPorFactura[billId] || p.date > ultimoPagoPorFactura[billId]) {
          ultimoPagoPorFactura[billId] = p.date;
        }
      });
    });

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

      const inMonthInv = invDate && invDate >= monthStart && invDate <= monthEnd;
      const inMonthDue = dueDate && dueDate >= monthStart && dueDate <= monthEnd;

      // ========================================
      // KPI2: Aging / CxP vencida (snapshot: todas las facturas abiertas)
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
      // KPI1: Pagos realizados a tiempo
      // Solo facturas con fecha de vencimiento en el mes seleccionado
      // ========================================
      if (inMonthDue && !isRefund) {
        facturasQueVencian++;
        montoExigible += amount;
        if (weekIdxDue >= 0) {
          weeklyData[weekIdxDue].exigibleMonto += amount;
          weeklyData[weekIdxDue].queVencian++;
        }

        const isPaid = paymentState === "paid" || paymentState === "reconciled" || paymentState === "in_payment";
        if (isPaid) {
          const paidAmount = amount - residual;
          // "A tiempo" es contra la fecha real del ultimo pago que la saldo,
          // no solo que hoy ya este pagada (ver nota arriba). Si no aparece
          // en account.payment (ej. se salda por una nota de credito o un
          // asiento manual en vez de un pago), no se puede saber cuando se
          // salvo la deuda -> no se cuenta como "a tiempo" en vez de asumirlo.
          const fechaPago = ultimoPagoPorFactura[bill.id];
          const pagadaATiempo = !!fechaPago && !!dueDate && fechaPago <= formatDate(dueDate);
          if (paidAmount > 0 && pagadaATiempo) {
            montoPagadoATiempo += paidAmount;
            facturasPagadasPuntualmente++;
            if (weekIdxDue >= 0) weeklyData[weekIdxDue].pagosATiempoMonto += paidAmount;
          }
        }
      }

      // ========================================
      // KPI3: Procesamiento oportuno
      // Solo facturas con fecha de factura en el mes seleccionado
      // Mide días hábiles entre fecha factura y fecha creación en sistema
      // ========================================
      if (inMonthInv && !isRefund) {
        facturasRecibidas++;
        if (weekIdxInv >= 0) weeklyData[weekIdxInv].recibidas++;

        const createDate = bill.create_date ? new Date(bill.create_date) : invDate;
        const processingDays = countBusinessDays(invDate, createDate);

        const hasPO = billIdsConPO.has(bill.id);
        const sla = hasPO ? 3 : 5;

        tiemposProcesamiento.push(processingDays);
        if (processingDays <= sla) {
          facturasProcesadasATiempo++;
          if (weekIdxInv >= 0) weeklyData[weekIdxInv].procesadasATiempo++;
        }
      }

      // ========================================
      // KPI4: DPO (90-day window, usa todas las facturas del período)
      // ========================================
      if (invDate && invDate >= dpoWindowStart && !isRefund) {
        dpoCxPTotal += residual;
      }
    }

    // DPO: Compras netas a crédito del período (90 días)
    // dpoBills ya filtra solo in_invoice, así que sumamos todos
    for (const bill of dpoBills) {
      const amount = Math.abs(Number(bill.amount_untaxed) || 0);
      dpoComprasCredito += amount;
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

    const semanaDpo = weeklyData.map((_, i) => {
      if (semanas[i].inicio > today) return null;
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

        metas: cppMetas,
      },
    });
  } catch (error: any) {
    console.error("Error en API cuentas-pagar:", error.message);
    // Distinto de "Error interno": esto significa que Odoo no respondió
    // (caído, sin red, timeout) — sin esto, el frontend no puede
    // distinguirlo de "no hay fuente de datos" (mismo bug ya corregido en
    // login y en gestion-cumplimiento).
    if (error instanceof OdooUnreachableError) {
      return NextResponse.json(
        { success: false, error: "No se pudo conectar con Odoo", odooUnreachable: true },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
