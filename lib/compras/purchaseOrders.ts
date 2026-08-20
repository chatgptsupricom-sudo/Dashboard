import { callOdooRPC } from "@/lib/odoo";

/**
 * Cantidad ya ordenada y aun no recibida (compromiso de compra vigente),
 * agrupada por producto. Solo cuentan ordenes CONFIRMADAS (state = "purchase");
 * borradores y canceladas no representan un compromiso real de reposicion.
 */
export async function getPendingPurchaseQtyByProduct(
  companies: number[],
): Promise<Record<number, number>> {
  const domain: any[] = [
    ["state", "=", "purchase"],
    ["product_id", "!=", false],
  ];
  if (companies.length > 0) domain.push(["company_id", "in", companies]);

  const lines = await callOdooRPC<any[]>(
    "purchase.order.line",
    "search_read",
    [domain],
    { fields: ["product_id", "product_qty", "qty_received"], limit: 0 },
  );

  const pendingByProduct: Record<number, number> = {};
  (lines || []).forEach((line: any) => {
    const productId = line.product_id?.[0];
    if (!productId) return;
    const pending =
      Number(line.product_qty || 0) - Number(line.qty_received || 0);
    if (pending > 0) {
      pendingByProduct[productId] = (pendingByProduct[productId] || 0) + pending;
    }
  });
  return pendingByProduct;
}
