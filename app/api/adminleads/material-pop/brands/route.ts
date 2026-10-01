import { callOdooRPC } from "@/lib/odoo";
import { requireAdminLeadsValencia } from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Marcas del catálogo Odoo (modelo del campo x_studio_marca de product.product). */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const marcas = await callOdooRPC<any[]>(
      "spiff.brand",
      "search_read",
      [[]],
      { fields: ["id", "name"], limit: 0, order: "name asc" },
    );

    const brands = (marcas ?? [])
      .map((m: any) => String(m?.name || "").trim())
      .filter(Boolean);

    return NextResponse.json({ success: true, brands });
  } catch (error: any) {
    console.error("Error listando marcas Odoo:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
