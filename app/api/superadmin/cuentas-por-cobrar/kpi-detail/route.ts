import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { detalleCEI } from "@/lib/cxc/efectividad";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { calcularRecuperacion } from "@/lib/cxc/recuperacion";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
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
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type"); // efectividad | cartera | recuperacion | dso
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");

    if (!type || !["efectividad", "cartera", "recuperacion", "dso"].includes(type)) {
      return NextResponse.json({ error: "type requerido: efectividad | cartera | recuperacion | dso" }, { status: 400 });
    }

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = getMonthStart(currentYear, currentMonth);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    if (type === "efectividad") {
      // CEI con su detalle por cliente. Mismos helpers que la tarjeta
      // (lib/cxc/efectividad.ts) para que nunca discrepen.
      const semanas = obtenerSemanasDelMes(currentYear, currentMonth + 1);
      const { carteraEn } = await calcularSeriesCxC(companyIds, semanas, today);
      const { resumen, clientes } = await detalleCEI(companyIds, monthStart, monthEnd, [], today, carteraEn);
      return NextResponse.json({
        success: true,
        data: { type: "efectividad", summary: resumen, clientes },
      });
    }

    if (type === "cartera") {
      // Todas las facturas abiertas con saldo, agrupadas por aging band
      // != 0 (no solo > 0): incluye notas de credito abiertas, que en este
      // modelo traen amount_residual NEGATIVO (verificado contra Odoo real).
      const reportData = await fetchPaginated(
        "digiflex.cxc.report",
        [["company_id", "in", companyIds], ["amount_residual", "!=", 0]],
        ["id", "move_id", "partner_id", "partner_name", "user_id", "user_name",
         "company_id", "company_name", "invoice_date", "date_maturity",
         "days_overdue", "amount_residual", "amount_current",
         "amount_1_30", "amount_31_60", "amount_61_90", "amount_91_plus",
         "document_number", "transaction_type"],
      );

      const filtered = reportData.filter((r: any) => !((r.partner_name || "").toLowerCase().includes("supricom")));

      function getAgingBand(r: any): string {
        if (r.days_overdue <= 0) return "corriente";
        if (r.days_overdue <= 30) return "1-30";
        if (r.days_overdue <= 60) return "31-60";
        if (r.days_overdue <= 90) return "61-90";
        return "91+";
      }

      const invoices = filtered.map((r: any) => ({
        id: r.id,
        name: r.document_number || "",
        partnerName: r.partner_name || "Sin cliente",
        partnerId: r.partner_id?.[0] || 0,
        companyName: r.company_name || "",
        userName: r.user_name || "Sin asignar",
        invoiceDate: r.invoice_date || null,
        invoiceDateDue: r.date_maturity || null,
        daysOverdue: r.days_overdue || 0,
        agingBand: getAgingBand(r),
        // Con signo (negativo = nota de credito abierta) para que total/
        // overdue/byBand mas abajo neten correctamente.
        amountResidual: Math.round((r.amount_residual || 0) * 100) / 100,
      }));

      const total = invoices.reduce((s, i) => s + i.amountResidual, 0);
      const overdue = invoices.filter(i => i.daysOverdue > 0).reduce((s, i) => s + i.amountResidual, 0);

      const byBand: Record<string, { count: number; total: number }> = {};
      invoices.forEach(i => {
        if (!byBand[i.agingBand]) byBand[i.agingBand] = { count: 0, total: 0 };
        byBand[i.agingBand].count++;
        byBand[i.agingBand].total += i.amountResidual;
      });

      return NextResponse.json({
        success: true,
        data: {
          type: "cartera",
          summary: {
            totalReceivable: Math.round(total * 100) / 100,
            totalOverdue: Math.round(overdue * 100) / 100,
            overduePct: total > 0 ? Math.round((overdue / total) * 10000) / 100 : 0,
            count: invoices.length,
            overdueCount: invoices.filter(i => i.daysOverdue > 0).length,
          },
          byBand,
          invoices: invoices.sort((a, b) => b.daysOverdue - a.daysOverdue),
        },
      });
    }

    if (type === "recuperacion") {
      // Mismo cálculo que la tarjeta (lib/cxc/recuperacion.ts, issue #189)
      // para que el modal y el KPI nunca discrepen: antes cada uno tenía su
      // propia versión de la fórmula.
      const monthStart = getMonthStart(currentYear, currentMonth);
      const monthEnd = new Date(currentYear, currentMonth + 1, 0);
      const calc = await calcularRecuperacion(companyIds, monthStart, monthEnd);

      // Universo del KPI: facturas ya vencidas al iniciar el mes. Se listan las
      // que siguen con saldo (lo que queda por recuperar) y las que recibieron
      // cobros en el mes, aunque ya esten cerradas.
      const desdeStr = monthStart.toISOString().split("T")[0];
      const hastaStr = monthEnd.toISOString().split("T")[0];
      const dominioVencidas: any[] = [
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["invoice_date_due", "<", desdeStr],
        ["partner_id.name", "not ilike", "supricom"],
      ];
      const camposFactura = ["id", "name", "partner_id", "company_id", "invoice_date",
        "invoice_date_due", "payment_state", "amount_total", "amount_residual"];

      // Cobrado en el mes por factura: mismo numerador que la tarjeta
      // (lib/cxc/cobros.ts), abierto factura por factura.
      const [pendientes, cobros] = await Promise.all([
        fetchPaginated("account.move", [...dominioVencidas, ["amount_residual", "!=", 0]], camposFactura),
        obtenerCobros(companyIds, {
          desde: desdeStr,
          hasta: hastaStr,
          dominioFactura: [
            ["move_type", "=", "out_invoice"],
            ["invoice_date_due", "<", desdeStr],
            ["partner_id.name", "not ilike", "supricom"],
          ],
        }),
      ]);

      const cobradoPorFactura = new Map<number, number>();
      for (const c of cobros) {
        cobradoPorFactura.set(c.facturaId, (cobradoPorFactura.get(c.facturaId) || 0) + c.monto);
      }

      // Facturas que se cobraron en el mes y hoy ya no tienen saldo: no vienen
      // en `pendientes` y sin ellas la tabla no explicaria lo recuperado.
      const idsPendientes = new Set(pendientes.map((f: any) => f.id));
      const faltantes = [...cobradoPorFactura.keys()].filter((id) => !idsPendientes.has(id));
      const cerradas = faltantes.length
        ? await fetchPaginated("account.move", [["id", "in", faltantes]], camposFactura)
        : [];

      const invoices = [...pendientes, ...cerradas].map((inv: any) => {
        const cobrado = Math.round((cobradoPorFactura.get(inv.id) || 0) * 100) / 100;
        return {
          id: inv.id,
          name: inv.name || "",
          partnerName: inv.partner_id?.[1] || "Sin cliente",
          partnerId: inv.partner_id?.[0] || 0,
          companyName: inv.company_id?.[1] || "",
          invoiceDate: inv.invoice_date || null,
          invoiceDateDue: inv.invoice_date_due || null,
          paymentState: inv.payment_state || "not_paid",
          amountTotal: Math.round(Math.abs(inv.amount_total || 0) * 100) / 100,
          amountResidual: Math.round(Math.abs(inv.amount_residual || 0) * 100) / 100,
          // Cobrado DEL MES sobre esta factura (no el pagado historico): es lo
          // que suma al KPI.
          amountPaid: cobrado,
          status: cobrado > 0 ? "Recuperado" : "Pendiente",
        };
      });
      const recuperadas = invoices.filter((i) => i.amountPaid > 0).length;

      return NextResponse.json({
        success: true,
        data: {
          type: "recuperacion",
          summary: {
            // Nombres que usa el modal; los largos se mantienen por compatibilidad.
            vencidoInicial: calc.saldoVencidoInicial,
            recuperado: calc.recuperadoEnElMes,
            vencidoRestante: Math.round((calc.saldoVencidoInicial - calc.recuperadoEnElMes) * 100) / 100,
            recoveredCount: recuperadas,
            recuperacion: calc.value,
            saldoVencidoInicial: calc.saldoVencidoInicial,
            recuperadoEnElMes: calc.recuperadoEnElMes,
            saldoVencidoHoy: calc.saldoVencidoHoy,
            conciliadoDesdeElCorte: calc.conciliadoDesdeElCorte,
            count: invoices.length,
            pendingCount: invoices.filter((i) => i.amountResidual > 0).length,
          },
          // Primero las recuperadas (de mayor cobro a menor): son la respuesta a
          // "que se recupero este mes". Despues las pendientes, de la mas
          // vencida a la mas reciente.
          invoices: invoices.sort((a, b) => {
            if ((a.amountPaid > 0) !== (b.amountPaid > 0)) return a.amountPaid > 0 ? -1 : 1;
            if (a.amountPaid > 0) return b.amountPaid - a.amountPaid;
            return (a.invoiceDateDue || "").localeCompare(b.invoiceDateDue || "");
          }),
        },
      });
    }

    if (type === "dso") {
      // Ventas crédito últimos 90 días + cartera abierta
      const d90 = new Date(today);
      d90.setDate(d90.getDate() - 90);

      const [creditSales, receivableData] = await Promise.all([
        fetchPaginated(
          "account.move",
          [
            ["move_type", "=", "out_invoice"],
            ["state", "=", "posted"],
            ["company_id", "in", companyIds],
            ["invoice_date", ">=", d90.toISOString().split("T")[0]],
          ],
          ["id", "name", "partner_id", "company_id",
           "invoice_date", "invoice_date_due", "payment_state",
           "amount_total", "amount_residual", "invoice_payment_term_id"],
        ),
        fetchPaginated(
          "digiflex.cxc.report",
          // != 0: misma correccion que en "cartera" arriba — las notas de
          // credito abiertas traen amount_residual negativo en este modelo.
          [["company_id", "in", companyIds], ["amount_residual", "!=", 0]],
          ["amount_residual", "partner_name"],
        ),
      ]);

      const totalReceivable = receivableData
        .filter((r: any) => !["supricom"].some(s => (r.partner_name || "").toLowerCase().includes(s)))
        .reduce((s, r) => s + (r.amount_residual || 0), 0);

      // Solo ventas a crédito cuentan para el DSO -- mismo criterio que
      // contado-credito/route.ts: sin plazo de pago, o un plazo cuyo nombre
      // no tiene ningún número de días (ej. "Contado"), es venta de contado
      // (issue #190). Antes el denominador traía también las de contado.
      const creditTermIds = [...new Set(
        creditSales.map((inv: any) => inv.invoice_payment_term_id?.[0]).filter((id: any): id is number => Boolean(id))
      )];
      let creditTermNames: Record<number, string> = {};
      if (creditTermIds.length > 0) {
        try {
          const terms = await callOdooRPC<any[]>("account.payment.term", "read", [creditTermIds], { fields: ["id", "name"] });
          (terms || []).forEach((t: any) => { creditTermNames[t.id] = t.name; });
        } catch (_) {}
      }
      const esVentaACredito = (inv: any) => {
        const termName = creditTermNames[inv.invoice_payment_term_id?.[0] ?? -1] || "Contado";
        return /\d/.test(termName);
      };

      const sales = creditSales.filter(esVentaACredito).map((inv: any) => ({
        id: inv.id,
        name: inv.name || "",
        partnerName: inv.partner_id?.[1] || "Sin cliente",
        partnerId: inv.partner_id?.[0] || 0,
        companyName: inv.company_id?.[1] || "",
        invoiceDate: inv.invoice_date || null,
        invoiceDateDue: inv.invoice_date_due || null,
        paymentState: inv.payment_state || "not_paid",
        amountTotal: Math.round(Math.abs(inv.amount_total || 0) * 100) / 100,
        amountResidual: Math.round(Math.abs(inv.amount_residual || 0) * 100) / 100,
      }));

      // Misma base fiscal que `totalReceivable` (digiflex.cxc.report, con
      // impuestos): antes se sumaba `amount_untaxed` (sin impuestos) contra
      // un numerador con impuestos (issue #190).
      const totalCreditSales = sales.reduce((s, i) => s + i.amountTotal, 0);
      const dso = totalCreditSales > 0 ? Math.round((totalReceivable / totalCreditSales) * 90) : 0;

      return NextResponse.json({
        success: true,
        data: {
          type: "dso",
          summary: {
            carteraAbierta: Math.round(totalReceivable * 100) / 100,
            ventasCredito90d: Math.round(totalCreditSales * 100) / 100,
            dso,
            count: sales.length,
          },
          invoices: sales.sort((a, b) => (a.invoiceDate || "").localeCompare(b.invoiceDate || "")),
        },
      });
    }

    return NextResponse.json({ error: "Tipo no válido" }, { status: 400 });
  } catch (error: any) {
    console.error("Error KPI detail:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
