import { callOdooRPC } from "@/lib/odoo";
import { empresaForzadaPorRol, respuestaSedeNoPermitida, ROLES_ADMINISTRACION } from "@/lib/auth/sedeRol";
import { requireRoles } from "@/lib/auth/roles";
import { esCarteraVieja } from "@/lib/cxc/carteraVieja";
import { RELACIONADA } from "@/lib/cxc/cobros";
import { idsIncobrablesManuales } from "@/lib/cxc/incobrablesManuales";
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
  const auth = await requireRoles(request, [...ROLES_ADMINISTRACION, "cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresaPedida = searchParams.get("empresa")?.toLowerCase() || "";
    // Administracion solo lee la sede de su `cids` (lib/auth/sedeRol.ts).
    const empresaForzada = empresaForzadaPorRol(auth.payload, empresaPedida);
    if (empresaForzada === null) return respuestaSedeNoPermitida();
    const empresa = empresaForzada ?? empresaPedida;
    const userCidsParam = searchParams.get("userCids");

    const companyIds =
      empresa && COMPANY_MAP[empresa]
        ? [COMPANY_MAP[empresa]]
        : userCidsParam
          ? [parseInt(userCidsParam, 10)]
          : [7, 9, 10];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threeDaysLater = new Date(today);
    threeDaysLater.setDate(threeDaysLater.getDate() + 3);
    threeDaysLater.setHours(23, 59, 59, 999);

    // Usar digiflex.cxc.report — renglones con saldo abierto. Las notas de
    // credito y saldos a favor (pagos sin aplicar) traen amount_residual
    // NEGATIVO (verificado: RNC/2026/00099 = -4.81): no son alertas, se
    // restan a las facturas de su cliente (ver mas abajo).
    const domain: any[] = [
      ["company_id", "in", companyIds],
      ["amount_residual", "!=", 0],
    ];

    const [records, manuales] = await Promise.all([
      callOdooRPC<any[]>(
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
        },
      ).then((r) => r || []),
      idsIncobrablesManuales(companyIds),
    ]);

    // Fuera, como en los KPIs y el Dashboard de CxC: Supricom, SUPER TECHNO y
    // los incobrables (vencidos antes de 2025 o marcados a mano en Incobrables).
    const openInvoices = records
      .filter((r: any) => {
        const cliente = (r.partner_name || r.partner_id?.[1] || "").toLowerCase();
        if (cliente.includes("supricom") || cliente.includes(RELACIONADA)) return false;
        const moveId = Array.isArray(r.move_id) ? r.move_id[0] : r.move_id;
        return !manuales.has(moveId) && !esCarteraVieja(r.date_maturity);
      })
      .map((r: any) => {
        const residual = r.amount_residual || 0;
        const dueDateStr = r.date_maturity || null;
        let agingDays = r.days_overdue || 0;

        return {
          id: r.id,
          moveId: Array.isArray(r.move_id) ? r.move_id[0] : (typeof r.move_id === "number" ? r.move_id : 0),
          name: r.document_number || "",
          partnerId: r.partner_id?.[0] || 0,
          partnerName: r.partner_name || r.partner_id?.[1] || "Sin cliente",
          companyId: r.company_id?.[0] || 0,
          companyName: r.company_name || r.company_id?.[1] || "",
          invoiceDate: r.invoice_date || null,
          invoiceDateDue: dueDateStr,
          amountResidual: residual,
          invoiceUserId: r.user_id?.[0] || 0,
          invoiceUserName: r.user_name || r.user_id?.[1] || "Sin asignar",
          agingDays,
          transactionType: r.transaction_type || "",
        };
      });

    // Saldo a favor por cliente y sede. Casi ninguna NC abierta esta ligada a
    // su factura (nov-2026: 1 de 841, el resto migradas de Smartbit), asi que
    // se aplica a las facturas mas viejas del cliente, como en Salud
    // Administrativa (fetchCxC). Una factura cubierta del todo sale de la lista.
    const claveCliente = (inv: { companyId: number; partnerId: number; partnerName: string }) =>
      `${inv.companyId}:${inv.partnerId || inv.partnerName}`;
    const aFavor = new Map<string, number>();
    openInvoices.forEach((inv) => {
      if (inv.amountResidual < 0) {
        const k = claveCliente(inv);
        aFavor.set(k, (aFavor.get(k) || 0) - inv.amountResidual);
      }
    });
    const facturasNetas = openInvoices
      .filter((inv) => inv.amountResidual > 0)
      .sort((a, b) => (a.invoiceDateDue || "").localeCompare(b.invoiceDateDue || ""))
      .map((inv) => {
        const k = claveCliente(inv);
        const creditoAplicado = Math.min(aFavor.get(k) || 0, inv.amountResidual);
        if (creditoAplicado > 0) aFavor.set(k, (aFavor.get(k) || 0) - creditoAplicado);
        return {
          ...inv,
          saldoFactura: inv.amountResidual,
          creditoAplicado,
          amountResidual: inv.amountResidual - creditoAplicado,
        };
      })
      .filter((inv) => inv.amountResidual > 0.005);

    const facturasPorVencer = facturasNetas
      .filter((inv) => {
        if (!inv.invoiceDateDue) return false;
        const [y, m, d] = inv.invoiceDateDue.split("-").map(Number);
        const due = new Date(y, m - 1, d);
        return due >= today && due <= threeDaysLater && inv.agingDays <= 0;
      })
      .map((inv) => {
        const [y, m, d] = inv.invoiceDateDue!.split("-").map(Number);
        const due = new Date(y, m - 1, d);
        return {
          ...inv,
          daysUntilDue: Math.ceil(
            (due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
          ),
          companyName:
            COMPANY_NAMES[inv.companyId as keyof typeof COMPANY_NAMES] ||
            inv.companyName,
        };
      })
      .sort((a, b) => {
        const [ay, am, ad] = a.invoiceDateDue!.split("-").map(Number);
        const [by, bm, bd] = b.invoiceDateDue!.split("-").map(Number);
        return new Date(ay, am - 1, ad).getTime() - new Date(by, bm - 1, bd).getTime();
      });

    const facturasVencidas = facturasNetas
      .filter((inv) => inv.agingDays > 0)
      .map((inv) => ({
        ...inv,
        companyName:
          COMPANY_NAMES[inv.companyId as keyof typeof COMPANY_NAMES] ||
          inv.companyName,
      }))
      .sort((a, b) => b.agingDays - a.agingDays);

    return NextResponse.json({
      success: true,
      data: {
        facturasPorVencer,
        facturasVencidas,
        summary: {
          totalPorVencer: facturasPorVencer.length,
          totalPorVencerMonto: facturasPorVencer.reduce(
            (s, i) => s + i.amountResidual,
            0,
          ),
          totalVencidas: facturasVencidas.length,
          totalVencidasMonto: facturasVencidas.reduce(
            (s, i) => s + i.amountResidual,
            0,
          ),
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error fetching CxC alerts:", error);
    return NextResponse.json(
      { success: false, error: "Error al cargar alertas" },
      { status: 500 },
    );
  }
}
