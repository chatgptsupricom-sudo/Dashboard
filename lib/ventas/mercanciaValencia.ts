import { callOdooRPCEstricto } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";
import { armarLinea, type LineaMercancia } from "@/lib/ventas/mercanciaValenciaTipos";

/**
 * Mercancía que Caracas le compra a Valencia: los pedidos de venta de Valencia
 * (company 9) a SUPRICOM CCS (las dos fichas: «SUPRICOM CCS 21, C.A.» y la de
 * ASTA). Valencia factura el pedido entero el mismo día pero lo despacha por
 * partes, así que lo que sigue en Valencia es qty_invoiced − qty_delivered de
 * cada línea (nov-2026: S-05610 facturado 438, despachado 42). Solo productos
 * almacenables: los fletes (servicios) no se despachan. qty_invoiced ya viene
 * neto de NC.
 */

const VALENCIA = 9;
const CTX = { context: { allowed_company_ids: [VALENCIA] } };

const lista = <T>(r: T[] | null): T[] => (Array.isArray(r) ? r : []);
const dia = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 10) : null);

export async function lineasCaracas(): Promise<LineaMercancia[]> {
  const lineas = lista(
    await callOdooRPCEstricto<any[]>("sale.order.line", "search_read", [[
      ["order_id.company_id", "=", VALENCIA],
      ["order_id.state", "=", "sale"],
      ["order_id.partner_id.commercial_partner_id.name", "ilike", "supricom ccs"],
      ["order_id.date_order", ">=", CORTE_ODOO],
      ["display_type", "=", false],
      ["product_id.type", "=", "product"],
      ["qty_invoiced", ">", 0],
    ]], {
      fields: ["order_id", "product_id", "product_uom_qty", "qty_delivered", "qty_invoiced", "price_subtotal", "invoice_lines"],
      limit: 0,
      ...CTX,
    }),
  );
  if (!lineas.length) return [];

  const pedidoIds = [...new Set(lineas.map((l) => l.order_id[0] as number))];
  const productoIds = [...new Set(lineas.map((l) => l.product_id[0] as number))];
  const apunteIds = [...new Set(lineas.flatMap((l) => l.invoice_lines as number[]))];

  const [productos, apuntes, despachos] = await Promise.all([
    callOdooRPCEstricto<any[]>("product.product", "read", [productoIds, ["default_code", "name", "spiff_brand_id"]], { context: { active_test: false } }),
    apunteIds.length
      ? callOdooRPCEstricto<any[]>("account.move.line", "read", [apunteIds, ["move_id"]], CTX)
      : Promise.resolve([] as any[]),
    callOdooRPCEstricto<any[]>("stock.picking", "search_read", [[
      ["sale_id", "in", pedidoIds],
      ["picking_type_code", "=", "outgoing"],
      ["state", "not in", ["done", "cancel"]],
    ]], { fields: ["name", "sale_id", "scheduled_date"], order: "scheduled_date asc", limit: 0, ...CTX }),
  ]);

  const moveIds = [...new Set(lista(apuntes).map((a) => a.move_id[0] as number))];
  const facturas = moveIds.length
    ? lista(await callOdooRPCEstricto<any[]>("account.move", "read", [moveIds, ["name", "invoice_date", "move_type", "state"]], CTX))
    : [];

  const prod = new Map(lista(productos).map((p) => [p.id, p]));
  const facturaDe = new Map(
    facturas.filter((f) => f.move_type === "out_invoice" && f.state === "posted").map((f) => [f.id, f]),
  );
  const moveDeApunte = new Map(lista(apuntes).map((a) => [a.id, a.move_id[0] as number]));
  const abierto = new Map<number, any>();
  for (const d of lista(despachos)) if (d.sale_id && !abierto.has(d.sale_id[0])) abierto.set(d.sale_id[0], d);

  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  return lineas.map((l) => {
    const p = prod.get(l.product_id[0]);
    const facs = [...new Set((l.invoice_lines as number[]).map((id) => moveDeApunte.get(id)))]
      .map((id) => (id ? facturaDe.get(id) : null))
      .filter(Boolean)
      .sort((a: any, b: any) => String(a.invoice_date).localeCompare(String(b.invoice_date)));
    const desp = abierto.get(l.order_id[0]);
    return armarLinea(
      {
        lineaId: l.id,
        pedido: l.order_id[1],
        pedidoId: l.order_id[0],
        facturas: facs.map((f: any) => f.name),
        fechaFactura: dia(facs[0]?.invoice_date),
        productoId: l.product_id[0],
        codigo: p?.default_code || "",
        producto: p?.name || l.product_id[1],
        marca: p?.spiff_brand_id ? p.spiff_brand_id[1] : "",
        facturado: Number(l.qty_invoiced) || 0,
        despachado: Number(l.qty_delivered) || 0,
        precio: l.product_uom_qty ? (Number(l.price_subtotal) || 0) / Number(l.product_uom_qty) : 0,
        despachoAbierto: desp?.name || null,
        fechaPrevista: dia(desp?.scheduled_date),
      },
      hoy,
    );
  });
}
