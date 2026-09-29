import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { porCobrarAlCierre } from "@/lib/cxc/porCobrar";
import { RELACIONADA } from "@/lib/cxc/cobros";
import { NextRequest, NextResponse } from "next/server";

/**
 * Detalle de lo que "Por cobrar" (Contado/Crédito) deja fuera del total:
 *   tipo=incobrables → facturas vencidas antes de 2025 con saldo en el corte
 *   tipo=sin_aplicar → pagos que entraron y no están aplicados a una factura
 *                      (solo hoy: en un corte pasado no se reconstruyen)
 * Mismos parámetros de período y sede que contado-credito/route.ts.
 */

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const tipo = searchParams.get("tipo");
    if (tipo !== "incobrables" && tipo !== "sin_aplicar") {
      return NextResponse.json({ error: "tipo debe ser incobrables o sin_aplicar" }, { status: 400 });
    }
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const userCidsParam = searchParams.get("userCids");
    const companyIds = empresa && COMPANY_MAP[empresa]
      ? [COMPANY_MAP[empresa]]
      : userCidsParam ? [parseInt(userCidsParam, 10)] : [7, 9, 10];

    const r2 = (n: number) => Math.round(n * 100) / 100;

    if (tipo === "sin_aplicar") {
      const lineas = await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [[
          ["account_id.account_type", "=", "asset_receivable"],
          ["parent_state", "=", "posted"],
          ["company_id", "in", companyIds],
          ["move_type", "not in", ["out_invoice", "out_refund"]],
          ["amount_residual", "!=", 0],
          ["partner_id.name", "not ilike", "supricom"],
          ["partner_id.commercial_partner_id.name", "not ilike", RELACIONADA],
        ]],
        { fields: ["id", "move_id", "partner_id", "date", "journal_id", "ref", "amount_residual"], order: "date desc", limit: 2000 },
      );
      const filas = (lineas || []).map((l) => ({
        id: l.id,
        documento: l.move_id?.[1] || "",
        referencia: l.ref || "",
        cliente: l.partner_id?.[1] || "Sin cliente",
        fecha: l.date || null,
        diario: l.journal_id?.[1] || "",
        monto: r2(Number(l.amount_residual) || 0),
      }));
      return NextResponse.json({ success: true, data: { tipo, filas, total: r2(filas.reduce((s, f) => s + f.monto, 0)) } });
    }

    // Incobrables en el corte del período (mismo corte que el total de "Por cobrar").
    const now = new Date();
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");
    let periodoFin: Date;
    if (startDateParam && endDateParam) {
      periodoFin = new Date(endDateParam + "T23:59:59");
    } else {
      const year = parseInt(searchParams.get("year") || "", 10) || now.getFullYear();
      const month = (parseInt(searchParams.get("month") || "", 10) || now.getMonth() + 1) - 1;
      periodoFin = new Date(year, month + 1, 0);
    }
    const { viejas, corte } = await porCobrarAlCierre(companyIds, periodoFin);
    const ids = [...viejas.keys()];
    const moves = ids.length
      ? await callOdooRPC<any[]>("account.move", "read", [ids], {
          fields: ["id", "name", "partner_id", "invoice_date", "invoice_date_due"],
        })
      : [];
    const filas = (moves || [])
      .map((m) => ({
        id: m.id,
        documento: m.name || "",
        referencia: "",
        cliente: m.partner_id?.[1] || "Sin cliente",
        fecha: m.invoice_date || null,
        vence: m.invoice_date_due || null,
        monto: r2(viejas.get(m.id) || 0),
      }))
      .sort((a, b) => b.monto - a.monto);
    return NextResponse.json({ success: true, data: { tipo, corte, filas, total: r2(filas.reduce((s, f) => s + f.monto, 0)) } });
  } catch (error: any) {
    console.error("Error CxC contado-credito/aparte:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
