import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

function formatDate(d: Date): string {
  return d.toISOString().split("T")[0];
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const { callOdooRPC } = await import("@/lib/odoo");
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function GET(request: NextRequest) {
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
      monthStart = getMonthStart(currentYear, currentMonth);
      monthEnd = new Date(currentYear, currentMonth + 1, 0);
    }

    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : [7, 9, 10];

    const mes = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}`;
    const companyId = companyIds[0] || 9;
    const cxcMetasResult = await query(
      "SELECT kpi_key, meta_mensual FROM kpi_targets WHERE company_id = ? AND mes = ? AND kpi_key IN ('efectividad_cobranza', 'cartera_vencida', 'recuperacion_vencidos', 'dso')",
      [companyId, mes]
    );
    const cxcMetas: Record<string, number> = {};
    (cxcMetasResult.rows as any[]).forEach((r: any) => { cxcMetas[r.kpi_key] = Number(r.meta_mensual); });

    const moveDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
    ];

    const allInvoices = await fetchPaginated(
      "account.move",
      moveDomain,
      [
        "id", "name", "partner_id", "company_id", "move_type",
        "invoice_date", "invoice_date_due", "payment_state",
        "amount_untaxed", "amount_tax", "amount_total",
        "amount_residual", "invoice_user_id", "currency_id",
        "invoice_origin",
      ],
    );

    const invoices = allInvoices.map((inv) => {
      const amount = inv.move_type === "out_refund" ? -Math.abs(inv.amount_untaxed || 0) : (inv.amount_untaxed || 0);
      const amountTotal = inv.move_type === "out_refund" ? -Math.abs(inv.amount_total || 0) : (inv.amount_total || 0);
      const residual = inv.amount_residual || 0;

      const dueDateStr = inv.invoice_date_due || null;
      const invoiceDateStr = inv.invoice_date || null;

      function parseLocalDate(dateStr: string | null): Date | null {
        if (!dateStr) return null;
        const [y, m, d] = dateStr.split(" ")[0].split("-").map(Number);
        return new Date(y, m - 1, d);
      }

      const dueDate = parseLocalDate(dueDateStr);
      const invoiceDate = parseLocalDate(invoiceDateStr);

      let agingDays = 0;
      if (dueDate && residual > 0) {
        agingDays = daysBetween(dueDate, today);
      }

      let agingBand = "corriente";
      if (residual > 0 && dueDate) {
        if (agingDays <= 0) agingBand = "corriente";
        else if (agingDays <= 15) agingBand = "1-15";
        else if (agingDays <= 30) agingBand = "16-30";
        else if (agingDays <= 60) agingBand = "31-60";
        else if (agingDays <= 90) agingBand = "61-90";
        else agingBand = "90+";
      }

      return {
        id: inv.id,
        name: inv.name || "",
        partnerId: inv.partner_id?.[0] || 0,
        partnerName: inv.partner_id?.[1] || "Sin cliente",
        companyId: inv.company_id?.[0] || 0,
        companyName: inv.company_id?.[1] || "",
        moveType: inv.move_type,
        invoiceDate: invoiceDateStr,
        invoiceDateDue: dueDateStr,
        paymentState: inv.payment_state || "not_paid",
        amountUntaxed: amount,
        amountTotal: amountTotal,
        amountResidual: residual,
        invoiceUserId: inv.invoice_user_id?.[0] || 0,
        invoiceUserName: inv.invoice_user_id?.[1] || "Sin asignar",
        agingDays,
        agingBand,
        invoiceOrigin: inv.invoice_origin || "",
      };
    });

    const invoicesInMonth = invoices.filter((inv) => {
      if (!inv.invoiceDate) return false;
      const [y, m, d] = inv.invoiceDate.split(" ")[0].split("-").map(Number);
      const dd = new Date(y, m - 1, d);
      return dd >= monthStart && dd <= monthEnd;
    });

    const COMPANY_NAMES: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };

    const allOpenInvoices = invoices.filter((inv) => inv.amountResidual > 0 && !inv.partnerName.toLowerCase().includes("supricom"));
    const overdueInvoices = allOpenInvoices.filter((inv) => inv.agingDays > 0);
    const totalOverdue = overdueInvoices.reduce((sum, inv) => sum + Math.abs(inv.amountResidual), 0);
    const totalReceivable = allOpenInvoices.reduce((sum, inv) => sum + Math.abs(inv.amountResidual), 0);

    // Efectividad: Monto exigible = facturas con vencimiento en el mes seleccionado
    const exigibleInvoices = invoices.filter((inv) => {
      const dueDate = inv.invoiceDateDue ? new Date(inv.invoiceDateDue) : null;
      return dueDate && dueDate >= monthStart && dueDate <= monthEnd && inv.amountResidual >= 0;
    });
    const montoExigible = exigibleInvoices.reduce((sum, inv) => {
      const total = inv.moveType === "out_refund" ? -Math.abs(inv.amountTotal || 0) : Math.abs(inv.amountTotal || 0);
      return sum + total;
    }, 0);

    // Monto cobrado = pagos efectivamente conciliados en el período contra facturas exigibles
    // Usamos la diferencia: lo que se facturó con vencimiento en el período menos lo que aún queda pendiente
    const cobradoEnPeriodo = exigibleInvoices.reduce((sum, inv) => {
      const total = inv.moveType === "out_refund" ? -Math.abs(inv.amountTotal || 0) : Math.abs(inv.amountTotal || 0);
      const pagado = total - Math.abs(inv.amountResidual);
      return sum + Math.max(pagado, 0);
    }, 0);

    const efectividad = montoExigible > 0
      ? Math.round((cobradoEnPeriodo / montoExigible) * 10000) / 100
      : null;

    const carteraVencidaPct = totalReceivable > 0
      ? Math.round((totalOverdue / totalReceivable) * 10000) / 100
      : null;

    // Recuperación: Cohorte = facturas que ya estaban vencidas al inicio del mes
    const cohortStart = getMonthStart(currentYear, currentMonth);

    // Todas las facturas vencidas al inicio del mes (incluyendo las que ya se pagaron)
    const cohortAll = invoices.filter((inv) => {
      const dueDate = inv.invoiceDateDue ? new Date(inv.invoiceDateDue) : null;
      return dueDate && dueDate < cohortStart;
    });

    // Monto original vencido al inicio del mes (amountTotal, no residual)
    const cohortTotalInicial = cohortAll.reduce((sum, inv) => {
      const total = inv.moveType === "out_refund" ? -Math.abs(inv.amountTotal || 0) : Math.abs(inv.amountTotal || 0);
      return sum + total;
    }, 0);

    // Monto que aún queda por cobrar de esas facturas (residual actual)
    const cohortRestante = cohortAll.reduce((sum, inv) => sum + Math.abs(inv.amountResidual || 0), 0);

    // Monto recuperado = lo que ya se pagó contra esas facturas
    const cohortRecovered = cohortTotalInicial - cohortRestante;

    // Solo para referencia: facturas que siguen abiertas (con residual > 0)
    const cohortOverdue = cohortAll.filter((inv) => inv.amountResidual > 0);

    const totalCreditSales90d = (() => {
      const d90 = new Date(today);
      d90.setDate(d90.getDate() - 90);
      return invoices
        .filter((inv) => {
          const d = inv.invoiceDate ? new Date(inv.invoiceDate) : null;
          return inv.moveType === "out_invoice" && d && d >= d90;
        })
        .reduce((sum, inv) => sum + Math.abs(inv.amountUntaxed), 0);
    })();

    const dso90 = totalCreditSales90d > 0
      ? Math.round((totalReceivable / totalCreditSales90d) * 90)
      : null;

    const agingDistribution = {
      "corriente": 0,
      "1-15": 0,
      "16-30": 0,
      "31-60": 0,
      "61-90": 0,
      "90+": 0,
    };
    allOpenInvoices.forEach((inv) => {
      agingDistribution[inv.agingBand as keyof typeof agingDistribution] += Math.abs(inv.amountResidual);
    });

    const byCompany = companyIds.map((cid) => {
      const coInvoices = allOpenInvoices.filter((inv) => inv.companyId === cid);
      const coOverdue = coInvoices.filter((inv) => inv.agingDays > 0);
      const coTotalReceivable = coInvoices.reduce((s, i) => s + Math.abs(i.amountResidual), 0);
      const coTotalOverdue = coOverdue.reduce((s, i) => s + Math.abs(i.amountResidual), 0);
      const coMonthInvoices = invoicesInMonth.filter((i) => i.companyId === cid);
      const coMonthTotal = coMonthInvoices.reduce((s, i) => s + Math.abs(i.amountUntaxed), 0);
      const coMonthPaid = coMonthInvoices.filter(
        (i) => i.paymentState === "paid" || i.paymentState === "in_payment"
      ).reduce((s, i) => s + Math.abs(i.amountUntaxed), 0);

      return {
        companyId: cid,
        companyName: COMPANY_NAMES[cid] || `Sucursal ${cid}`,
        totalReceivable: Math.round(coTotalReceivable * 100) / 100,
        totalOverdue: Math.round(coTotalOverdue * 100) / 100,
        overduePct: coTotalReceivable > 0 ? Math.round((coTotalOverdue / coTotalReceivable) * 10000) / 100 : 0,
        openInvoices: coInvoices.length,
        overdueInvoices: coOverdue.length,
        monthInvoiced: Math.round(coMonthTotal * 100) / 100,
        monthPaid: Math.round(coMonthPaid * 100) / 100,
        efectividad: coMonthTotal > 0 ? Math.round((coMonthPaid / coMonthTotal) * 10000) / 100 : 0,
      };
    });

    const topDebtors = (() => {
      const byClient: Record<number, { name: string; total: number; overdue: number; oldest: number; count: number }> = {};
      allOpenInvoices.forEach((inv) => {
        if (!byClient[inv.partnerId]) {
          byClient[inv.partnerId] = { name: inv.partnerName, total: 0, overdue: 0, oldest: 0, count: 0 };
        }
        byClient[inv.partnerId].total += Math.abs(inv.amountResidual);
        byClient[inv.partnerId].count++;
        if (inv.agingDays > 0) {
          byClient[inv.partnerId].overdue += Math.abs(inv.amountResidual);
        }
        if (inv.agingDays > byClient[inv.partnerId].oldest) {
          byClient[inv.partnerId].oldest = inv.agingDays;
        }
      });
      return Object.entries(byClient)
        .map(([id, data]) => ({ partnerId: parseInt(id), ...data }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10);
    })();

    const bySalesperson = (() => {
      const byUser: Record<number, { name: string; total: number; overdue: number; count: number }> = {};
      allOpenInvoices.forEach((inv) => {
        const uid = inv.invoiceUserId || 0;
        if (!byUser[uid]) {
          byUser[uid] = { name: inv.invoiceUserName, total: 0, overdue: 0, count: 0 };
        }
        byUser[uid].total += Math.abs(inv.amountResidual);
        byUser[uid].count++;
        if (inv.agingDays > 0) {
          byUser[uid].overdue += Math.abs(inv.amountResidual);
        }
      });
      return Object.entries(byUser)
        .map(([id, data]) => ({ userId: parseInt(id), ...data }))
        .sort((a, b) => b.total - a.total);
    })();

    return NextResponse.json({
      success: true,
      data: {
        kpis: {
          efectividad: {
            value: efectividad,
            meta: cxcMetas["efectividad_cobranza"] || 95,
            cobradoMes: Math.round(cobradoEnPeriodo * 100) / 100,
            exigibleMes: Math.round(montoExigible * 100) / 100,
            pendiente: Math.round((montoExigible - cobradoEnPeriodo) * 100) / 100,
          },
          carteraVencida: {
            value: carteraVencidaPct,
            meta: cxcMetas["cartera_vencida"] || 10,
            saldoVencido: Math.round(totalOverdue * 100) / 100,
            carteraTotal: Math.round(totalReceivable * 100) / 100,
          },
          recuperacion: {
            value: cohortTotalInicial > 0 ? Math.round((cohortRecovered / cohortTotalInicial) * 10000) / 100 : null,
            meta: cxcMetas["recuperacion_vencidos"] || 60,
            vencidoInicial: Math.round(cohortTotalInicial * 100) / 100,
            vencidoRestante: Math.round(cohortRestante * 100) / 100,
          },
          dso: {
            value: dso90,
            meta: cxcMetas["dso"] || 45,
            carteraAbierta: Math.round(totalReceivable * 100) / 100,
            ventasCredito90d: Math.round(totalCreditSales90d * 100) / 100,
          },
        },
        agingDistribution,
        byCompany,
        topDebtors,
        bySalesperson,
        summary: {
          totalReceivable: Math.round(totalReceivable * 100) / 100,
          totalOverdue: Math.round(totalOverdue * 100) / 100,
          openInvoiceCount: allOpenInvoices.length,
          overdueInvoiceCount: overdueInvoices.length,
        },
        filters: {
          empresa,
          month: currentMonth + 1,
          year: currentYear,
          companyIds,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error CxC API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
