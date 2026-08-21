import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    await jwtVerify(token, JWT_SECRET);

    const url = new URL(request.url);
    const company_id = url.searchParams.get("company_id");
    const seller_user_id = url.searchParams.get("seller_user_id");

    if (!company_id || !seller_user_id) {
      return NextResponse.json({ error: "Faltan parámetros" }, { status: 400 });
    }

    const userId = parseInt(seller_user_id);
    console.log(`[SellerClients] company=${company_id}, seller_user_id=${userId}`);

    const clientSet = new Map<number, string>();

    const byUser = (await callOdooRPC<any[]>(
      "res.partner",
      "search_read",
      [
        [
          ["user_id", "=", userId],
          ["customer_rank", ">", 0],
          ["active", "=", true],
        ],
      ],
      {
        fields: ["id", "name", "user_id"],
        limit: 10000,
      }
    )) || [];

    console.log(`[SellerClients] By user_id: ${byUser.length} clients`);
    byUser.forEach((c: any) => {
      console.log(`  - ${c.name} (user_id=${c.user_id})`);
      clientSet.set(c.id, c.name);
    });

    if (clientSet.size === 0) {
      console.log(`[SellerClients] No clients by user_id, trying invoices...`);
      const invoices = (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [
          [
            ["invoice_user_id", "=", userId],
            ["move_type", "=", "out_invoice"],
            ["state", "in", ["posted", "draft"]],
          ],
        ],
        {
          fields: ["partner_id", "invoice_user_id"],
          limit: 10000,
        }
      )) || [];

      console.log(`[SellerClients] Invoices found: ${invoices.length}`);
      const partnerIds = [...new Set(
        invoices.map((inv: any) => inv.partner_id?.[0]).filter(Boolean)
      )];

      console.log(`[SellerClients] Unique partners from invoices: ${partnerIds.length}`);

      if (partnerIds.length > 0) {
        const partners = (await callOdooRPC<any[]>(
          "res.partner",
          "search_read",
          [[["id", "in", partnerIds], ["active", "=", true]]],
          { fields: ["id", "name"] }
        )) || [];
        console.log(`[SellerClients] Partners resolved: ${partners.length}`);
        partners.forEach((p: any) => clientSet.set(p.id, p.name));
      }
    }

    const result = [...clientSet.entries()].map(([id, name]) => ({ id, name }));
    console.log(`[SellerClients] Final result: ${result.length} clients`);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    console.error("Error fetching seller clients:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
