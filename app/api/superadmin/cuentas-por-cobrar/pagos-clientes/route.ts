import { callOdooRPC } from "@/lib/odoo";
import { requireRoles } from "@/lib/auth/roles";
import { COMPANY_NAMES, companyIdsEnAlcance } from "@/lib/cxc/alcance";
import { esVendedorExcluido } from "@/lib/cxc/vendedoresExcluidos";
import { NextRequest, NextResponse } from "next/server";

// La lectura de account.payment de un rango amplio puede traer miles de
// registros (≈3.000 pagos de clientes por mes).
export const runtime = "nodejs";
export const maxDuration = 60;

// Pestaña "Cobros" vs "Retenciones y ajustes": misma regla que "Cobrado" en
// Contado/Crédito y el resto de CxC (lib/cxc/cobros.ts) — diario de tipo
// banco/caja y sin "retenido" en el nombre. Así el "Aplicado a facturas" de la
// pestaña Cobros cuadra con Cobrado para el mismo rango de confirmación.
const esDiarioBanco = (j: { type?: string; name?: any } | undefined) =>
  !!j && (j.type === "bank" || j.type === "cash") && !String(j.name || "").toLowerCase().includes("retenido");

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

/** Une condiciones de dominio con AND en notación polaca. */
const conY = (conds: any[]): any[] => [...Array(Math.max(0, conds.length - 1)).fill("&"), ...conds];

// `create_date` es datetime y Odoo lo guarda en UTC, pero las fechas del filtro
// y las que ve el usuario son horas de Caracas (UTC-4 fijo, sin horario de
// verano desde 2016). Sin corregir, un pago creado después de las 20:00 locales
// caía en el día siguiente.
const HORAS_CARACAS = -4;

const desplazar = (iso: string, horas: number): Date => {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + horas);
  return d;
};

/** Borde del día de Caracas como timestamp UTC, para comparar con create_date. */
const bordeUtc = (fecha: string, fin: boolean): string =>
  desplazar(`${fecha}T${fin ? "23:59:59" : "00:00:00"}Z`, -HORAS_CARACAS)
    .toISOString().slice(0, 19).replace("T", " ");

