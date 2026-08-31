import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

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
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    let partnerIds: number[] | null = null;

    if (companyId && companyId !== "all") {
      const cid = parseInt(companyId, 10);
      const invoices = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [[["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["company_id", "=", cid]]],
        { fields: ["partner_id"], limit: 0 },
      );
      if (invoices && invoices.length > 0) {
        partnerIds = [...new Set(invoices.map((inv) => inv.partner_id?.[0]).filter(Boolean))];
      } else {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    const domain: any[] = [["parent_id", "=", false]];
    if (partnerIds) {
      domain.push(["id", "in", partnerIds]);
    }

    const partners = await fetchPaginated(
      "res.partner",
      domain,
      ["id", "name", "vat"],
    );

    return NextResponse.json({
      success: true,
      data: partners.map((p) => ({
        id: p.id,
        name: p.name || "",
        vat: p.vat || "",
      })),
    });
  } catch (error) {
    console.error("Error fetching partners:", error);
    return NextResponse.json({ success: false, error: "Error fetching partners" }, { status: 500 });
  }
}
