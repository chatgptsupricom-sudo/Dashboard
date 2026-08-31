import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fecha de la primera factura de un cliente, para Referencia Comercial.
 *
 * "Anos de relacion" en la carta era un numero escrito a mano (por defecto 2)
 * sin respaldo en ningun dato real — cualquiera podia imprimir una carta con
 * una antiguedad de relacion comercial inventada. Esto le da al formulario un
 * valor real de donde partir; sigue siendo editable a mano porque puede haber
 * relacion comercial de antes de que existiera este Odoo.
 *
 * Se consulta TODO el historial (sin filtrar por amount_residual, a
 * diferencia de digiflex.cxc.report) porque un cliente con años de relacion
 * puede tener cero facturas abiertas hoy.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const partnerId = parseInt(searchParams.get("partner_id") || "", 10);
    if (!Number.isFinite(partnerId) || partnerId <= 0) {
      return NextResponse.json({ error: "partner_id invalido" }, { status: 400 });
    }

    const invoices = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [[
        ["partner_id", "=", partnerId],
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
      ]],
      { fields: ["invoice_date"], order: "invoice_date asc", limit: 1 },
    );

    const firstDate: string | null = invoices?.[0]?.invoice_date || null;
    let years: number | null = null;
    if (firstDate) {
      const [y, m, d] = firstDate.split(" ")[0].split("-").map(Number);
      const first = new Date(y, m - 1, d);
      const now = new Date();
      years = now.getFullYear() - first.getFullYear();
      const anniversaryPassed =
        now.getMonth() > first.getMonth() ||
        (now.getMonth() === first.getMonth() && now.getDate() >= first.getDate());
      if (!anniversaryPassed) years -= 1;
      years = Math.max(years, 0);
    }

    return NextResponse.json({ success: true, firstInvoiceDate: firstDate, years });
  } catch (error: any) {
    console.error("Error obteniendo historial de partner:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