/** YYYY-MM-DD en Caracas de un datetime UTC de Odoo. */
const fechaCaracas = (utc: string): string =>
  desplazar(`${String(utc).replace(" ", "T").replace("Z", "")}Z`, HORAS_CARACAS)
    .toISOString().slice(0, 10);

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

    // Cada extremo es independiente: con solo "desde" el rango queda abierto
    // hacia adelante. Antes se exigían los dos y, si faltaba uno, el filtro se
    // descartaba entero y se caía al mes en curso sin avisar: la pantalla
    // mostraba la fecha escrita y los datos eran de otro rango.
    const hayPago = !!(desdePago || hastaPago);
    const hayConf = !!(desdeConf || hastaConf);
    // Sin ningún rango se usa el mes en curso sobre la fecha de confirmación
    // (evita traer los 13k registros del histórico).
    const cDesde = desdeConf || (hayConf || hayPago ? null : defDesde);
    const cHasta = hastaConf || (hayConf || hayPago ? null : defHasta);

    // La sede sale del token, no del query string: `empresa` solo puede
    // acotar el alcance propio, nunca ampliarlo.
    const companyIds = companyIdsEnAlcance(auth.payload, empresa);
    if (companyIds.length === 0) {
      return NextResponse.json({ error: "Sede fuera de alcance" }, { status: 403 });
    }

    const domain: any[] = [
      ["payment_type", "=", "inbound"],
      ["partner_type", "=", "customer"],
      ["company_id", "in", companyIds],
    ];
    if (estado !== "todos") domain.push(["state", "=", "posted"]);
    if (desdePago) domain.push(["date", ">=", desdePago]);
    if (hastaPago) domain.push(["date", "<=", hastaPago]);
    if (cDesde || cHasta) {
      // payment_registration_date solo está vacía en pagos en borrador o
      // anulados (se llena al confirmar), así que la rama de create_date únicamente
      // entra con el estado "Todos". En notación polaca:
      // (reg en rango) OR (reg vacío AND create en rango).
      const reg: any[] = [];
      const creado: any[] = [];
      if (cDesde) {
        reg.push(["payment_registration_date", ">=", cDesde]);
        creado.push(["create_date", ">=", bordeUtc(cDesde, false)]);
      }
      if (cHasta) {
        reg.push(["payment_registration_date", "<=", cHasta]);
        creado.push(["create_date", "<=", bordeUtc(cHasta, true)]);
      }
      domain.push(
        "|",
        ...conY(reg),
        "&", ["payment_registration_date", "=", false],
        ...conY(creado),
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

    const journalById: Record<number, any> = {};
    const journals = await callOdooRPC<any[]>(
      "account.journal", "search_read", [[["company_id", "in", companyIds]]], { fields: ["id", "code", "type", "name"], limit: 0 },
    );
    (journals || []).forEach((j: any) => { journalById[j.id] = j; });

    // Cuánto de cada pago se aplicó a facturas y cuánto queda sin aplicar
    // (anticipo). Sale de la línea por cobrar del pago: su saldo abierto es lo
    // no aplicado, y sus conciliaciones contra facturas son lo aplicado — las
    // mismas conciliaciones que suma "Cobrado" en Contado/Crédito.
    const aplicado: Record<number, number> = {};
    // Parte de lo aplicado que fue a facturas de vendedores excluidos (según el
    // vendedor de la FACTURA, como hace Contado/Crédito): con el check "Excluir
    // asistentes" la pantalla resta solo esto, no el pago entero.
    const aplicadoExcluido: Record<number, number> = {};
    const sinAplicar: Record<number, number> = {};
    const pagoIds = pagos.map((p) => p.id);
    for (let i = 0; i < pagoIds.length; i += 2000) {
      const chunk = pagoIds.slice(i, i + 2000);
      const lineas = await fetchPaginated(
        "account.move.line",
        [["payment_id", "in", chunk], ["account_id.account_type", "=", "asset_receivable"]],
        ["id", "payment_id", "amount_residual"],
        "id asc",
      );
      const pagoDeLinea: Record<number, number> = {};
      lineas.forEach((l: any) => {
        const pid = l.payment_id?.[0];
        if (!pid) return;
        pagoDeLinea[l.id] = pid;
        sinAplicar[pid] = (sinAplicar[pid] || 0) - (Number(l.amount_residual) || 0);
      });
      const lineIds = Object.keys(pagoDeLinea).map(Number);
      if (lineIds.length === 0) continue;
      const conciliaciones = await fetchPaginated(
        "account.partial.reconcile",
        [["credit_move_id", "in", lineIds], ["debit_move_id.move_id.move_type", "in", ["out_invoice", "out_refund"]]],
        ["amount", "credit_move_id", "debit_move_id"],
        "id asc",
      );

      // Vendedor y sede de cada factura conciliada.
      const facturaDeLinea: Record<number, number> = {};
      const debitIds = [...new Set(conciliaciones.map((c: any) => c.debit_move_id?.[0]).filter(Boolean))];
      if (debitIds.length) {
        const lineasFactura = await fetchPaginated("account.move.line", [["id", "in", debitIds]], ["id", "move_id"], "id asc");
        lineasFactura.forEach((l: any) => { if (l.move_id?.[0]) facturaDeLinea[l.id] = l.move_id[0]; });
      }
      const facturaExcluida: Record<number, boolean> = {};
      const facturaIds = [...new Set(Object.values(facturaDeLinea))];
      if (facturaIds.length) {
        const facturas = await fetchPaginated("account.move", [["id", "in", facturaIds]], ["id", "invoice_user_id", "company_id"], "id asc");
        facturas.forEach((f: any) => {
          facturaExcluida[f.id] = esVendedorExcluido(f.invoice_user_id?.[1], f.company_id?.[0]);
        });
      }

      conciliaciones.forEach((c: any) => {
        const pid = pagoDeLinea[c.credit_move_id?.[0]];
        if (!pid) return;
        const monto = Number(c.amount) || 0;
        aplicado[pid] = (aplicado[pid] || 0) + monto;
        if (facturaExcluida[facturaDeLinea[c.debit_move_id?.[0]]]) {
          aplicadoExcluido[pid] = (aplicadoExcluido[pid] || 0) + monto;
        }
      });
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
      // El 25% de IVA que paga el cliente (retiene el 75%) no es cobro: somos
      // agentes de retención. Misma regla que lib/cxc/cobros.ts.
      const es25Iva = limpiarHtml(p.payment_description).includes("25%");
      const tipo: "cobro" | "ajuste" = esDiarioBanco(journalById[p.journal_id?.[0]]) && !es25Iva ? "cobro" : "ajuste";
      const vendedor = p.salesperson_id?.[1] || "";

      return {
        id: p.id,
        // Fecha de pago = fecha valor del asiento (puede estar retroactiva).
        fechaPago: p.date || null,
        // Fecha de confirmación = cuándo se registró el pago en Odoo.
        fechaConfirmacion: p.payment_registration_date || (p.create_date ? fechaCaracas(p.create_date) : null),
        numeroPago: p.name || "",
        referencia: p.ref || "",
        cliente: p.partner_id?.[1] || "",
        rif: partnerVat[p.partner_id?.[0]] || "",
        sede: COMPANY_NAMES[p.company_id?.[0]] || "",
        banco: p.journal_id?.[1] || "",
        vendedor,
        tipo,
        // Misma regla que el check de Contado/Crédito (lib/cxc/vendedoresExcluidos.ts).
        esAsistente: esVendedorExcluido(vendedor, p.company_id?.[0]),
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
        aplicadoFacturas: r2(aplicado[p.id] || 0),
        aplicadoExcluido: r2(aplicadoExcluido[p.id] || 0),
        sinAplicar: r2(Math.max(0, sinAplicar[p.id] || 0)),
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
          // Extremos independientes: null en uno = rango abierto de ese lado.
          confirmacion: cDesde || cHasta ? { desde: cDesde, hasta: cHasta } : null,
          pago: desdePago || hastaPago ? { desde: desdePago, hasta: hastaPago } : null,
        },
      },
    });
  } catch (error: any) {
    console.error("Error pagos-clientes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
