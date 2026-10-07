import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { nombresPlazos } from "@/lib/cxc/credito";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

const COMPANY_NAMES: Record<number, string> = {
  7: "Panamá",
  9: "Valencia",
  10: "Caracas",
};

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const q = searchParams.get("q")?.trim() || "";
    const page = parseInt(searchParams.get("page") || "1");
    // Rango por fecha de factura (YYYY-MM-DD). Con rango, la búsqueda por
    // texto es opcional.
    const fecha = (k: string) => {
      const v = searchParams.get(k) || "";
      return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "";
    };
    const desde = fecha("desde");
    const hasta = fecha("hasta");
    // todos=1: sin paginar, para exportar a Excel lo filtrado.
    const todos = searchParams.get("todos") === "1";
    const limit = todos ? 10000 : parseInt(searchParams.get("limit") || "50");

    if (!q && !desde && !hasta) {
      return NextResponse.json({
        success: true,
        data: { invoices: [], count: 0, total: 0 },
      });
    }

    const companyIds =
      empresa && COMPANY_MAP[empresa]
        ? [COMPANY_MAP[empresa]]
        : userCidsParam
          ? [parseInt(userCidsParam, 10)]
          : [7, 9, 10];

    const offset = todos ? 0 : (page - 1) * limit;

    // Con rango de fechas se listan TODAS las facturas y notas de crédito
    // emitidas en el rango (pagadas o no), desde account.move. El reporte de
    // CxC de abajo solo tiene lo que sigue abierto (y pagos sin aplicar).
    if (desde || hasta)
      return NextResponse.json({
        success: true,
        data: await facturasPorFecha({ companyIds, q, desde, hasta, limit, offset, page }),
      });

    const domain: any[] = [
      ["company_id", "in", companyIds],
      "|", "|",
      ["partner_name", "ilike", q],
      ["user_name", "ilike", q],
      ["document_number", "ilike", q],
    ];

    const countResult = await callOdooRPC<any>(
      "digiflex.cxc.report",
      "search_count",
      [domain],
    );
    const totalCount = typeof countResult === "number" ? countResult : 0;

    const records = (await callOdooRPC<any[]>(
      "digiflex.cxc.report",
      "search_read",
      [domain],
      {
        fields: [
          "id", "move_id", "partner_id", "partner_name",
          "user_id", "user_name", "company_id", "company_name",
          "invoice_date", "date_maturity", "days_overdue",
          "amount_residual", "document_number", "transaction_type",
        ],
        limit,
        offset,
        order: "date_maturity asc",
      },
    )) || [];

    // Banda por days_overdue, sin mirar el signo de amount_residual: una nota
    // de credito abierta (residual negativo) puede estar tan vieja como
    // cualquier factura.
    function getAgingBand(r: any): string {
      if (!r.amount_residual) return "corriente";
      if ((r.days_overdue || 0) <= 0) return "corriente";
      if (r.days_overdue <= 30) return "1-30";
      if (r.days_overdue <= 60) return "31-60";
      if (r.days_overdue <= 90) return "61-90";
      return "91+";
    }

    const results = records.map((r: any) => {
      const companyId = r.company_id?.[0] || 0;
      return {
        id: r.id,
        moveId: Array.isArray(r.move_id) ? r.move_id[0] : (typeof r.move_id === "number" ? r.move_id : 0),
        name: r.document_number || "",
        partnerId: r.partner_id?.[0] || 0,
        partnerName: r.partner_name || r.partner_id?.[1] || "Sin cliente",
        companyId,
        companyName:
          COMPANY_NAMES[companyId as keyof typeof COMPANY_NAMES] ||
          r.company_name ||
          "",
        invoiceDate: r.invoice_date || null,
        invoiceDateDue: r.date_maturity || null,
        // Con signo (negativo = nota de credito abierta) para que el total
        // sumado mas abajo neta correctamente el saldo del cliente.
        amountResidual: Math.round((r.amount_residual || 0) * 100) / 100,
        invoiceUserId: r.user_id?.[0] || 0,
        invoiceUserName: r.user_name || r.user_id?.[1] || "Sin asignar",
        agingDays: r.days_overdue || 0,
        agingBand: getAgingBand(r),
        transactionType: r.transaction_type || "",
        // Se llenan abajo desde account.move.
        amountTotal: 0,
        paymentTerm: "",
      };
    });

    // Fetch amount_total from account.move for each unique moveId
    const moveIds = [...new Set(results.map((r) => r.moveId).filter((id) => id > 0))];
    if (moveIds.length > 0) {
      try {
        const moves = await callOdooRPC<any[]>(
          "account.move", "search_read",
          [[["id", "in", moveIds]]],
          { fields: ["id", "amount_total_signed", "invoice_payment_term_id"], limit: moveIds.length },
        );
        const moveTotals: Record<number, number> = {};
        const plazoDe: Record<number, number> = {};
        (moves || []).forEach((m: any) => {
          // Con signo: una nota de crédito resta.
          moveTotals[m.id] = m.amount_total_signed || 0;
          if (Array.isArray(m.invoice_payment_term_id)) plazoDe[m.id] = m.invoice_payment_term_id[0];
        });
        // Nombre en español: el de la API sin lang está viejo en varios plazos.
        const plazos = await nombresPlazos([...new Set(Object.values(plazoDe))]);
        results.forEach((r) => {
          r.amountTotal = r.moveId && moveTotals[r.moveId]
            ? Math.round(moveTotals[r.moveId] * 100) / 100
            : 0;
          r.paymentTerm = plazos.get(plazoDe[r.moveId]) || "";
        });
      } catch {
        results.forEach((r) => { r.amountTotal = 0; r.paymentTerm = ""; });
      }
    } else {
      results.forEach((r) => { r.amountTotal = 0; r.paymentTerm = ""; });
    }

    return NextResponse.json({
      success: true,
      data: {
        invoices: results,
        count: totalCount,
        page,
        totalPages: Math.ceil(totalCount / limit),
        total: results.reduce((sum, inv) => sum + inv.amountResidual, 0),
      },
    });
  } catch (error: any) {
    console.error("Error CxC search:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}

/**
 * Facturas y notas de crédito publicadas con fecha de factura en el rango,
 * pagadas o no, con la misma forma que las filas del reporte de CxC.
 */
async function facturasPorFecha(o: {
  companyIds: number[];
  q: string;
  desde: string;
  hasta: string;
  limit: number;
  offset: number;
  page: number;
}) {
  const domain: any[] = [
    ["company_id", "in", o.companyIds],
    ["state", "=", "posted"],
    ["move_type", "in", ["out_invoice", "out_refund"]],
  ];
  if (o.desde) domain.push(["invoice_date", ">=", o.desde]);
  if (o.hasta) domain.push(["invoice_date", "<=", o.hasta]);
  if (o.q)
    domain.push(
      "|", "|",
      ["partner_id.name", "ilike", o.q],
      ["invoice_user_id.name", "ilike", o.q],
      ["name", "ilike", o.q],
    );

  const count = (await callOdooRPC<number>("account.move", "search_count", [domain])) || 0;
  const moves =
    (await callOdooRPC<any[]>("account.move", "search_read", [domain], {
      fields: [
        "id", "name", "partner_id", "company_id", "invoice_user_id", "move_type",
        "invoice_date", "invoice_date_due", "amount_total_signed",
        "amount_residual_signed", "payment_state", "invoice_payment_term_id",
      ],
      limit: o.limit,
      offset: o.offset,
      order: "invoice_date desc, name desc",
    })) || [];

  // Nombre en español: el de la API sin lang está viejo en varios plazos.
  const plazos = await nombresPlazos([
    ...new Set(
      moves
        .map((m: any) => (Array.isArray(m.invoice_payment_term_id) ? m.invoice_payment_term_id[0] : 0))
        .filter(Boolean),
    ),
  ]);

  const hoy = Date.now();
  const r2 = (n: number) => Math.round((n || 0) * 100) / 100;
  const invoices = moves.map((m: any) => {
    const companyId = m.company_id?.[0] || 0;
    const residual = r2(m.amount_residual_signed);
    const vence = m.invoice_date_due ? new Date(`${m.invoice_date_due}T00:00:00`).getTime() : hoy;
    return {
      id: m.id,
      moveId: m.id,
      name: m.name || "",
      partnerId: m.partner_id?.[0] || 0,
      partnerName: m.partner_id?.[1] || "Sin cliente",
      companyId,
      companyName: COMPANY_NAMES[companyId] || m.company_id?.[1] || "",
      invoiceDate: m.invoice_date || null,
      invoiceDateDue: m.invoice_date_due || null,
      amountResidual: residual,
      invoiceUserId: m.invoice_user_id?.[0] || 0,
      invoiceUserName: m.invoice_user_id?.[1] || "Sin asignar",
      // Días de atraso solo si sigue debiendo algo.
      agingDays: residual ? Math.max(0, Math.floor((hoy - vence) / 86400000)) : 0,
      paymentState: m.payment_state || "",
      transactionType: m.move_type === "out_refund" ? "Nota de crédito" : "Factura",
      amountTotal: r2(m.amount_total_signed),
      paymentTerm: Array.isArray(m.invoice_payment_term_id)
        ? plazos.get(m.invoice_payment_term_id[0]) || m.invoice_payment_term_id[1]
        : "",
    };
  });

  return {
    invoices,
    count,
    page: o.page,
    totalPages: Math.ceil(count / o.limit),
    total: invoices.reduce((s: number, inv: any) => s + inv.amountResidual, 0),
  };
}
