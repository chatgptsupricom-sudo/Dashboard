import { callOdooRPC } from "@/lib/odoo";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { requireRoles } from "@/lib/auth/roles";
import { esVendedorExcluido } from "@/lib/cxc/vendedoresExcluidos";
import { NextRequest, NextResponse } from "next/server";

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};

function getMonthStart(year: number, month: number): Date {
  return new Date(year, month, 1);
}

type Factura = { id: number; name: string; invoiceDate: string | null; moveType: string; amountTotal: number; paymentTermName: string; journalId?: number };

// Mismo criterio de contado/credito/dias que contado-credito/route.ts: un
// termino de pago sin numero es contado, con numero es credito a esos dias.
function diasDeTermino(ptName: string): number | null {
  const m = ptName.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

async function facturasDelMes(companyIds: number[], partnerId: number, monthStart: Date, monthEnd: Date, excluirAsistente: boolean, vendedorId: number | undefined): Promise<Factura[]> {
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
    { fields: ["id", "name", "invoice_date", "move_type", "amount_untaxed", "invoice_payment_term_id", "invoice_user_id", "company_id"], order: "invoice_date desc" },
  );

  const invoices = (invoicesRaw || [])
    .filter((inv) => !excluirAsistente || !esVendedorExcluido(inv.invoice_user_id?.[1], inv.company_id?.[0]))
    .filter((inv) => vendedorId === undefined || inv.invoice_user_id?.[0] === vendedorId);
  const ptIds = [...new Set(invoices.map((f) => f.invoice_payment_term_id?.[0]).filter(Boolean))];
  let ptMap: Record<number, string> = {};
  if (ptIds.length > 0) {
    try {
      const pts = await callOdooRPC<any[]>("account.payment.term", "read", [ptIds], { fields: ["id", "name"] });
      (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
    } catch (_) {}
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  return invoices.map((inv) => ({
    id: inv.id,
    name: inv.name || "",
    invoiceDate: inv.invoice_date || null,
    moveType: inv.move_type,
    amountTotal: round2(inv.move_type === "out_refund" ? -(inv.amount_untaxed || 0) : (inv.amount_untaxed || 0)),
    paymentTermName: ptMap[inv.invoice_payment_term_id?.[0]] || "Contado",
  }));
}

// Abonos del cliente en el periodo (fecha de confirmacion del pago, no fecha
// de factura) -- misma fuente que contado-credito/route.ts (lib/cxc/cobros.ts),
// acotada al partner en el dominio de Odoo.
async function cobrosDelMes(
  companyIds: number[], partnerId: number, monthStart: Date, monthEnd: Date, excluirAsistente: boolean,
  vendedorId: number | undefined, bancoId: number | undefined, excluirRetenciones: boolean, excluirIva25: boolean,
): Promise<Factura[]> {
  const cobros = await obtenerCobros(companyIds, {
    desde: monthStart.toISOString().split("T")[0],
    hasta: monthEnd.toISOString().split("T")[0],
    dominioFactura: [["partner_id", "=", partnerId]],
    excluirRetenciones,
    excluirIva25,
  });

  const filtrados = cobros.filter((c) => {
    // "Cobrado" no excluye asistentes por defecto (ver contado-credito/route.ts).
    if (excluirAsistente && esVendedorExcluido(c.vendedorName, c.companyId)) return false;
    if (vendedorId !== undefined && c.vendedorId !== vendedorId) return false;
    if (bancoId !== undefined && c.journalId !== bancoId) return false;
    return true;
  });

  const ptIds = [...new Set(filtrados.map((c) => c.plazoId).filter((id): id is number => Boolean(id)))];
  const ptMap: Record<number, string> = {};
  if (ptIds.length > 0) {
    try {
      const pts = await callOdooRPC<any[]>("account.payment.term", "read", [ptIds], { fields: ["id", "name"] });
      (pts || []).forEach((pt) => { ptMap[pt.id] = pt.name; });
    } catch (_) {}
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;
  return filtrados
    .map((c) => ({
      id: c.facturaId,
      name: c.facturaNombre,
      invoiceDate: c.fecha,
      moveType: c.facturaTipo,
      amountTotal: round2(c.monto),
      paymentTermName: (c.plazoId && ptMap[c.plazoId]) || "Contado",
      journalId: c.journalId,
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
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    const modoParam = searchParams.get("modo");
    const modo = modoParam === "cobrado" ? "cobrado" : "facturado";
    // Mismo toggle que contado-credito/route.ts: si no viene explicito, el
    // default historico de cada modo (Facturado si excluia, Cobrado no).
    const excluirAsistenteParam = searchParams.get("excluirAsistente");
    const excluirAsistente = excluirAsistenteParam !== null ? excluirAsistenteParam === "true" : modo !== "cobrado";
    // Mismos checks que contado-credito/route.ts (solo en Cobrado).
    const excluirRetenciones = searchParams.get("excluirRetenciones") !== "false";
    const excluirIva25 = searchParams.get("excluirIva25") !== "false";
    // Filtros globales de la pantalla (los mismos que contado-credito/
    // route.ts): vendedor puntual y banco/diario puntual, independientes
    // de la card de la que salio el drill-down.
    const vendedorIdParam = searchParams.get("vendedorId");
    const vendedorId = vendedorIdParam ? parseInt(vendedorIdParam, 10) : undefined;
    const bancoIdParam = searchParams.get("bancoId");
    const bancoId = bancoIdParam ? parseInt(bancoIdParam, 10) : undefined;
    // Filtro opcional: acota a la misma card de la que salio el drill-down
    // (Contado/Credito, un plazo puntual, o un banco), para no mostrar en
    // "Cobros -- Cliente X" abonos de otros plazos o bancos mezclados con
    // el que el usuario clickeo.
    const tipoParam = searchParams.get("tipo");
    const diasParam = searchParams.get("dias");
    const journalIdParam = searchParams.get("journalId");

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

    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam
        ? [parseInt(userCidsParam, 10)]
        : [7, 9, 10];

    let facturas = modo === "cobrado"
      ? await cobrosDelMes(companyIds, partnerId, monthStart, monthEnd, excluirAsistente, vendedorId, bancoId, excluirRetenciones, excluirIva25)
      : await facturasDelMes(companyIds, partnerId, monthStart, monthEnd, excluirAsistente, vendedorId);

    if (journalIdParam) {
      const journalId = parseInt(journalIdParam, 10);
      facturas = facturas.filter((f) => f.journalId === journalId);
    } else if (diasParam) {
      const dias = parseInt(diasParam, 10);
      facturas = facturas.filter((f) => diasDeTermino(f.paymentTermName) === dias);
    } else if (tipoParam === "contado") {
      facturas = facturas.filter((f) => diasDeTermino(f.paymentTermName) === null);
    } else if (tipoParam === "credito") {
      facturas = facturas.filter((f) => diasDeTermino(f.paymentTermName) !== null);
    }

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
