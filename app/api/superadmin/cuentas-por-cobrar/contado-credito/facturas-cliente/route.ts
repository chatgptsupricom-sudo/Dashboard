import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

const CUSTOMER_INVOICE_TYPES = new Set(["out_invoice", "out_refund"]);

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

type Factura = { id: number; name: string; invoiceDate: string | null; moveType: string; amountTotal: number; paymentTermName: string };

async function facturasDelMes(companyIds: number[], partnerId: number, monthStart: Date, monthEnd: Date, cobrado: boolean): Promise<Factura[]> {
  const invoicesRaw = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
      ["partner_id", "=", partnerId],
      ["invoice_date", ">=", monthStart.toISOString().split("T")[0]],
      ["invoice_date", "<=", monthEnd.toISOString().split("T")[0]],
    ]],
    { fields: ["id", "name", "invoice_date", "move_type", "amount_total", "amount_residual", "invoice_payment_term_id"], order: "invoice_date desc" },
  );

  const invoices = invoicesRaw || [];
  const ptIds = [...new Set(invoices.map((f) => f.invoice_payment_term_id?.[0]).filter(Boolean))];
  let ptMap: Record<number, string> = {};
  if (ptIds.length > 0) {
    try {
      const pts = await callOdooRPC<any[]>("account.payment.term", "read", [ptIds], { fields: ["id", "name"] });
      (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
    } catch (_) {}
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return invoices.map((inv) => {
    const amountTotal = inv.move_type === "out_refund" ? -(inv.amount_total || 0) : (inv.amount_total || 0);
    let monto = amountTotal;
    if (cobrado) {
      const residual = inv.move_type === "out_refund" ? -(inv.amount_residual || 0) : (inv.amount_residual || 0);
      monto = amountTotal - residual;
    }
    return {
      id: inv.id,
      name: inv.name || "",
      invoiceDate: inv.invoice_date || null,
      moveType: inv.move_type,
      amountTotal: round2(monto),
      paymentTermName: ptMap[inv.invoice_payment_term_id?.[0]] || "Contado",
    };
  });
}

// Abonos del cliente ese mes (fecha de conciliacion, no fecha de factura) --
// mismo mecanismo que contado-credito/route.ts::renglonesCobradoDinero,
// filtrado ademas por partner.
async function cobrosDelMes(companyIds: number[], partnerId: number, monthStart: Date, monthEnd: Date): Promise<Factura[]> {
  const reconciles = await fetchPaginated(
    "account.partial.reconcile",
    [],
    ["amount", "debit_move_id", "credit_move_id"],
  );
  if (reconciles.length === 0) return [];

  const lineIds = new Set<number>();
  reconciles.forEach((r) => {
    if (r.debit_move_id) lineIds.add(r.debit_move_id[0]);
    if (r.credit_move_id) lineIds.add(r.credit_move_id[0]);
  });

  const lines = await callOdooRPC<any[]>(
    "account.move.line", "search_read",
    [[["id", "in", Array.from(lineIds)]]],
    { fields: ["move_id"] },
  );
  const lineToMoveMap: Record<number, number> = {};
  (lines || []).forEach((l) => { lineToMoveMap[l.id] = l.move_id[0]; });

  const moves = await fetchPaginated(
    "account.move",
    [["company_id", "in", companyIds]],
    ["name", "state", "amount_total", "partner_id", "move_type", "date", "invoice_payment_term_id"],
  );
  const moveMap: Record<number, any> = {};
  moves.forEach((m) => { moveMap[m.id] = m; });

  const startStr = monthStart.toISOString().split("T")[0];
  const endStr = monthEnd.toISOString().split("T")[0];

  const ptIdsVistos = new Set<number>();
  const crudos: { move: any; paymentMove: any; monto: number }[] = [];

  reconciles.forEach((r) => {
    const dMove = moveMap[lineToMoveMap[r.debit_move_id?.[0]]];
    const cMove = moveMap[lineToMoveMap[r.credit_move_id?.[0]]];
    if (!dMove || !cMove) return;

    const dIsCustomerInvoice = CUSTOMER_INVOICE_TYPES.has(dMove.move_type);
    const cIsCustomerInvoice = CUSTOMER_INVOICE_TYPES.has(cMove.move_type);
    if (dIsCustomerInvoice === cIsCustomerInvoice) return;

    const invoiceMove = dIsCustomerInvoice ? dMove : cMove;
    const paymentMove = dIsCustomerInvoice ? cMove : dMove;
    if (CUSTOMER_INVOICE_TYPES.has(paymentMove.move_type)) return;
    if (!invoiceMove.partner_id || invoiceMove.partner_id[0] !== partnerId) return;

    const fechaAbono = (paymentMove.date || "").split(" ")[0].split("T")[0];
    if (fechaAbono < startStr || fechaAbono > endStr) return;

    if (invoiceMove.invoice_payment_term_id?.[0]) ptIdsVistos.add(invoiceMove.invoice_payment_term_id[0]);
    crudos.push({ move: invoiceMove, paymentMove, monto: r.amount || 0 });
  });

  let ptMap: Record<number, string> = {};
  if (ptIdsVistos.size > 0) {
    try {
      const pts = await callOdooRPC<any[]>("account.payment.term", "read", [[...ptIdsVistos]], { fields: ["id", "name"] });
      (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
    } catch (_) {}
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return crudos
    .map(({ move, paymentMove, monto }) => ({
      id: move.id,
      name: move.name || "",
      invoiceDate: paymentMove.date || null,
      moveType: move.move_type,
      amountTotal: round2(monto),
      paymentTermName: ptMap[move.invoice_payment_term_id?.[0]] || "Contado",
    }))
    .sort((a, b) => (b.invoiceDate || "").localeCompare(a.invoiceDate || ""));
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const partnerIdParam = searchParams.get("partnerId");
    if (!partnerIdParam) {
      return NextResponse.json({ error: "partnerId es requerido" }, { status: 400 });
    }
    const partnerId = parseInt(partnerIdParam, 10);

    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const monthParam = searchParams.get("month");
    const yearParam = searchParams.get("year");
    const modoParam = searchParams.get("modo");
    const modo = (modoParam === "cobrado_facturas" || modoParam === "cobrado_dinero") ? modoParam : "facturado";

    const now = new Date();
    const currentYear = yearParam ? parseInt(yearParam) : now.getFullYear();
    const currentMonth = monthParam ? parseInt(monthParam) - 1 : now.getMonth();
    const monthStart = getMonthStart(currentYear, currentMonth);
    const monthEnd = new Date(currentYear, currentMonth + 1, 0);

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    const facturas = modo === "cobrado_dinero"
      ? await cobrosDelMes(companyIds, partnerId, monthStart, monthEnd)
      : await facturasDelMes(companyIds, partnerId, monthStart, monthEnd, modo === "cobrado_facturas");

    const round2 = (n: number) => Math.round(n * 100) / 100;

    return NextResponse.json({
      success: true,
      data: {
        partnerId,
        facturas,
        total: round2(facturas.reduce((s, f) => s + f.amountTotal, 0)),
        filters: { empresa, month: currentMonth + 1, year: currentYear, companyIds, modo },
      },
    });
  } catch (error: any) {
    console.error("Error CxC facturas-cliente API:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
