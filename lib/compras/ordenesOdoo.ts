// Órdenes de compra tal como están en Odoo (purchase.order): solicitudes de
// cotización y órdenes confirmadas, se hayan creado en el panel o no. Solo
// lectura; las del panel con su aprobación siguen en app/api/compras/ordenes.

import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import type { EstadoOdoo, LineaOdoo, OrdenOdoo } from "@/lib/compras/ordenesOdoo-types";

const SEDES = [9, 10, 7];

// Tope de seguridad: si algún día hay más, se ven las más recientes.
const MAX_ORDENES = 3000;

const m2oId = (v: any): number => (Array.isArray(v) ? Number(v[0]) : Number(v) || 0);
const m2oNombre = (v: any): string | null => (Array.isArray(v) ? String(v[1]) : null);
const texto = (v: any): string | null => (v ? String(v) : null);

/** Ids de Odoo -> id de la orden del panel. Sin la tabla, mapa vacío. */
async function ordenesDelPanel(): Promise<Map<number, number>> {
  try {
    const r = await query(
      "SELECT id, odoo_purchase_order_id FROM purchase_orders WHERE odoo_purchase_order_id IS NOT NULL",
    );
    return new Map((r.rows as any[]).map((x) => [Number(x.odoo_purchase_order_id), Number(x.id)]));
  } catch {
    return new Map();
  }
}

export async function listarOrdenesOdoo(): Promise<OrdenOdoo[]> {
  const [pos, panel] = await Promise.all([
    callOdooRPC<any[]>("purchase.order", "search_read", [[["company_id", "in", SEDES]]], {
      fields: [
        "name", "state", "company_id", "partner_id", "partner_ref", "origin", "currency_id",
        "amount_total", "date_order", "date_approve", "date_planned", "user_id",
        "receipt_status", "invoice_status", "order_line",
      ],
      order: "date_order desc, id desc",
      limit: MAX_ORDENES,
    }),
    ordenesDelPanel(),
  ]);
  if (!pos) throw new Error("Odoo no devolvió las órdenes de compra");

  return pos.map((p) => ({
    id: p.id,
    name: String(p.name),
    state: p.state as EstadoOdoo,
    company_id: m2oId(p.company_id),
    supplier_name: m2oNombre(p.partner_id) ?? "—",
    partner_ref: texto(p.partner_ref),
    origin: texto(p.origin),
    currency: m2oNombre(p.currency_id) ?? "USD",
    amount_total: Number(p.amount_total) || 0,
    date_order: texto(p.date_order),
    date_approve: texto(p.date_approve),
    date_planned: texto(p.date_planned),
    buyer: m2oNombre(p.user_id),
    receipt_status: texto(p.receipt_status),
    invoice_status: texto(p.invoice_status),
    lines_count: Array.isArray(p.order_line) ? p.order_line.length : 0,
    panel_order_id: panel.get(p.id) ?? null,
  }));
}

export async function lineasOrdenOdoo(orderId: number): Promise<LineaOdoo[]> {
  const lineas = await callOdooRPC<any[]>(
    "purchase.order.line",
    "search_read",
    [[["order_id", "=", orderId], ["display_type", "=", false], ["company_id", "in", SEDES]]],
    {
      fields: [
        "product_id", "name", "product_qty", "qty_received", "qty_invoiced",
        "price_unit", "price_subtotal",
      ],
      order: "sequence, id",
      limit: 1000,
    },
  );
  if (!lineas) throw new Error("Odoo no devolvió las líneas de la orden");

  const productoIds = [...new Set(lineas.map((l) => m2oId(l.product_id)).filter((id) => id > 0))];
  const codigos = new Map<number, string>();
  if (productoIds.length > 0) {
    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "in", productoIds]]],
      { fields: ["default_code"], context: { active_test: false } },
    );
    for (const p of productos || []) if (p.default_code) codigos.set(p.id, String(p.default_code));
  }

  return lineas.map((l) => ({
    id: l.id,
    product_code: codigos.get(m2oId(l.product_id)) ?? null,
    // Odoo antepone "[CODIGO] " al nombre; el código ya va en su columna.
    description: String(l.name || m2oNombre(l.product_id) || "").replace(/^\[[^\]]*\]\s*/, "").trim(),
    quantity: Number(l.product_qty) || 0,
    qty_received: Number(l.qty_received) || 0,
    qty_invoiced: Number(l.qty_invoiced) || 0,
    unit_price: Number(l.price_unit) || 0,
    subtotal: Number(l.price_subtotal) || 0,
  }));
}
