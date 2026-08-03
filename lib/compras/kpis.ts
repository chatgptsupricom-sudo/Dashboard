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
      model,
      "search_read",
      [domain],
      { fields, order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    result = result.concat(page);
    if (page.length < 5000) break;
    offset += 5000;
  }
  return result;
}

/**
 * Calcula los KPIs del Departamento de Compras (variación de costo,
 * rotación saludable, quiebre de inventario e inventario +90 días)
 * a partir de datos reales de Odoo (stock, costos, ventas) y MySQL (moqs).
 * El resultado se cachea 10 minutos.
 */
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
    // 1. Almacén principal de la empresa → ubicación lot_stock_id
    const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
    let locationIds: number[] = [];
    if (warehouseId) {
      const warehouseData = await callOdooRPC<any[]>(
        "stock.warehouse",
        "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 0 },
      );
      locationIds = warehouseData
        ? warehouseData.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean)
        : [];
    }

    // 2. Productos activos tipo storable
    const productsData = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["active", "=", true],
          ["type", "=", "product"],
        ],
      ],
      { fields: ["id", "default_code", "product_tmpl_id"], limit: 0 },
    );
    if (!productsData) throw new Error("Sin productos en Odoo");

    // 3. Stock actual del almacén principal (y sub-ubicaciones)
    const stockDomain: any[] =
      locationIds.length > 0
        ? [["location_id", "child_of", locationIds]]
        : [
            ["location_id.usage", "=", "internal"],
            ["company_id", "=", companyId],
          ];
    const stockData = await callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
    );
    const stockMap: Record<number, number> = {};
    (stockData || []).forEach((s: any) => {
      const id = s.product_id?.[0];
      if (!id) return;
      stockMap[id] =
        (stockMap[id] ?? 0) +
        Math.max(0, Number(s.quantity) - Number(s.reserved_quantity));
    });
    Object.keys(stockMap).forEach((k) => {
      stockMap[+k] = Math.round(stockMap[+k] * 100) / 100;
    });

    // 4. Costo actual (standard_price) con contexto de empresa
    const tmplIds = [
      ...new Set(
        productsData.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean),
      ),
    ];
    const tmplPriceMap: Record<number, number> = {};
    if (tmplIds.length > 0) {
      const prices = await callOdooRPC<any[]>(
        "product.template",
        "search_read",
        [[["id", "in", tmplIds]]],
        {
          fields: ["id", "standard_price"],
          limit: 0,
          context: { allowed_company_ids: [companyId] },
        },
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

    // 5. Costo base: último precio de compra desde Odoo (purchase.order.line)
    const purchaseDomain: any[] = [
      ["company_id", "=", companyId],
      ["state", "in", ["purchase", "done"]],
      ["product_id", "!=", false],
    ];
    const purchaseLines = await fetchPaginated("purchase.order.line", purchaseDomain, [
      "product_id",
      "price_unit",
      "create_date",
    ]);
    const lastPurchaseByProduct: Record<number, { price: number; date: Date }> = {};
    (purchaseLines || []).forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId) return;
      const price = Number(line.price_unit) || 0;
      if (price <= 0) return;
      const d = new Date(line.create_date);
      if (!lastPurchaseByProduct[pId] || d > lastPurchaseByProduct[pId].date) {
        lastPurchaseByProduct[pId] = { price, date: d };
      }
    });
    const baseCostMap: Record<number, number> = {};
    Object.keys(lastPurchaseByProduct).forEach((k) => {
      const pId = +k;
      if (lastPurchaseByProduct[pId].price > 0) {
        baseCostMap[pId] = lastPurchaseByProduct[pId].price;
      }
    });

    // 6. Ventas (facturas) de los últimos 150 días para detectar demanda,
    //    rotación e inactividad (>90 días)
    const today = new Date();
    const windowStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - 150,
    );
    const windowStartStr = windowStart.toISOString().split("T")[0];
    const salesDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.company_id", "=", companyId],
      ["move_id.invoice_date", ">=", windowStartStr],
      ["product_id", "!=", false],
    ];
    const lines = await fetchPaginated("account.move.line", salesDomain, [
      "product_id",
      "quantity",
      "date",
    ]);

    const lastSaleByProduct: Record<number, Date> = {};
    const weekDemand: Record<number, boolean[]> = {};
    lines.forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId || !line.date) return;
      const d = new Date(line.date);
      if (!lastSaleByProduct[pId] || d > lastSaleByProduct[pId])
        lastSaleByProduct[pId] = d;
      if (!weekDemand[pId]) weekDemand[pId] = Array(numSemanas).fill(false);
      for (let i = 0; i < semanas.length; i++) {
        if (d >= semanas[i].inicio && d <= semanas[i].fin) {
          weekDemand[pId][i] = true;
          break;
        }
      }
    });

    // 7. Valor total del inventario y productos con stock
    let totalInventoryValue = 0;
    const stockProducts: number[] = [];
    Object.keys(stockMap).forEach((k) => {
      const pId = +k;
      const qty = stockMap[pId];
      if (qty > 0) {
        stockProducts.push(pId);
        totalInventoryValue += qty * (priceMap[pId] ?? 0);
      }
    });

    const msPerDay = 86400000;
    const quiebre: (number | null)[] = Array(numSemanas).fill(null);
    const rotacion: (number | null)[] = Array(numSemanas).fill(null);
    const inv90: (number | null)[] = Array(numSemanas).fill(null);

    semanas.forEach((semana, i) => {
      const weekEnd = new Date(semana.fin);

      // Quiebre: productos con demanda esa semana y stock <= 0
      const withDemand: number[] = [];
      Object.keys(weekDemand).forEach((k) => {
        if (weekDemand[+k][i]) withDemand.push(+k);
      });
      const sinStock = withDemand.filter(
        (pId) => (stockMap[pId] ?? 0) <= 0,
      ).length;
      quiebre[i] =
        withDemand.length > 0
          ? Math.round((sinStock / withDemand.length) * 100)
          : null;

      // Rotación saludable: % de productos con stock que vendieron
      // dentro de los últimos 45 días previos al cierre de la semana
      const cutoff45 = new Date(weekEnd.getTime() - 45 * msPerDay);
      let sold = 0;
      stockProducts.forEach((pId) => {
        const last = lastSaleByProduct[pId];
        if (last && last >= cutoff45) sold++;
      });
      rotacion[i] =
        stockProducts.length > 0
          ? Math.round((sold / stockProducts.length) * 100)
          : null;

      // Inventario +90 días: % del valor total cuyo último movimiento
      // de venta fue hace más de 90 días (o nunca)
      const cutoff90 = new Date(weekEnd.getTime() - 90 * msPerDay);
      let staleVal = 0;
      stockProducts.forEach((pId) => {
        const last = lastSaleByProduct[pId];
        if (!last || last < cutoff90)
          staleVal += (stockMap[pId] ?? 0) * (priceMap[pId] ?? 0);
      });
      inv90[i] =
        totalInventoryValue > 0
          ? Math.round((staleVal / totalInventoryValue) * 100)
          : null;
    });

    // Variación del costo de compra: ahorro (+)/sobrecosto (-) promedio
    // frente al costo base comparable (moqs). Snapshot del estado actual.
    let varAcc = 0;
    let varCount = 0;
    Object.keys(baseCostMap).forEach((k) => {
      const base = baseCostMap[+k];
      const current = priceMap[+k] ?? 0;
      if (base > 0 && current > 0) {
        varAcc += ((base - current) / base) * 100;
        varCount++;
      }
    });
    const varCosto =
      varCount > 0 ? Math.round((varAcc / varCount) * 100) : null;

    result.semanaQuiebre = quiebre;
    result.semanaRotacion = rotacion;
    result.semanaInv90 = inv90;
    result.semanaVarCosto = Array(numSemanas).fill(varCosto);

    comprasKpisCache.set(cacheKey, { data: result, ts: Date.now() });
  } catch (e: any) {
    console.error("Error calculando KPIs de Compras:", e?.message);
  }
  return result;
}
