import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const auth = await requireSession(request);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("company_id");

    const domain: any[] = [
      ["state", "=", "posted"],
      ["move_type", "=", "out_invoice"],
    ];

    if (companyId && companyId !== "all") {
      domain.push(["company_id", "=", parseInt(companyId)]);
    }

    const records = (await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [domain],
      { fields: ["invoice_date"], limit: 10000 },
    )) || [];

    const monthsSet = new Set<string>();
    records.forEach((r: any) => {
      if (r.invoice_date) {
        monthsSet.add(r.invoice_date.substring(0, 7));
      }
    });

    const months = Array.from(monthsSet)
      .sort()
      .reverse()
      .map((m) => {
        const [y, mo] = m.split("-");
        const meses = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        return { value: m, label: `${meses[parseInt(mo)]} ${y}` };
      });

    return NextResponse.json({ success: true, data: { months } });
  } catch (error: any) {
    console.error("Error available-months:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
