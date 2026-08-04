import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const uid = payload.uid as number;

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    const invoices = await callOdooRPC<any[]>(
      "account.move", "search_read",
      [[
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
        ["invoice_date", ">=", fechaInicio],
        ["invoice_date", "<=", fechaFin],
        ["invoice_user_id", "=", uid],
      ]],
      { fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id", "move_type", "name"], limit: 10000 }
    );

    const partnerIds = [...new Set((invoices || []).map((inv: any) => inv.partner_id?.[0]).filter(Boolean))];
    if (partnerIds.length === 0) {
      return NextResponse.json({ success: true, data: { mes, totalNuevos: 0, clients: [] } });
    }

    const historicalInvoices = await callOdooRPC<any[]>(
      "account.move", "search_read",
      [[
        ["partner_id", "in", partnerIds],
        ["invoice_date", "<", fechaInicio],
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
      ]],
      { fields: ["partner_id"], limit: 50000 }
    );

    const existingPartnerIds = new Set<number>();
    (historicalInvoices || []).forEach((inv: any) => { const pid = inv.partner_id?.[0]; if (pid) existingPartnerIds.add(pid); });

    const clientsMap: Record<number, { partnerId: number; partnerName: string; totalFacturado: number; invoices: any[] }> = {};
    (invoices || []).forEach((inv: any) => {
      const partnerId = inv.partner_id?.[0];
      if (!partnerId || existingPartnerIds.has(partnerId)) return;
      if (!clientsMap[partnerId]) {
        clientsMap[partnerId] = { partnerId, partnerName: inv.partner_id?.[1] || `Cliente ${partnerId}`, totalFacturado: 0, invoices: [] };
      }
      const amount = Number(inv.amount_untaxed) || 0;
      const realAmount = inv.move_type === "out_refund" ? -amount : amount;
      clientsMap[partnerId].totalFacturado += realAmount;
      clientsMap[partnerId].invoices.push({ id: inv.id, date: inv.invoice_date, amount: realAmount, type: inv.move_type === "out_refund" ? "Nota de credito" : "Factura", reference: inv.name || "" });
    });

    Object.values(clientsMap).forEach((c) => c.invoices.sort((a: any, b: any) => a.date.localeCompare(b.date)));
    const clients = Object.values(clientsMap).sort((a, b) => b.totalFacturado - a.totalFacturado);

    return NextResponse.json({ success: true, data: { mes, totalNuevos: clients.length, clients } });
  } catch (error: any) {
    console.error("Error en API clientes-nuevos-seller-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
