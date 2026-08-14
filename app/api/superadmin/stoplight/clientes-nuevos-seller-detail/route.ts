import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const sellerName = url.searchParams.get("seller_name");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    if (!sellerName) {
      return NextResponse.json({ error: "Falta seller_name" }, { status: 400 });
    }

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    const normalizedSeller = normalize(sellerName);

    // 1. Fetch current month invoices for this seller
    const invoices = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "=", companyId],
          ["invoice_date", ">=", fechaInicio],
          ["invoice_date", "<=", fechaFin],
          ["invoice_user_id", "!=", false],
        ],
      ],
      {
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id", "move_type", "name"],
        limit: 10000,
      }
    );

    // 2. Filter invoices for this seller
    const sellerInvoices = (invoices || []).filter((inv: any) => {
      const name = inv.invoice_user_id?.[1];
      return name && normalize(name) === normalizedSeller;
    });

    // 3. Collect unique partner_ids from this seller's invoices
    const partnerIds = [...new Set(
      sellerInvoices.map((inv: any) => inv.partner_id?.[0]).filter(Boolean)
    )];

    if (partnerIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          mes,
          sellerName,
          totalNuevos: 0,
          clients: [],
        },
      });
    }

    // 4. Check which partners are new (no invoice before this month)
    const historicalInvoices = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["partner_id", "in", partnerIds],
          ["invoice_date", "<", fechaInicio],
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "=", companyId],
        ],
      ],
      {
        fields: ["partner_id"],
        limit: 50000,
      }
    );

    const existingPartnerIds = new Set<number>();
    (historicalInvoices || []).forEach((inv: any) => {
      const pid = inv.partner_id?.[0];
      if (pid) existingPartnerIds.add(pid);
    });

    // 5. Filter to only new clients and build their invoice list
    const partnerAlreadyCounted = new Set<number>();
    const clientsMap: Record<number, {
      partnerId: number;
      partnerName: string;
      totalFacturado: number;
      invoices: { id: number; date: string; amount: number; type: string; reference: string }[];
    }> = {};

    sellerInvoices.forEach((inv: any) => {
      const partnerId = inv.partner_id?.[0];
      if (!partnerId) return;
      if (existingPartnerIds.has(partnerId)) return;

      if (!clientsMap[partnerId]) {
        clientsMap[partnerId] = {
          partnerId,
          partnerName: inv.partner_id?.[1] || `Cliente ${partnerId}`,
          totalFacturado: 0,
          invoices: [],
        };
      }

      const amount = Number(inv.amount_untaxed) || 0;
      const realAmount = inv.move_type === "out_refund" ? -amount : amount;
      clientsMap[partnerId].totalFacturado += realAmount;
      clientsMap[partnerId].invoices.push({
        id: inv.id,
        date: inv.invoice_date,
        amount: realAmount,
        type: inv.move_type === "out_refund" ? "Nota de credito" : "Factura",
        reference: inv.name || "",
      });
    });

    // Sort invoices by date
    Object.values(clientsMap).forEach((client) => {
      client.invoices.sort((a, b) => a.date.localeCompare(b.date));
    });

    const clients = Object.values(clientsMap).sort((a, b) => b.totalFacturado - a.totalFacturado);

    return NextResponse.json({
      success: true,
      data: {
        mes,
        sellerName,
        totalNuevos: clients.length,
        clients,
      },
    });
  } catch (error: any) {
    console.error("Error en API clientes-nuevos-seller-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
