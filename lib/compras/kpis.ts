import { callOdooRPC } from "@/lib/odoo";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";

const comprasKpisCache = new Map<string, { data: ComprasKpisRaw; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export interface ComprasKpisRaw {
  semanaVarCosto: (number | null)[];
  semanaRotacion: (number | null)[];
  semanaQuiebre: (number | null)[];
  semanaInv90: (number | null)[];
}

function emptyResult(numSemanas: number): ComprasKpisRaw {
  return {
    semanaVarCosto: Array(numSemanas).fill(null),
    semanaRotacion: Array(numSemanas).fill(null),
    semanaQuiebre: Array(numSemanas).fill(null),
    semanaInv90: Array(numSemanas).fill(null),
  };
}

async function fetchPaginated(model: string, domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      model, "search_read", [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

export async function computeComprasKpis(
  companyId: number,
  semanas: { inicio: Date; fin: Date; diasUtiles: number }[],
): Promise<ComprasKpisRaw> {
  const numSemanas = semanas.length;
  const result = emptyResult(numSemanas);
  const cacheKey = `stoplight_compras_${companyId}`;
  const cached = comprasKpisCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

  try {
    const today = new Date();
    const msPerDay = 86400000;

    // ── 1. Almacén principal ──
    const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
    let locationIds: number[] = [];
    if (warehouseId) {
      const wd = await callOdooRPC<any[]>(
        "stock.warehouse", "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 0 },
      );
      locationIds = wd ? wd.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) : [];
    }

    // ── 2. Productos activos tipo storable ──
    const productsData = await callOdooRPC<any[]>(
      "product.product", "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"], limit: 0 },
    );
    if (!productsData) throw new Error("Sin productos en Odoo");

    // ── 3. Stock actual (disponible = quantity - reserved) ──
    const stockDomain: any[] = locationIds.length > 0
      ? [["location_id", "child_of", locationIds]]
      : [["location_id.usage", "=", "internal"], ["company_id", "=", companyId]];
    const stockData = await callOdooRPC<any[]>(
      "stock.quant", "search_read", [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
    );
    const stockMap: Record<number, number> = {};
    (stockData || []).forEach((s: any) => {
      const id = s.product_id?.[0];
      if (!id) return;
      stockMap[id] = (stockMap[id] ?? 0) + Math.max(0, Number(s.quantity) - Number(s.reserved_quantity));
    });
    Object.keys(stockMap).forEach((k) => { stockMap[+k] = Math.round(stockMap[+k] * 100) / 100; });

    // ── 4. standard_price (costo actual) ──
    const tmplIds = [...new Set(productsData.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];
    const tmplPriceMap: Record<number, number> = {};
    if (tmplIds.length > 0) {
      const prices = await callOdooRPC<any[]>(
        "product.template", "search_read",
        [[["id", "in", tmplIds]]],
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [companyId] } },
      );
      (prices || []).forEach((t: any) => {
        const val = Number(t.standard_price) || 0;
        if (val > 0) tmplPriceMap[t.id] = val;
      });
    }
    const priceMap: Record<number, number> = {};
    productsData.forEach((p: any) => {
      const tmplId = p.product_tmpl_id?.[0];
      priceMap[p.id] = tmplId ? (tmplPriceMap[tmplId] ?? 0) : 0;
    });

    // ── 5. Purchase order lines (últimos 3 meses) para KPIs de costo y rotación ──
    const purchase3mStart = new Date(today.getTime() - 90 * msPerDay).toISOString().split("T")[0];
    const purchaseDomain: any[] = [
      ["company_id", "=", companyId],
      ["state", "in", ["purchase", "done"]],
      ["product_id", "!=", false],
      ["date_order", ">=", purchase3mStart],
    ];
    const purchaseLines = await fetchPaginated("purchase.order.line", purchaseDomain, [
      "product_id", "price_unit", "date_order", "product_uom_qty", "currency_id",
      "order_id",
    ]);

    // ── 6. Ventas de los últimos 150 días ──
    const windowStart = new Date(today.getTime() - 150 * msPerDay).toISOString().split("T")[0];
    const salesDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.company_id", "=", companyId],
      ["move_id.invoice_date", ">=", windowStart],
      ["product_id", "!=", false],
    ];
    const salesLines = await fetchPaginated("account.move.line", salesDomain, [
      "product_id", "quantity", "date",
    ]);

    // Mapas de demanda por producto y semana
    const lastSaleByProduct: Record<number, Date> = {};
    const weekDemand: Record<number, boolean[]> = {};
    const totalDemandByProduct: Record<number, number> = {};
    (salesLines || []).forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId || !line.date) return;
      const d = new Date(line.date);
      if (!lastSaleByProduct[pId] || d > lastSaleByProduct[pId]) lastSaleByProduct[pId] = d;
      totalDemandByProduct[pId] = (totalDemandByProduct[pId] ?? 0) + Math.abs(line.quantity || 0);
      if (!weekDemand[pId]) weekDemand[pId] = Array(numSemanas).fill(false);
      for (let i = 0; i < semanas.length; i++) {
        if (d >= semanas[i].inicio && d <= semanas[i].fin) {
          weekDemand[pId][i] = true;
          break;
        }
      }
    });

    // ── 7. Recepciones (stock.move) para cohortes de rotación ──
    const receptionDomain: any[] = [
      ["company_id", "=", companyId],
      ["state", "=", "done"],
      ["location_dest_id.usage", "=", "internal"],
      ["product_id", "!=", false],
      ["date", ">=", windowStart],
    ];
    const receptions = await fetchPaginated("stock.move", receptionDomain, [
      "product_id", "product_uom_qty", "date",
    ]);

    // Receptiones por producto: [{ date, qty }]
    const receptionsByProduct: Record<number, { date: Date; qty: number }[]> = {};
    (receptions || []).forEach((move: any) => {
      const pId = move.product_id?.[0];
      if (!pId || !move.date) return;
      const qty = Number(move.product_uom_qty) || 0;
      if (qty <= 0) return;
      if (!receptionsByProduct[pId]) receptionsByProduct[pId] = [];
      receptionsByProduct[pId].push({ date: new Date(move.date), qty });
    });

    // ══════════════════════════════════════════════════════════════
    // KPI 1: Variación del costo de compra
    // Base = promedio ponderado de compras últimos 3 meses
    // Actual = standard_price
    // Variación = (base - actual) / base × 100
    // ══════════════════════════════════════════════════════════════
    const purchaseAvgByProduct: Record<number, { totalCost: number; totalQty: number }> = {};
    (purchaseLines || []).forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId) return;
      const price = Number(line.price_unit) || 0;
      const qty = Number(line.product_uom_qty) || 0;
      if (price <= 0 || qty <= 0) return;
      if (!purchaseAvgByProduct[pId]) purchaseAvgByProduct[pId] = { totalCost: 0, totalQty: 0 };
      purchaseAvgByProduct[pId].totalCost += price * qty;
      purchaseAvgByProduct[pId].totalQty += qty;
    });

    let varAcc = 0;
    let varCount = 0;
    Object.keys(purchaseAvgByProduct).forEach((k) => {
      const pId = +k;
      const avg = purchaseAvgByProduct[pId].totalCost / purchaseAvgByProduct[pId].totalQty;
      const current = priceMap[pId] ?? 0;
      if (avg > 0 && current > 0) {
        varAcc += ((avg - current) / avg) * 100;
        varCount++;
      }
    });
    const varCosto = varCount > 0 ? Math.round((varAcc / varCount) * 100) : null;

    // ══════════════════════════════════════════════════════════════
    // KPI 2: Rotación saludable de compras
    // Cohortes por recepción: sell-through a 90 días (default)
    // % = unidades vendidas de cohorte / unidades recibidas × 100
    // ══════════════════════════════════════════════════════════════
    const TARGET_ROTATION_DAYS = 90;

    const rotacion: (number | null)[] = semanas.map((semana) => {
      const weekEnd = new Date(semana.fin);
      const cutoff = new Date(weekEnd.getTime() - TARGET_ROTATION_DAYS * msPerDay);

      let totalReceived = 0;
      let totalSold = 0;

      Object.keys(receptionsByProduct).forEach((k) => {
        const pId = +k;
        const recs = receptionsByProduct[pId];
        const soldTotal = totalDemandByProduct[pId] ?? 0;

        // Solo cohortes recibidas antes del cutoff (tienen ≥90 días para vender)
        let receivedInCohort = 0;
        recs.forEach((r) => {
          if (r.date <= cutoff) receivedInCohort += r.qty;
        });

        if (receivedInCohort <= 0) return;

        // De esas unidades, cuántas se vendieron después de la recepción
        // Usamos la proporción de ventas históricas vs. stock como aproximación
        const currentStock = stockMap[pId] ?? 0;
        const soldFromCohort = Math.max(0, receivedInCohort - currentStock);

        totalReceived += receivedInCohort;
        totalSold += Math.min(soldFromCohort, soldTotal);
      });

      return totalReceived > 0
        ? Math.round((totalSold / totalReceived) * 100)
        : null;
    });

    // ══════════════════════════════════════════════════════════════
    // KPI 3: Porcentaje de quiebre de inventario
    // SKU-días sin inventario / SKU-días elegibles × 100
    // Elegibles: activos, con demanda, reabastecibles (storable)
    // ══════════════════════════════════════════════════════════════
    const eligibleProducts: number[] = [];
    productsData.forEach((p: any) => {
      const pId = p.id;
      const hasDemand = (totalDemandByProduct[pId] ?? 0) > 0;
      if (hasDemand) eligibleProducts.push(pId);
    });

    const quiebre: (number | null)[] = semanas.map((semana) => {
      const semanaDias = Math.max(1, Math.round((semana.fin.getTime() - semana.inicio.getTime()) / msPerDay));
      let skuDiasTotal = eligibleProducts.length * semanaDias;
      let skuDiasSinStock = 0;

      eligibleProducts.forEach((pId) => {
        const stock = stockMap[pId] ?? 0;
        const hasDemand = weekDemand[pId]?.some(Boolean) ?? false;
        // Si tiene demanda y no tiene stock → quiebre
        if (hasDemand && stock <= 0) {
          // Estimar días sin stock proporcionalmente a la demanda de la semana
          const daysInWeek = semanaDias;
          skuDiasSinStock += daysInWeek;
        }
      });

      return skuDiasTotal > 0
        ? Math.round((skuDiasSinStock / skuDiasTotal) * 100)
        : null;
    });

    // ══════════════════════════════════════════════════════════════
    // KPI 4: Inventario con más de 90 días
    // Valor del inventario >90 días / Valor total × 100
    // Usamos última recepción como proxy de antigüedad
    // ══════════════════════════════════════════════════════════════
    const lastReceptionByProduct: Record<number, Date> = {};
    (receptions || []).forEach((move: any) => {
      const pId = move.product_id?.[0];
      if (!pId || !move.date) return;
      const d = new Date(move.date);
      if (!lastReceptionByProduct[pId] || d > lastReceptionByProduct[pId]) {
        lastReceptionByProduct[pId] = d;
      }
    });

    let totalInventoryValue = 0;
    const inv90: (number | null)[] = semanas.map((semana) => {
      const weekEnd = new Date(semana.fin);
      const cutoff90 = new Date(weekEnd.getTime() - 90 * msPerDay);
      let staleValue = 0;
      let totalValue = 0;

      productsData.forEach((p: any) => {
        const pId = p.id;
        const qty = stockMap[pId] ?? 0;
        if (qty <= 0) return;
        const cost = priceMap[pId] ?? 0;
        const val = qty * cost;
        totalValue += val;
        const lastRec = lastReceptionByProduct[pId];
        if (!lastRec || lastRec < cutoff90) staleValue += val;
      });

      totalInventoryValue = totalValue;
      return totalValue > 0
        ? Math.round((staleValue / totalValue) * 100)
        : null;
    });

    result.semanaVarCosto = Array(numSemanas).fill(varCosto);
    result.semanaRotacion = rotacion;
    result.semanaQuiebre = quiebre;
    result.semanaInv90 = inv90;

    comprasKpisCache.set(cacheKey, { data: result, ts: Date.now() });
  } catch (e: any) {
    console.error("Error calculando KPIs de Compras:", e?.message);
  }
  return result;
}
