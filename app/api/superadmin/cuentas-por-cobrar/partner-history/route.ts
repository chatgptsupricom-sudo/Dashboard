import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Fecha de la primera factura de un cliente, para Referencia Comercial.
 *
 * "Anos de relacion" en la carta era un numero escrito a mano (por defecto 2)
 * sin respaldo en ningun dato real — cualquiera podia imprimir una carta con
 * una antiguedad de relacion comercial inventada. Esto le da al formulario un
 * valor real de donde partir; sigue siendo editable a mano.
 *
 * Se consulta TODO el historial (sin filtrar por amount_residual, a
 * diferencia de digiflex.cxc.report) porque un cliente con años de relacion
 * puede tener cero facturas abiertas hoy.
 *
 * Odoo solo factura desde el corte de 2026-04-01; lo anterior esta en la
 * tabla MySQL `ventas_smartbit` (lib/smartbit.ts). Ahi no hay partner_id de
 * Odoo, asi que se cruza por RIF (`codigo_cliente` = `res.partner.vat`, sin
 * guiones ni espacios) y por la sede de la carta (`company_id`). Gana la
 * fecha mas vieja de las dos fuentes.
 */
const normalizarRif = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const partnerId = parseInt(searchParams.get("partner_id") || "", 10);
    if (!Number.isFinite(partnerId) || partnerId <= 0) {
      return NextResponse.json({ error: "partner_id invalido" }, { status: 400 });
    }
    const companyId = parseInt(searchParams.get("company_id") || "", 10);

    const [invoices, partners] = await Promise.all([
      callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [[
          ["partner_id", "=", partnerId],
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
        ]],
        { fields: ["invoice_date"], order: "invoice_date asc", limit: 1 },
      ),
      callOdooRPC<any[]>("res.partner", "read", [[partnerId]], { fields: ["vat"] }),
    ]);

    const primeraOdoo: string | null = invoices?.[0]?.invoice_date?.split(" ")[0] || null;

    // Historico Smartbit. Si la MySQL no responde se sigue con Odoo solo.
    let primeraSmartbit: string | null = null;
    const rif = normalizarRif(partners?.[0]?.vat || "");
    if (rif && Number.isFinite(companyId)) {
      try {
        const { rows } = await query(
          `SELECT DATE_FORMAT(MIN(fecha), '%Y-%m-%d') AS primera
             FROM ventas_smartbit
            WHERE company_id = ?
              AND REPLACE(REPLACE(UPPER(codigo_cliente), '-', ''), ' ', '') = ?`,
          [companyId, rif],
        );
        primeraSmartbit = (rows as any[])[0]?.primera || null;
      } catch (e: any) {
        console.error("partner-history: ventas_smartbit no disponible:", e.message);
      }
    }

    const candidatas = [primeraOdoo, primeraSmartbit].filter(Boolean) as string[];
    const firstDate = candidatas.length ? candidatas.sort()[0] : null;
    const fuente = !firstDate ? null : firstDate === primeraSmartbit ? "smartbit" : "odoo";

    let years: number | null = null;
    if (firstDate) {
      const [y, m, d] = firstDate.split("-").map(Number);
      const first = new Date(y, m - 1, d);
      const now = new Date();
      years = now.getFullYear() - first.getFullYear();
      const anniversaryPassed =
        now.getMonth() > first.getMonth() ||
        (now.getMonth() === first.getMonth() && now.getDate() >= first.getDate());
      if (!anniversaryPassed) years -= 1;
      years = Math.max(years, 0);
    }

    return NextResponse.json({ success: true, firstInvoiceDate: firstDate, fuente, years });
  } catch (error: any) {
    console.error("Error obteniendo historial de partner:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
