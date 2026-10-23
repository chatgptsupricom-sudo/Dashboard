import { callOdooRPCEstricto } from "@/lib/odoo";
import { CORTE_ODOO } from "@/lib/smartbit";

/**
 * Detalle de un cliente para la ficha del Mapa de Clientes (Gerente de
 * Operaciones): plazo de pago de Odoo, ultima compra, facturas y productos,
 * siempre de una sola sede.
 *
 * Solo Odoo: antes de CORTE_ODOO Odoo tiene solo las facturas abiertas que se
 * migraron, no la venta real (esa esta en Smartbit).
 *
 * Montos en USD con los campos *_signed / balance (Caracas tiene facturas en
 * bolivares). Las cantidades de productos van con display_type = 'product':
 * sin eso las lineas COGS triplican las unidades.
 */

const MAX_FACTURAS = 100;
const MAX_PRODUCTOS = 50;

export interface FacturaCliente {
  id: number;
  numero: string;
  fecha: string;
  vence: string | null;
  esNotaCredito: boolean;
  total: number;
  pendiente: number;
  estadoPago: string;
  vendedor: string;
}

export interface ProductoCliente {
  producto: string;
  cantidad: number;
  monto: number;
}

export interface DetalleCliente {
  id: number;
  nombre: string;
  plazo: string | null;
  limiteCredito: number;
  ultimaCompra: { fecha: string; numero: string; monto: number } | null;
  facturas: FacturaCliente[];
  totalFacturas: number;
  facturado: number;
  pendiente: number;
  productos: ProductoCliente[];
  desde: string | null;
  hasta: string | null;
  corteOdoo: string;
}

const nombre = (v: any, porDefecto = "") => (Array.isArray(v) ? String(v[1] ?? "") : porDefecto);
const redondear = (n: number) => Math.round(n * 100) / 100;

/** null = el cliente no existe o no es de esa sede. */
export async function detalleCliente(
  partnerId: number,
  companyId: number,
  desde: string | null,
  hasta: string | null,
): Promise<DetalleCliente | null> {
  // property_payment_term_id depende de la empresa: sin allowed_company_ids
  // Odoo devuelve el de la sede activa del usuario de la API.
  const ctx = { context: { allowed_company_ids: [companyId] } };

  const [partner] =
    (await callOdooRPCEstricto<any[]>("res.partner", "search_read", [[["id", "=", partnerId]]], {
      fields: ["name", "company_id", "property_payment_term_id", "credit_limit"],
      limit: 1,
      ...ctx,
    })) || [];
  if (!partner) return null;
  const empresa = Array.isArray(partner.company_id) ? Number(partner.company_id[0]) : null;
  if (empresa && empresa !== companyId) return null;

  const base: any[] = [
    ["commercial_partner_id", "=", partnerId],
    ["company_id", "=", companyId],
    ["state", "=", "posted"],
  ];
  const rango: any[] = desde && hasta ? [["invoice_date", ">=", desde], ["invoice_date", "<=", hasta]] : [];
  const dominioFacturas = [...base, ["move_type", "in", ["out_invoice", "out_refund"]], ...rango];

  const [ultima, facturas, totalFacturas, totales, lineas] = await Promise.all([
    callOdooRPCEstricto<any[]>(
      "account.move",
      "search_read",
      [[...base, ["move_type", "=", "out_invoice"]]],
      { fields: ["name", "invoice_date", "amount_total_signed"], order: "invoice_date desc, id desc", limit: 1, ...ctx },
    ),
    callOdooRPCEstricto<any[]>("account.move", "search_read", [dominioFacturas], {
      fields: [
        "name",
        "invoice_date",
        "invoice_date_due",
        "move_type",
        "amount_total_signed",
        "amount_residual_signed",
        "payment_state",
        "invoice_user_id",
      ],
      order: "invoice_date desc, id desc",
      limit: MAX_FACTURAS,
      ...ctx,
    }),
    callOdooRPCEstricto<number>("account.move", "search_count", [dominioFacturas], ctx),
    callOdooRPCEstricto<any[]>(
      "account.move",
      "read_group",
      [dominioFacturas, ["amount_total_signed:sum", "amount_residual_signed:sum"], []],
      { lazy: false, ...ctx },
    ),
    callOdooRPCEstricto<any[]>(
      "account.move.line",
      "read_group",
      [
        [
          ["move_id.commercial_partner_id", "=", partnerId],
          ["company_id", "=", companyId],
          ["parent_state", "=", "posted"],
          ["display_type", "=", "product"],
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ...(desde && hasta
            ? [["move_id.invoice_date", ">=", desde], ["move_id.invoice_date", "<=", hasta]]
            : []),
        ],
        ["quantity:sum", "balance:sum"],
        ["product_id", "move_type"],
      ],
      { lazy: false, ...ctx },
    ),
  ]);

  // Una NC resta unidades y monto. balance: negativo en ventas, positivo en NC.
  const porProducto = new Map<string, ProductoCliente>();
  (lineas || []).forEach((g: any) => {
    const producto = nombre(g.product_id, "Sin producto");
    // "[SAL_INI] Saldo Inicial": facturas abiertas migradas al corte, no es venta.
    if (producto.startsWith("[SAL_INI]")) return;
    const p = porProducto.get(producto) || { producto, cantidad: 0, monto: 0 };
    const signo = g.move_type === "out_refund" ? -1 : 1;
    p.cantidad += signo * (Number(g.quantity) || 0);
    p.monto += -(Number(g.balance) || 0);
    porProducto.set(producto, p);
  });

  const u = (ultima || [])[0];
  const t = (totales || [])[0] || {};
  return {
    id: partner.id,
    nombre: partner.name || "",
    plazo: nombre(partner.property_payment_term_id) || null,
    limiteCredito: Number(partner.credit_limit) || 0,
    ultimaCompra: u
      ? { fecha: u.invoice_date || "", numero: u.name || "", monto: redondear(Number(u.amount_total_signed) || 0) }
      : null,
    facturas: (facturas || []).map((f: any) => ({
      id: f.id,
      numero: f.name || "",
      fecha: f.invoice_date || "",
      vence: f.invoice_date_due || null,
      esNotaCredito: f.move_type === "out_refund",
      total: redondear(Number(f.amount_total_signed) || 0),
      pendiente: redondear(Number(f.amount_residual_signed) || 0),
      estadoPago: f.payment_state || "",
      vendedor: nombre(f.invoice_user_id),
    })),
    totalFacturas: totalFacturas || 0,
    facturado: redondear(Number(t.amount_total_signed) || 0),
    pendiente: redondear(Number(t.amount_residual_signed) || 0),
    productos: Array.from(porProducto.values())
      .map((p) => ({ ...p, cantidad: redondear(p.cantidad), monto: redondear(p.monto) }))
      .filter((p) => p.cantidad !== 0 || p.monto !== 0)
      .sort((a, b) => b.monto - a.monto)
      .slice(0, MAX_PRODUCTOS),
    desde,
    hasta,
    corteOdoo: CORTE_ODOO,
  };
}
