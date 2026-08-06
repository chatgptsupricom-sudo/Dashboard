import { callOdooRPC } from "@/lib/odoo";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const detailCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

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

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin" && userRole !== "gerencia de ventas" && userRole !== "compras") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const kpiParam = url.searchParams.get("kpi");

    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const cacheKey = `compras_detail_${companyId}_${mes}_${kpiParam}`;
    const cached = detailCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    // ── Shared data fetches ──
    const msPerDay = 86400000;

    // 1. Almacén principal
    const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
    let locationIds: number[] = [];
    if (warehouseId) {
      const wd = await callOdooRPC<any[]>(
        "stock.warehouse", "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 0 },
      );
      locationIds = wd?.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) ?? [];
    }

    // 2. Productos activos storable
    const productsData = await callOdooRPC<any[]>(
      "product.product", "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"], limit: 0 },
    );
    if (!productsData) throw new Error("Sin productos");

    // 3. Stock actual
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

    // 4. standard_price
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
      priceMap[p.id] = p.product_tmpl_id?.[0] ? (tmplPriceMap[p.product_tmpl_id[0]] ?? 0) : 0;
    });

    // 5. Purchase order lines últimos 3 meses (para variación de costo)
    const purchase3mStart = new Date(now.getTime() - 90 * msPerDay).toISOString().split("T")[0];
    const purchaseLines = await fetchPaginated(
      "purchase.order.line",
      [
        ["company_id", "=", companyId],
        ["state", "in", ["purchase", "done"]],
        ["product_id", "!=", false],
        ["date_order", ">=", purchase3mStart],
      ],
      ["product_id", "price_unit", "date_order", "product_uom_qty"],
    );
    // Promedio ponderado de compras últimos 3 meses por producto
    const purchaseAvgByProduct: Record<number, { totalCost: number; totalQty: number; lastDate: Date; lastPrice: number }> = {};
    (purchaseLines || []).forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId) return;
      const price = Number(line.price_unit) || 0;
      const qty = Number(line.product_uom_qty) || 0;
      if (price <= 0 || qty <= 0) return;
      const d = new Date(line.date_order);
      if (!purchaseAvgByProduct[pId]) purchaseAvgByProduct[pId] = { totalCost: 0, totalQty: 0, lastDate: d, lastPrice: price };
      purchaseAvgByProduct[pId].totalCost += price * qty;
      purchaseAvgByProduct[pId].totalQty += qty;
      if (d > purchaseAvgByProduct[pId].lastDate) {
        purchaseAvgByProduct[pId].lastDate = d;
        purchaseAvgByProduct[pId].lastPrice = price;
      }
    });

    // 6. Ventas últimos 150 días
    const windowStart = new Date(now.getTime() - 150 * msPerDay).toISOString().split("T")[0];
    const salesDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.company_id", "=", companyId],
      ["move_id.invoice_date", ">=", windowStart],
      ["product_id", "!=", false],
    ];
    const salesLines = await fetchPaginated("account.move.line", salesDomain, ["product_id", "quantity", "date"]);

    // 7. Recepciones (stock.move) últimos 150 días (para rotación e inventario >90)
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

    // Mapas auxiliares
    const lastSaleByProduct: Record<number, Date> = {};
    const totalSalesByProduct: Record<number, number> = {};
    const salesByProduct: Record<number, { date: Date; qty: number }[]> = {};
    (salesLines || []).forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId || !line.date) return;
      const d = new Date(line.date);
      const qty = Math.abs(Number(line.quantity) || 0);
      if (!lastSaleByProduct[pId] || d > lastSaleByProduct[pId]) lastSaleByProduct[pId] = d;
      totalSalesByProduct[pId] = (totalSalesByProduct[pId] ?? 0) + qty;
      if (!salesByProduct[pId]) salesByProduct[pId] = [];
      salesByProduct[pId].push({ date: d, qty });
    });

    const lastReceptionByProduct: Record<number, Date> = {};
    const receptionsByProduct: Record<number, { date: Date; qty: number }[]> = {};
    (receptions || []).forEach((move: any) => {
      const pId = move.product_id?.[0];
      if (!pId || !move.date) return;
      const qty = Number(move.product_uom_qty) || 0;
      const d = new Date(move.date);
      if (!lastReceptionByProduct[pId] || d > lastReceptionByProduct[pId]) lastReceptionByProduct[pId] = d;
      if (!receptionsByProduct[pId]) receptionsByProduct[pId] = [];
      receptionsByProduct[pId].push({ date: d, qty });
    });

    // Productos elegibles (con demanda)
    const eligibleProducts = productsData.filter((p: any) => (totalSalesByProduct[p.id] ?? 0) > 0);

    let result: any = {};

    // ══════════════════════════════════════════════════════════════
    // KPI 1: Variación del costo de compra
    // Base = promedio ponderado últimos 3 meses
    // Actual = standard_price
    // Variación = (base - actual) / base × 100
    // ══════════════════════════════════════════════════════════════
    if (kpiParam === "variacion_costo") {
      const items = productsData
        .map((p: any) => {
          const avg = purchaseAvgByProduct[p.id];
          if (!avg || avg.totalQty <= 0) return null;
          const base = avg.totalCost / avg.totalQty;
          const current = priceMap[p.id];
          if (base <= 0 || current <= 0) return null;
          const variacion = Math.round(((base - current) / base) * 100 * 100) / 100;
          const stock = stockMap[p.id] ?? 0;
          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            costoBase: Math.round(base * 100) / 100,
            costoActual: Math.round(current * 100) / 100,
            variacion,
            stock,
            ahorroUnitario: Math.round((base - current) * 100) / 100,
            totalComprado3m: Math.round(avg.totalQty),
            ultimaCompra: avg.lastDate.toISOString().split("T")[0],
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => Math.abs(b.variacion) - Math.abs(a.variacion));

      const totalAhorro = items.reduce((s: number, i: any) => s + (i.ahorroUnitario * i.stock), 0);
      const promedioVariacion = items.length > 0
        ? Math.round(items.reduce((s: number, i: any) => s + i.variacion, 0) / items.length * 100) / 100
        : 0;

      result = {
        kpi: "variacion_costo",
        titulo: "Variación del costo de compra",
        resumen: {
          totalProductos: items.length,
          promedioVariacion,
          ahorroTotalEstimado: Math.round(totalAhorro * 100) / 100,
          metodo: "Promedio ponderado últimos 3 meses vs standard_price",
        },
        items,
      };

    // ══════════════════════════════════════════════════════════════
    // KPI 2: Rotación saludable de compras
    // Sell-through de cohortes: unidades vendidas / unidades recibidas × 100
    // Cohorte = productos recibidos en un período → vendidos en 30/60/90/120 días
    // ══════════════════════════════════════════════════════════════
    } else if (kpiParam === "rotacion") {
      const TARGET_DAYS = [30, 60, 90, 120];

      // Calcular sell-through por cohortes recientes (últimos 120 días)
      const cohortStart = new Date(now.getTime() - 120 * msPerDay);
      const cohortReceptions = (receptions || []).filter((m: any) => new Date(m.date) >= cohortStart);

      // Agrupar recepciones por producto y fecha (cohorte semanal)
      const cohortMap: Record<number, { received: number; sold: number; receivedDate: Date }> = {};
      (cohortReceptions || []).forEach((move: any) => {
        const pId = move.product_id?.[0];
        if (!pId) return;
        const qty = Number(move.product_uom_qty) || 0;
        if (qty <= 0) return;
        const d = new Date(move.date);
        if (!cohortMap[pId]) cohortMap[pId] = { received: 0, sold: 0, receivedDate: d };
        cohortMap[pId].received += qty;
        if (d > cohortMap[pId].receivedDate) cohortMap[pId].receivedDate = d;
      });

      // Para cada cohorte, calcular cuánto se vendió después
      Object.keys(cohortMap).forEach((k) => {
        const pId = +k;
        const cohort = cohortMap[pId];
        const productSales = salesByProduct[pId] || [];
        let soldAfterReception = 0;
        productSales.forEach((s) => {
          if (s.date >= cohort.receivedDate) soldAfterReception += s.qty;
        });
        cohort.sold = Math.min(soldAfterReception, cohort.received);
      });

      // Calcular sell-through a diferentes plazos
      const sellThroughByDays: Record<number, number> = {};
      TARGET_DAYS.forEach((days) => {
        const cutoff = new Date(now.getTime() - days * msPerDay);
        let totalReceived = 0;
        let totalSold = 0;
        Object.values(cohortMap).forEach((c) => {
          if (c.receivedDate >= cutoff) {
            totalReceived += c.received;
            totalSold += c.sold;
          }
        });
        sellThroughByDays[days] = totalReceived > 0
          ? Math.round((totalSold / totalReceived) * 100)
          : 0;
      });

      // Items para el detalle: productos con stock, clasificados por rotación
      const items = productsData
        .map((p: any) => {
          const stock = stockMap[p.id] ?? 0;
          if (stock <= 0) return null;
          const ventas = totalSalesByProduct[p.id] ?? 0;
          const lastSale = lastSaleByProduct[p.id];
          const lastReception = lastReceptionByProduct[p.id];
          const diasSinVenta = lastSale
            ? Math.floor((now.getTime() - lastSale.getTime()) / msPerDay)
            : 999;
          const diasSinRecepcion = lastReception
            ? Math.floor((now.getTime() - lastReception.getTime()) / msPerDay)
            : 999;

          // Sell-through individual: ventas / (ventas + stock) × 100
          const sellThrough = (ventas + stock) > 0
            ? Math.round((ventas / (ventas + stock)) * 100)
            : 0;

          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            stock,
            costo: priceMap[p.id] ?? 0,
            valorStock: Math.round(stock * (priceMap[p.id] ?? 0) * 100) / 100,
            ventasTotales: Math.round(ventas),
            sellThrough,
            diasSinVenta,
            diasSinRecepcion,
            ultimoMovimiento: lastSale ? lastSale.toISOString().split("T")[0] : "Sin movimiento",
            ultimaRecepcion: lastReception ? lastReception.toISOString().split("T")[0] : "Sin recepción",
            rotaSaludablemente: sellThrough >= 70,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.sellThrough - b.sellThrough);

      const conStock = items.length;
      const saludables = items.filter((i: any) => i.rotaSaludablemente).length;

      result = {
        kpi: "rotacion",
        titulo: "Rotación saludable de compras",
        resumen: {
          totalConStock: conStock,
          saludables,
          noSaludables: conStock - saludables,
          sellThroughGeneral: conStock > 0
            ? Math.round(items.reduce((s: number, i: any) => s + i.sellThrough, 0) / conStock)
            : 0,
          sellThroughPorPlazo: sellThroughByDays,
          metodo: "Sell-through de cohortes de recepción",
        },
        items,
      };

    // ══════════════════════════════════════════════════════════════
    // KPI 3: Porcentaje de quiebre de inventario
    // SKU-días sin inventario / SKU-días elegibles × 100
    // Elegibles: activos, con demanda, reabastecibles
    // ══════════════════════════════════════════════════════════════
    } else if (kpiParam === "quiebre") {
      const semanaDias = new Date(anio, mesNum, 0).getDate();

      // Para cada producto elegible, calcular días sin stock
      const items = eligibleProducts
        .map((p: any) => {
          const stock = stockMap[p.id] ?? 0;
          const demanda = totalSalesByProduct[p.id] ?? 0;
          const demandaDiaria = demanda / semanaDias;
          const diasHastaQuiebre = stock > 0 && demandaDiaria > 0
            ? Math.floor(stock / demandaDiaria)
            : 999;
          const enQuiebre = stock <= 0;
          const enRiesgo = !enQuiebre && diasHastaQuiebre <= 7;

          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            stock,
            demandaMensual: Math.round(demanda),
            demandaDiaria: Math.round(demandaDiaria * 100) / 100,
            diasHastaQuiebre: diasHastaQuiebre >= 999 ? "Sin riesgo" : diasHastaQuiebre,
            diasSinStockEstimado: enQuiebre ? semanaDias : (diasHastaQuiebre <= 7 ? semanaDias - diasHastaQuiebre : 0),
            costo: priceMap[p.id] ?? 0,
            estado: enQuiebre ? "QUIEBRE TOTAL" : enRiesgo ? "RIESGO ALTO" : "OK",
          };
        })
        .sort((a: any, b: any) => {
          const order = { "QUIEBRE TOTAL": 0, "RIESGO ALTO": 1, "OK": 2 };
          return (order[a.estado as keyof typeof order] ?? 3) - (order[b.estado as keyof typeof order] ?? 3);
        });

      const totalConDemanda = items.length;
      const enQuiebre = items.filter((i: any) => i.estado === "QUIEBRE TOTAL").length;
      const enRiesgo = items.filter((i: any) => i.estado === "RIESGO ALTO").length;
      const totalDiasSinStock = items.reduce((s: number, i: any) => s + i.diasSinStockEstimado, 0);
      const totalDiasElegibles = totalConDemanda * semanaDias;
      const porcentajeQuiebre = totalDiasElegibles > 0
        ? Math.round((totalDiasSinStock / totalDiasElegibles) * 100)
        : 0;

      result = {
        kpi: "quiebre",
        titulo: "Porcentaje de quiebre de inventario",
        resumen: {
          totalConDemanda,
          enQuiebre,
          enRiesgo,
          porcentaje: porcentajeQuiebre,
          totalDiasSinStock,
          totalDiasElegibles,
          metodo: "SKU-días sin inventario / SKU-días elegibles",
        },
        items,
      };

    // ══════════════════════════════════════════════════════════════
    // KPI 4: Inventario con más de 90 días
    // Bandas: 0-30, 31-60, 61-90, 91-120, 121-180, >180 días
    // Basado en última recepción de compra
    // ══════════════════════════════════════════════════════════════
    } else if (kpiParam === "inventario_90") {
      const bands = [
        { label: "0-30 días", min: 0, max: 30 },
        { label: "31-60 días", min: 31, max: 60 },
        { label: "61-90 días", min: 61, max: 90 },
        { label: "91-120 días", min: 91, max: 120 },
        { label: "121-180 días", min: 121, max: 180 },
        { label: ">180 días", min: 181, max: Infinity },
      ];

      const bandAccumulator = bands.map((b) => ({ ...b, valor: 0, cantidad: 0 }));

      let totalInventarioValor = 0;
      const items = productsData
        .map((p: any) => {
          const stock = stockMap[p.id] ?? 0;
          if (stock <= 0) return null;
          const costo = priceMap[p.id] ?? 0;
          const valor = stock * costo;
          totalInventarioValor += valor;
          const lastReception = lastReceptionByProduct[p.id];
          const diasInactivo = lastReception
            ? Math.floor((now.getTime() - lastReception.getTime()) / msPerDay)
            : 999;

          // Clasificar en banda
          let bandaIdx = 0;
          for (let i = 0; i < bands.length; i++) {
            if (diasInactivo >= bands[i].min && diasInactivo <= bands[i].max) {
              bandaIdx = i;
              break;
            }
          }
          bandAccumulator[bandaIdx].valor += valor;
          bandAccumulator[bandaIdx].cantidad += 1;

          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            stock,
            costo,
            valorInventario: Math.round(valor * 100) / 100,
            diasInactivo,
            banda: bands[bandaIdx].label,
            ultimoMovimiento: lastReception ? lastReception.toISOString().split("T")[0] : "Sin recepción",
            esEstancado: diasInactivo > 90,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.diasInactivo - a.diasInactivo);

      const valorEstancado = bandAccumulator
        .filter((b) => b.min >= 91)
        .reduce((s, b) => s + b.valor, 0);
      const porcentaje = totalInventarioValor > 0
        ? Math.round((valorEstancado / totalInventarioValor) * 100)
        : 0;

      result = {
        kpi: "inventario_90",
        titulo: "Inventario con más de 90 días",
        resumen: {
          totalProductos: items.length,
          productosEstancados: items.filter((i: any) => i.esEstancado).length,
          valorTotalInventario: Math.round(totalInventarioValor * 100) / 100,
          valorEstancado: Math.round(valorEstancado * 100) / 100,
          porcentaje,
          bandas: bandAccumulator.map((b) => ({
            label: b.label,
            valor: Math.round(b.valor * 100) / 100,
            cantidad: b.cantidad,
            porcentaje: totalInventarioValor > 0
              ? Math.round((b.valor / totalInventarioValor) * 100)
              : 0,
          })),
          metodo: "Envejecimiento por última recepción de compra",
        },
        items,
      };

    } else {
      return NextResponse.json({ error: "KPI inválido. Use: variacion_costo, rotacion, quiebre, inventario_90" }, { status: 400 });
    }

    detailCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error en compras-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
