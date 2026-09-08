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

// Diarios que NO son un cobro real de dinero: retenciones que hace el cliente
// (IVA / ISLR / ITBMS / IGTF), descuentos y devoluciones locales, operaciones
// varias y facturas de cliente. Van en la pestaña "Retenciones y ajustes", no
// en "Cobros". En la práctica sólo aparecen RIVAC, DCTO, ITBRC y RIGTF sobre
// pagos de clientes; el resto se deja por si se usan a futuro.
const CODIGOS_AJUSTE = new Set([
  "RIVAC", "ISLRC", "ITBRC", "RIGTF",  // retenciones del cliente
  "DCTO", "DCTOL", "DSCTO", "DEVLO",   // descuento / devolución (local)
  "MISC", "MISCE",                      // operaciones varias
  "FCLIE", "INV",                       // facturas de cliente
]);

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
    const estado = (searchParams.get("estado") || "posted").toLowerCase(); // posted | todos
    const search = (searchParams.get("search") || "").trim().toLowerCase();

    // Dos rangos de fecha independientes (se aplican en AND si vienen los dos):
    //  - confirmación: `payment_registration_date` (cuándo se registró el pago
    //    en Odoo). Es la fecha principal que pidió Administración.
    //  - pago: `date` del asiento (fecha valor del pago, puede estar retroactiva).
    const desdeConf = searchParams.get("desdeConf");
    const hastaConf = searchParams.get("hastaConf");
    const desdePago = searchParams.get("desdePago");
    const hastaPago = searchParams.get("hastaPago");

    const now = new Date();
    const defDesde = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const defHasta = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split("T")[0];

    // Si no viene ningún rango, se usa el mes en curso sobre la fecha de
    // confirmación (evita traer los 13k registros del histórico).
    const hayPago = !!(desdePago && hastaPago);
    const hayConf = !!(desdeConf && hastaConf);
    const cDesde = hayConf ? desdeConf! : (hayPago ? null : defDesde);
    const cHasta = hayConf ? hastaConf! : (hayPago ? null : defHasta);

    const companyIds = COMPANY_MAP[empresa] ? [COMPANY_MAP[empresa]] : [7, 9, 10];

    const domain: any[] = [
      ["payment_type", "=", "inbound"],
      ["partner_type", "=", "customer"],
      ["company_id", "in", companyIds],
    ];
    if (estado !== "todos") domain.push(["state", "=", "posted"]);
    if (desdePago && hastaPago) {
      domain.push(["date", ">=", desdePago], ["date", "<=", hastaPago]);
    }
    if (cDesde && cHasta) {
      // payment_registration_date empezó a poblarse en abr-2026; para los pocos
      // registros previos con el campo vacío, se cae a create_date (siempre
      // presente). En notación polaca: (reg en rango) OR (reg vacío AND create en rango).
      domain.push(
        "|",
        "&", ["payment_registration_date", ">=", cDesde], ["payment_registration_date", "<=", cHasta],
        "&", ["payment_registration_date", "=", false],
        "&", ["create_date", ">=", `${cDesde} 00:00:00`], ["create_date", "<=", `${cHasta} 23:59:59`],
      );
    }

    const pagos = await fetchPaginated("account.payment", domain, [
      "id", "name", "date", "payment_registration_date", "create_date",
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

    // Código de cada diario (para clasificar cobro vs ajuste; el nombre del
    // diario varía según el idioma, el código no).
    const journalCode: Record<number, string> = {};
    const journals = await callOdooRPC<any[]>(
      "account.journal", "search_read", [[["company_id", "in", companyIds]]], { fields: ["id", "code"], limit: 0 },
    );
    (journals || []).forEach((j: any) => { journalCode[j.id] = j.code || ""; });

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
      const codigo = journalCode[p.journal_id?.[0]] || "";
      const tipo: "cobro" | "ajuste" = CODIGOS_AJUSTE.has(codigo) ? "ajuste" : "cobro";
      const vendedor = p.salesperson_id?.[1] || "";

      return {
        id: p.id,
        // Fecha de pago = fecha valor del asiento (puede estar retroactiva).
        fechaPago: p.date || null,
        // Fecha de confirmación = cuándo se registró el pago en Odoo.
        fechaConfirmacion: p.payment_registration_date || (p.create_date ? String(p.create_date).split(/[ T]/)[0] : null),
        numeroPago: p.name || "",
        referencia: p.ref || "",
        cliente: p.partner_id?.[1] || "",
        rif: partnerVat[p.partner_id?.[0]] || "",
        sede: COMPANY_NAMES[p.company_id?.[0]] || "",
        banco: p.journal_id?.[1] || "",
        vendedor,
        tipo,
        esAsistente: /asistente/i.test(vendedor),
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

    return NextResponse.json({
      success: true,
      data: {
        rows: filtradas,
        filtros: {
          empresa, estado, search,
          confirmacion: cDesde && cHasta ? { desde: cDesde, hasta: cHasta } : null,
          pago: desdePago && hastaPago ? { desde: desdePago, hasta: hastaPago } : null,
        },
      },
    });
  } catch (error: any) {
    console.error("Error pagos-clientes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
