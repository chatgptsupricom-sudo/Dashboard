import { callOdooRPC } from "@/lib/odoo";

/**
 * Líneas de venta con su costo, para el KPI "Margen bruto" del Stoplight.
 *
 * Lo usan la grilla (`/api/superadmin/stoplight`) y el modal de detalle
 * (`/margen-detail`): antes cada ruta tenía su copia y el modal no cuadraba
 * con la fila.
 *
 * - Facturas y notas de crédito publicadas del rango, con vendedor asignado.
 *   Las notas de crédito restan ingreso y costo.
 * - Costo = cantidad × `standard_price` (costo actual del producto, no el del
 *   momento de la venta).
 * - `standard_price` es un campo por empresa en Odoo. Sin
 *   `allowed_company_ids` se leía con la empresa por defecto del usuario de la
 *   API (Valencia), así que Caracas y Panamá se calculaban con costos de
 *   Valencia (ago-2026: Panamá daba 42% de margen cuando el real era 10%).
 * - Se incluyen productos archivados (`active_test: false`): si no, su costo
 *   quedaba en 0 y el margen salía inflado.
 */
export interface LineaMargen {
  vendedor: string;
  productId: number;
  producto: string;
  cantidad: number;
  ingreso: number;
  costo: number;
  /** Fecha de factura a medianoche local (comparable con `obtenerSemanasDelMes`). */
  fecha: Date;
}

/** "YYYY-MM-DD" a medianoche local. `new Date("YYYY-MM-DD")` es UTC y, con el
 *  servidor en otra zona, corría las facturas del lunes a la semana anterior. */
export function fechaLocal(iso: string): Date {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export async function obtenerLineasMargen(
  companyId: number,
  fechaInicio: string,
  fechaFin: string,
): Promise<LineaMargen[]> {
  const context = { allowed_company_ids: [companyId], active_test: false };

  const facturas = (await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
      ["invoice_date", ">=", fechaInicio],
      ["invoice_date", "<=", fechaFin],
      ["invoice_user_id", "!=", false],
    ]],
    { fields: ["id", "invoice_user_id", "invoice_date", "move_type"], limit: 10000 },
  )) || [];
  if (facturas.length === 0) return [];

  const facturaPorId = new Map<number, any>(facturas.map((f: any) => [f.id, f]));

  const lineas = (await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [[
      ["move_id", "in", facturas.map((f: any) => f.id)],
      ["display_type", "=", "product"],
      ["product_id", "!=", false],
    ]],
    { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 50000 },
  )) || [];

  const productIds = [...new Set(lineas.map((l: any) => l.product_id?.[0]).filter(Boolean))];
  const costoPorProducto = new Map<number, number>();
  const nombrePorProducto = new Map<number, string>();
  if (productIds.length > 0) {
    const productos = (await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "in", productIds]]],
      { fields: ["id", "name", "standard_price"], limit: 0, context },
    )) || [];
    productos.forEach((p: any) => {
      costoPorProducto.set(p.id, Number(p.standard_price) || 0);
      nombrePorProducto.set(p.id, p.name || "");
    });
  }

  const resultado: LineaMargen[] = [];
  for (const l of lineas) {
    const factura = facturaPorId.get(l.move_id?.[0]);
    if (!factura) continue;
    const productId = l.product_id?.[0];
    const signo = factura.move_type === "out_refund" ? -1 : 1;
    const cantidad = Number(l.quantity) || 0;
    resultado.push({
      vendedor: factura.invoice_user_id?.[1] || "",
      productId,
      producto: nombrePorProducto.get(productId) || l.product_id?.[1] || "",
      cantidad: signo * cantidad,
      ingreso: signo * (Number(l.price_subtotal) || 0),
      costo: signo * cantidad * (costoPorProducto.get(productId) || 0),
      fecha: fechaLocal(factura.invoice_date),
    });
  }
  return resultado;
}

/** Margen bruto % = (ingreso − costo) / ingreso. `null` si no hay ingreso. */
export function margenPct(ingreso: number, costo: number): number | null {
  return ingreso > 0 ? ((ingreso - costo) / ingreso) * 100 : null;
}
