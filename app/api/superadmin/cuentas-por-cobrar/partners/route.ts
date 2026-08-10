import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const partners = (await callOdooRPC<any[]>(
      "res.partner",
      "search_read",
      [[["parent_id", "=", false]]],
      {
        fields: ["id", "name", "vat"],
        limit: 2000,
      },
    )) || [];

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
