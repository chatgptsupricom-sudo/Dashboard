import { callOdooRPC } from "@/lib/odoo";
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
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");

    const companyIds =
      empresa && COMPANY_MAP[empresa]
        ? [COMPANY_MAP[empresa]]
        : userCidsParam
          ? [parseInt(userCidsParam, 10)]
          : [7, 9, 10];

    const domain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
      ["amount_residual", ">", 0],
    ];

    const allInvoices =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [domain],
        {
          fields: [
            "id",
            "name",
            "partner_id",
            "company_id",
            "move_type",
            "invoice_date",
            "invoice_date_due",
            "amount_untaxed",
            "amount_total",
            "amount_residual",
            "invoice_user_id",
          ],
        },
      )) || [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const invoices = allInvoices
      .filter(
        (inv) =>
          !inv.partner_id?.[1]?.toLowerCase().includes("supricom") &&
          (inv.amount_residual || 0) > 0,
      )
      .filter((inv) => {
        const userId = inv.invoice_user_id?.[0] || 0;
        const userName = (inv.invoice_user_id?.[1] || "").toLowerCase().trim();
        if (!userId || userId === 0) return false;
        const excluded = ["hercilio", "asistente de ventas", "asistente de ventas css", "dameris", "adriana"];
        return !excluded.some((ex) => userName.includes(ex));
      })
      .map((inv) => {
        const amountTotal =
          inv.move_type === "out_refund"
            ? -Math.abs(inv.amount_total || 0)
            : inv.amount_total || 0;
        const residual = inv.amount_residual || 0;
        const dueDateStr = inv.invoice_date_due || null;

        let agingDays = 0;
        if (dueDateStr && residual > 0) {
          const [y, m, d] = dueDateStr
            .split(" ")[0]
            .split("-")
            .map(Number);
          const due = new Date(y, m - 1, d);
          agingDays = Math.floor(
            (today.getTime() - due.getTime()) / (1000 * 60 * 60 * 24),
          );
        }

        const companyId = inv.company_id?.[0] || 0;

        return {
          partnerId: inv.partner_id?.[0] || 0,
          partnerName: inv.partner_id?.[1] || "Sin cliente",
          userId: inv.invoice_user_id?.[0] || 0,
          userName: inv.invoice_user_id?.[1] || "Sin asignar",
          companyId,
          companyName:
            COMPANY_NAMES[companyId as keyof typeof COMPANY_NAMES] ||
            inv.company_id?.[1] ||
            "",
          amountTotal: amountTotal,
          amountResidual: residual,
          agingDays,
          invoiceDate: inv.invoice_date || null,
          invoiceDateDue: dueDateStr,
          invoiceName: inv.name || "",
        };
      });

    const bySalesperson: Record<
      number,
      {
        userId: number;
        userName: string;
        totalReceivable: number;
        totalOverdue: number;
        invoiceCount: number;
        clients: Record<
          number,
          {
            partnerId: number;
            partnerName: string;
            total: number;
            overdue: number;
            count: number;
            oldest: number;
            companies: Set<string>;
          }
        >;
      }
    > = {};

    invoices.forEach((inv) => {
      const uid = inv.userId;
      if (!bySalesperson[uid]) {
        bySalesperson[uid] = {
          userId: uid,
          userName: inv.userName,
          totalReceivable: 0,
          totalOverdue: 0,
          invoiceCount: 0,
          clients: {},
        };
      }
      const sp = bySalesperson[uid];
      sp.totalReceivable += Math.abs(inv.amountResidual);
      sp.invoiceCount++;
      if (inv.agingDays > 0) {
        sp.totalOverdue += Math.abs(inv.amountResidual);
      }

      const pid = inv.partnerId;
      if (!sp.clients[pid]) {
        sp.clients[pid] = {
          partnerId: pid,
          partnerName: inv.partnerName,
          total: 0,
          overdue: 0,
          count: 0,
          oldest: 0,
          companies: new Set(),
        };
      }
      const client = sp.clients[pid];
      client.total += Math.abs(inv.amountResidual);
      client.count++;
      if (inv.agingDays > client.oldest) {
        client.oldest = inv.agingDays;
      }
      if (inv.agingDays > 0) {
        client.overdue += Math.abs(inv.amountResidual);
      }
      client.companies.add(inv.companyName);
    });

    const result = Object.values(bySalesperson)
      .map((sp) => ({
        userId: sp.userId,
        userName: sp.userName,
        totalReceivable: Math.round(sp.totalReceivable * 100) / 100,
        totalOverdue: Math.round(sp.totalOverdue * 100) / 100,
        invoiceCount: sp.invoiceCount,
        clients: Object.values(sp.clients)
          .sort((a, b) => b.total - a.total)
          .map((c) => ({
            partnerId: c.partnerId,
            partnerName: c.partnerName,
            total: Math.round(c.total * 100) / 100,
            overdue: Math.round(c.overdue * 100) / 100,
            count: c.count,
            oldest: c.oldest,
            companies: Array.from(c.companies),
          })),
      }))
      .sort((a, b) => b.totalReceivable - a.totalReceivable);

    return NextResponse.json({
      success: true,
      data: {
        salespeople: result,
        summary: {
          totalReceivable: result.reduce(
            (s, sp) => s + sp.totalReceivable,
            0,
          ),
          totalOverdue: result.reduce((s, sp) => s + sp.totalOverdue, 0),
          totalClients: result.reduce(
            (s, sp) => s + sp.clients.length,
            0,
          ),
          totalSalespeople: result.length,
        },
        updatedAt: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Error CxC top clients:", error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
