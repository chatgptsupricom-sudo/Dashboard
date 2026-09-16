import { callOdooRPC } from "@/lib/odoo";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    // El cids de la sesión (9 para adminLeads Valencia) define la empresa en Odoo
    const cids = resolveMaterialPopCids(auth.payload) ?? 9;

    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const limit = Math.min(Number(searchParams.get("limit")) || 20, 100);

    const domain: any[] = [
      ["customer_rank", ">", 0],
      ["active", "=", true],
    ];

    if (q) {
      domain.push([
        "|",
        ["name", "ilike", q],
        ["vat", "ilike", q.replace(/[^0-9]/g, "")],
      ]);
    }

    const clients = await callOdooRPC<any[]>(
      "res.partner",
      "search_read",
      [domain],
      {
        fields: ["id", "name", "vat", "email", "phone"],
        limit,
        order: "name asc",
        context: { allowed_company_ids: [cids] },
      },
    );

    const safe = (clients || []).map((c: any) => ({
      id: c.id,
      name: c.name || "",
      vat: c.vat || "",
      email: c.email || "",
      phone: c.phone || "",
    }));

    return NextResponse.json({ success: true, clients: safe });
  } catch (error: any) {
    console.error("Error buscando clientes Odoo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
