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

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
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

    // Shared data fetches
    const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[companyId];
    let locationIds: number[] = [];
    if (warehouseId) {
      const warehouseData = await callOdooRPC<any[]>(
        "stock.warehouse", "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 0 },
      );
      locationIds = warehouseData?.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) ?? [];
    }

    const productsData = await callOdooRPC<any[]>(
      "product.product", "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"], limit: 0 },
    );
    if (!productsData) throw new Error("Sin productos");

    const stockDomain: any[] = locationIds.length > 0
      ? [["location_id", "child_of", locationIds]]
      : [["location_id.usage", "=", "internal"], ["company_id", "=", companyId]];
    const stockData = await callOdooRPC<any[]>(
      "stock.quant", "search_read",
      [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
    );
    const stockMap: Record<number, number> = {};
    (stockData || []).forEach((s: any) => {
      const id = s.product_id?.[0];
      if (!id) return;
      stockMap[id] = (stockMap[id] ?? 0) + Math.max(0, Number(s.quantity) - Number(s.reserved_quantity));
    });
    Object.keys(stockMap).forEach((k) => { stockMap[+k] = Math.round(stockMap[+k] * 100) / 100; });

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

    const purchaseLines = await fetchPaginated(
      "purchase.order.line",
      [
        ["company_id", "=", companyId],
        ["state", "in", ["purchase", "done"]],
        ["product_id", "!=", false],
      ],
      ["product_id", "price_unit", "create_date"],
    );
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

    const today = new Date();
    const windowStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 150);
    const salesDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.company_id", "=", companyId],
      ["move_id.invoice_date", ">=", windowStart.toISOString().split("T")[0]],
      ["product_id", "!=", false],
    ];
    const lines = await fetchPaginated("account.move.line", salesDomain, ["product_id", "quantity", "date"]);

    const lastSaleByProduct: Record<number, Date> = {};
    const totalSalesByProduct: Record<number, number> = {};
    lines.forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId || !line.date) return;
      const d = new Date(line.date);
      if (!lastSaleByProduct[pId] || d > lastSaleByProduct[pId]) lastSaleByProduct[pId] = d;
      totalSalesByProduct[pId] = (totalSalesByProduct[pId] ?? 0) + (line.quantity || 0);
    });

    const msPerDay = 86400000;
    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    let result: any = {};

    if (kpiParam === "variacion_costo") {
      const items = productsData
        .map((p: any) => {
          const base = baseCostMap[p.id];
          const current = priceMap[p.id];
          const stock = stockMap[p.id] ?? 0;
          if (!base || !current || base <= 0 || current <= 0) return null;
          const variacion = Math.round(((base - current) / base) * 100 * 100) / 100;
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
        resumen: { totalProductos: items.length, promedioVariacion, ahorroTotalEstimado: Math.round(totalAhorro * 100) / 100 },
        items,
      };

    } else if (kpiParam === "rotacion") {
      const cutoff45 = new Date(today.getTime() - 45 * msPerDay);
      const items = productsData
        .map((p: any) => {
          const stock = stockMap[p.id] ?? 0;
          if (stock <= 0) return null;
          const lastSale = lastSaleByProduct[p.id];
          const ventas = totalSalesByProduct[p.id] ?? 0;
          const diasSinVenta = lastSale
            ? Math.floor((today.getTime() - lastSale.getTime()) / msPerDay)
            : 999;
          const vendeEn45 = lastSale ? lastSale >= cutoff45 : false;
          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            stock,
            costo: priceMap[p.id] ?? 0,
            valorStock: Math.round(stock * (priceMap[p.id] ?? 0) * 100) / 100,
            ventasTotales: Math.round(ventas),
            diasSinVenta,
            ultimoMovimiento: lastSale ? lastSale.toISOString().split("T")[0] : "Sin movimiento",
            rotaSaludablemente: vendeEn45,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.diasSinVenta - a.diasSinVenta);

      const conStock = items.length;
      const saludables = items.filter((i: any) => i.rotaSaludablemente).length;
      const noSaludables = conStock - saludables;

      result = {
        kpi: "rotacion",
        titulo: "Rotación saludable de compras",
        resumen: { totalConStock: conStock, saludables, noSaludables, porcentaje: conStock > 0 ? Math.round((saludables / conStock) * 100) : 0 },
        items,
      };

    } else if (kpiParam === "quiebre") {
      const invoiceLines45 = lines; // already fetched 150 days
      const demandByProduct: Record<number, number> = {};
      invoiceLines45.forEach((line: any) => {
        const pId = line.product_id?.[0];
        if (!pId) return;
        const d = new Date(line.date);
        if (d >= new Date(today.getTime() - 45 * msPerDay)) {
          demandByProduct[pId] = (demandByProduct[pId] ?? 0) + (line.quantity || 0);
        }
      });

      const items = productsData
        .map((p: any) => {
          const demanda = demandByProduct[p.id] ?? 0;
          if (demanda <= 0) return null;
          const stock = stockMap[p.id] ?? 0;
          const demandaDiaria = demanda / 45;
          const diasHastaQuiebre = stock > 0 && demandaDiaria > 0 ? Math.floor(stock / demandaDiaria) : 999;
          const enQuiebre = stock <= 0;
          const enRiesgo = !enQuiebre && diasHastaQuiebre <= 25;
          const moq = 1;
          const puntoReorden = demandaDiaria * 25 + 1;
          const stockObjetivo = demandaDiaria * 45;
          const cantidadAComprar = (enQuiebre || enRiesgo) && demandaDiaria > 0
            ? Math.ceil(Math.max(0, stockObjetivo - stock) / moq) * moq
            : 0;

          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            stock,
            demanda45d: Math.round(demanda),
            demandaDiaria: Math.round(demandaDiaria * 100) / 100,
            puntoReorden: Math.round(puntoReorden * 100) / 100,
            diasHastaQuiebre: diasHastaQuiebre >= 999 ? "Sin riesgo" : diasHastaQuiebre,
            moq,
            costo: priceMap[p.id] ?? 0,
            cantidadAComprar,
            estado: enQuiebre ? "QUIEBRE TOTAL" : enRiesgo ? "RIESGO ALTO" : "OK",
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => {
          const order = { "QUIEBRE TOTAL": 0, "RIESGO ALTO": 1, "OK": 2 };
          return (order[a.estado as keyof typeof order] ?? 3) - (order[b.estado as keyof typeof order] ?? 3);
        });

      const totalConDemanda = items.length;
      const enQuiebre = items.filter((i: any) => i.estado === "QUIEBRE TOTAL").length;
      const enRiesgo = items.filter((i: any) => i.estado === "RIESGO ALTO").length;

      result = {
        kpi: "quiebre",
        titulo: "Porcentaje de quiebre de inventario",
        resumen: { totalConDemanda, enQuiebre, enRiesgo, porcentaje: totalConDemanda > 0 ? Math.round((enQuiebre / totalConDemanda) * 100) : 0 },
        items,
      };

    } else if (kpiParam === "inventario_90") {
      const cutoff90 = new Date(today.getTime() - 90 * msPerDay);
      let totalInventarioValor = 0;
      const items = productsData
        .map((p: any) => {
          const stock = stockMap[p.id] ?? 0;
          if (stock <= 0) return null;
          const costo = priceMap[p.id] ?? 0;
          const valor = stock * costo;
          totalInventarioValor += valor;
          const lastSale = lastSaleByProduct[p.id];
          const diasInactivo = lastSale
            ? Math.floor((today.getTime() - lastSale.getTime()) / msPerDay)
            : 999;
          const esEstancado = !lastSale || lastSale < cutoff90;
          return {
            id: p.id,
            sku: p.default_code || `PROD-${p.id}`,
            nombre: p.name,
            categoria: p.categ_id?.[1] || "Sin categoría",
            stock,
            costo,
            valorInventario: Math.round(valor * 100) / 100,
            diasInactivo,
            ultimoMovimiento: lastSale ? lastSale.toISOString().split("T")[0] : "Sin movimiento",
            esEstancado,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => b.diasInactivo - a.diasInactivo);

      const valorEstancado = items.filter((i: any) => i.esEstancado).reduce((s: number, i: any) => s + i.valorInventario, 0);
      const porcentaje = totalInventarioValor > 0
        ? Math.round((valorEstancado / totalInventarioValor) * 100)
        : 0;

      result = {
        kpi: "inventario_90",
        titulo: "Inventario con más de 90 días",
        resumen: { totalProductos: items.length, productosEstancados: items.filter((i: any) => i.esEstancado).length, valorTotalInventario: Math.round(totalInventarioValor * 100) / 100, valorEstancado: Math.round(valorEstancado * 100) / 100, porcentaje },
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
