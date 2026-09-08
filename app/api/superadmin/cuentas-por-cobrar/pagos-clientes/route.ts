import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// La lectura de account.payment de un rango amplio puede traer miles de
// registros (≈3.000 pagos de clientes por mes).
export const runtime = "nodejs";
export const maxDuration = 60;

const COMPANY_MAP: Record<string, number> = {
  valencia: 9,
  caracas: 10,
  panama: 7,
};
const COMPANY_NAMES: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };

async function fetchPaginated(model: string, domain: any[], fields: string[], order = "date desc, id desc"): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order, limit: 2000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 2000) break;
    offset += 2000;
    if (offset > 60000) break; // tope de seguridad
  }
  return result;
}

// payment_description viene como HTML ("<p>...</p>", con &nbsp; etc.).
function limpiarHtml(v: any): string {
  if (!v) return "";
  return String(v)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["cuentas por cobrar", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const empresa = (searchParams.get("empresa") || "todas").toLowerCase();
    const desde = searchParams.get("desde"); // YYYY-MM-DD
    const hasta = searchParams.get("hasta"); // YYYY-MM-DD
    const estado = (searchParams.get("estado") || "posted").toLowerCase(); // posted | todos
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    const now = new Date();
    const defDesde = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];
    const fDesde = desde || defDesde;
    const fHasta = hasta || defHasta;

    const companyIds = COMPANY_MAP[empresa] ? [COMPANY_MAP[empresa]] : [7, 9, 10];

    const domain: any[] = [
      ["payment_type", "=", "inbound"],
      ["partner_type", "=", "customer"],
      ["company_id", "in", companyIds],
      ["date", ">=", fDesde],
      ["date", "<=", fHasta],
    ];
    if (estado !== "todos") domain.push(["state", "=", "posted"]);

    const pagos = await fetchPaginated("account.payment", domain, [
      "id", "name", "date", "payment_registration_date",
      "amount", "currency_id", "amount_company_currency_signed", "tax_today",
      "mount_igtf", "amount_total_pagar", "custom_rate",
      "payment_description", "ref", "partner_id", "journal_id",
      "salesperson_id", "state", "company_id", "is_reconciled",
      "reconciled_invoice_ids", "reconciled_invoices_count",
    ]);

    // Nombres de las facturas a las que se aplicó cada pago (un solo fetch).
    const invoiceIds = [...new Set(pagos.flatMap((p) => p.reconciled_invoice_ids || []))];
    const invoiceName: Record<number, string> = {};
    for (let i = 0; i < invoiceIds.length; i += 500) {
      const chunk = invoiceIds.slice(i, i + 500);
      const moves = await callOdooRPC<any[]>(
        "account.move", "search_read", [[["id", "in", chunk]]], { fields: ["id", "name"], limit: 500 },
      );
      (moves || []).forEach((m: any) => { invoiceName[m.id] = m.name || ""; });
    }

    // RIF de los clientes en un solo fetch.
    const partnerIds = [...new Set(pagos.map((p) => p.partner_id?.[0]).filter(Boolean))];
    const partnerVat: Record<number, string> = {};
    for (let i = 0; i < partnerIds.length; i += 500) {
      const chunk = partnerIds.slice(i, i + 500);
      const partners = await callOdooRPC<any[]>(
        "res.partner", "search_read", [[["id", "in", chunk]]], { fields: ["id", "vat"], limit: 500 },
      );
      (partners || []).forEach((p: any) => { partnerVat[p.id] = p.vat || ""; });
    }

    const rows = pagos.map((p) => {
      const monedaId = p.currency_id?.[0] || null;
      const esUsd = monedaId === 1;
      const moneda = esUsd ? "USD" : "Bs";
      const amount = Number(p.amount) || 0;
      const odooUsd = Number(p.amount_company_currency_signed) || 0;
      const taxToday = Number(p.tax_today) || 0;

      // USD equivalente: para pagos en USD es el propio monto; para pagos en Bs
      // se toma la cifra de Odoo (amount_company_currency_signed) y, si viene
      // en 0/nula, se cae a amount / tasa registrada.
      let montoUsd: number;
      if (esUsd) montoUsd = amount;
      else montoUsd = odooUsd > 0 ? odooUsd : (taxToday > 0 ? amount / taxToday : 0);

      const montoBs = esUsd ? null : amount;
      // Tasa efectiva = Bs ÷ USD (implícita de las dos cifras que guardó Odoo).
      // Para un pago en USD no hay conversión, la tasa no aplica.
      const tasa = esUsd ? null : (montoUsd > 0 ? r2(amount / montoUsd) : null);

      // Fila a revisar: la tasa efectiva y la registrada difieren > 5%, o el
      // equivalente en USD quedó inválido, o (en USD) monto y cifra de compañía
      // no coinciden. Un pago genuinamente en 0 no es un error de datos.
      let revisar = false;
      if (montoUsd <= 0 && amount !== 0) revisar = true;
      else if (esUsd && amount !== 0 && Math.abs(amount - odooUsd) > 1) revisar = true;
      else if (!esUsd && tasa != null && taxToday > 0 && Math.abs(tasa - taxToday) / Math.max(taxToday, 1) > 0.05) revisar = true;

      const igtf = Number(p.mount_igtf) || 0;

      return {
        id: p.id,
        fecha: p.date || null,
        fechaRegistro: p.payment_registration_date || null,
        numeroPago: p.name || "",
        referencia: p.ref || "",
        cliente: p.partner_id?.[1] || "",
        rif: partnerVat[p.partner_id?.[0]] || "",
        sede: COMPANY_NAMES[p.company_id?.[0]] || "",
        banco: p.journal_id?.[1] || "",
        vendedor: p.salesperson_id?.[1] || "",
        moneda,
        montoOriginal: r2(amount),
        montoBs: montoBs == null ? null : r2(montoBs),
        montoUsd: r2(montoUsd),
        tasa,
        tasaRegistrada: taxToday || null,
        tasaCustom: !!p.custom_rate,
        igtf: r2(igtf),
        montoTotal: r2(Number(p.amount_total_pagar) || amount),
        descripcion: limpiarHtml(p.payment_description),
        estado: p.state || "",
        conciliado: !!p.is_reconciled,
        facturasAplicadas: (p.reconciled_invoice_ids || []).map((id: number) => invoiceName[id]).filter(Boolean).join(", "),
        facturasCount: Number(p.reconciled_invoices_count) || 0,
        revisar,
      };
    });

    const filtradas = search
      ? rows.filter((r) =>
          [r.cliente, r.rif, r.numeroPago, r.referencia, r.vendedor, r.banco, r.descripcion, r.facturasAplicadas]
            .some((c) => (c || "").toLowerCase().includes(search)))
      : rows;

    const resumen = {
      pagos: filtradas.length,
      totalUsd: r2(filtradas.reduce((s, r) => s + r.montoUsd, 0)),
      totalBs: r2(filtradas.reduce((s, r) => s + (r.montoBs || 0), 0)),
      totalIgtf: r2(filtradas.reduce((s, r) => s + r.igtf, 0)),
      porRevisar: filtradas.filter((r) => r.revisar).length,
      porMoneda: {
        USD: filtradas.filter((r) => r.moneda === "USD").length,
        Bs: filtradas.filter((r) => r.moneda === "Bs").length,
      },
      porSede: [7, 9, 10].map((cid) => ({
        sede: COMPANY_NAMES[cid],
        pagos: filtradas.filter((r) => r.sede === COMPANY_NAMES[cid]).length,
        totalUsd: r2(filtradas.filter((r) => r.sede === COMPANY_NAMES[cid]).reduce((s, r) => s + r.montoUsd, 0)),
      })).filter((x) => x.pagos > 0),
    };

    return NextResponse.json({
      success: true,
      data: {
        rows: filtradas,
        resumen,
        filtros: { empresa, desde: fDesde, hasta: fHasta, estado, search },
      },
    });
  } catch (error: any) {
    console.error("Error pagos-clientes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
