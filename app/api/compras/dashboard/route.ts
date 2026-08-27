import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";


const dashboardCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

const ETA_DIAS = 25;

async function fetchLines(domain: any[], fields: string[]): Promise<any[]> {
  let result: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(
      "account.move.line",
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

    const { payload } = await jwtVerify(token, jwtSecretBytes());
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "Permisos insuficientes" },
        { status: 403 },
      );
    }

    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;

    const cacheKey = `compras_dashboard_v2_sede${sedeId ?? "todas"}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const today = new Date();
    const companies = sedeId ? [sedeId] : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);

    // Warehouse locations
    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id"], limit: 0, context: { allowed_company_ids: companies } },
    );

    // Sales 45d + 365d
    const fecha45 = new Date();
    fecha45.setDate(today.getDate() - 45);
    const fecha365 = new Date();
    fecha365.setDate(today.getDate() - 365);
    const str45 = fecha45.toISOString().split("T")[0];
    const str365 = fecha365.toISOString().split("T")[0];

    const baseDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.partner_id.name", "not ilike", "office solution"],
      ["product_id", "!=", false],
    ];
    if (sedeId) baseDomain.push(["move_id.company_id", "=", sedeId]);

    const [lines45, lines365] = await Promise.all([
      fetchLines([...baseDomain, ["move_id.invoice_date", ">=", str45]], ["product_id", "quantity"]),
      fetchLines([...baseDomain, ["move_id.invoice_date", ">=", str365]], ["product_id", "quantity"]),
    ]);

    const stats45: Record<number, number> = {};
    lines45.forEach((l: any) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      stats45[id] = (stats45[id] || 0) + (l.quantity || 0);
    });

    const stats365: Record<number, number> = {};
    lines365.forEach((l: any) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      stats365[id] = (stats365[id] || 0) + (l.quantity || 0);
    });

    const productIds = Object.keys(stats45)
      .map(Number)
      .filter((id) => stats45[id] > 0);

    if (productIds.length === 0) {
      const empty = {
        totalSugeridos: 0, valorTotalComprar: 0, enQuiebre: 0, enRiesgo: 0,
        totalEstancados: 0, capitalEstancado: 0, totalSkusActivos: 0,
        clasA: 0, clasB: 0, clasC: 0,
      };
      dashboardCache.set(cacheKey, { data: empty, ts: Date.now() });
      return NextResponse.json({ success: true, data: empty });
    }

    // Products + stock per company
    const [productos] = await Promise.all([
      callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["id", "in", productIds], ["active", "=", true]]],
        { fields: ["id", "product_tmpl_id"], limit: 0 },
      ),
    ]);

    const stockMap: Record<number, number> = {};
    for (const cid of companies) {
      const whId = MAIN_WAREHOUSE_BY_COMPANY[cid];
      const wh = warehouseData?.find((w: any) => w.id === whId);
      const whLoc = wh?.lot_stock_id?.[0];
      const stockDomain: any[] = [["product_id", "in", productIds]];
      if (whLoc) {
        stockDomain.push(["location_id", "child_of", [whLoc]]);
      } else {
        stockDomain.push(["location_id.usage", "=", "internal"]);
      }
      stockDomain.push(["company_id", "=", cid]);
      const stockData = await callOdooRPC<any[]>(
        "stock.quant",
        "search_read",
        [stockDomain],
        { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      stockData?.forEach((s: any) => {
        if (!s.product_id) return;
        const id = s.product_id[0];
        stockMap[id] = (stockMap[id] || 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    // Costs (template level)
    const tmplIds = [...new Set(productos?.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean) ?? [])];
    const tmplPriceMap: Record<number, number> = {};
    for (const cid of companies) {
      const prices = await callOdooRPC<any[]>(
        "product.template",
        "search_read",
        [[["id", "in", tmplIds]]],
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      prices?.forEach((t: any) => {
        const val = Number(t.standard_price) || 0;
        if (val > 0) tmplPriceMap[t.id] = val;
      });
    }

    // ABC classification
    const abcInput = productIds.map((id) => ({ id, ventas365d: stats365[id] || 0 }));
    const total365 = abcInput.reduce((s, p) => s + p.ventas365d, 0);
    const sorted = [...abcInput].sort((a, b) => b.ventas365d - a.ventas365d);
    const abcMap: Record<number, string> = {};
    let acum = 0;
    for (const p of sorted) {
      acum += p.ventas365d;
      const pct = total365 > 0 ? acum / total365 : 1;
      abcMap[p.id] = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
    }

    let clasA = 0, clasB = 0, clasC = 0;
    for (const id of productIds) {
      const abc = abcMap[id] || "C";
      if (abc === "A") clasA++;
      else if (abc === "B") clasB++;
      else clasC++;
    }

    // Sugeridos computation
    const moqResult = await query("SELECT sku, cantidad FROM moqs");
    const moqMap = new Map(
      (moqResult as any).rows.map((m: any) => [m.sku, Number(m.cantidad)]),
    );

    let totalSugeridos = 0;
    let valorTotalComprar = 0;
    let enQuiebre = 0;
    let enRiesgo = 0;

    for (const pId of productIds) {
      const ventas45d = stats45[pId] || 0;
      const stock = stockMap[pId] || 0;
      const prod = productos?.find((p: any) => p.id === pId);
      const tmplId = prod?.product_tmpl_id?.[0];
      const costo = tmplId ? (tmplPriceMap[tmplId] || 0) : 0;
      const codigo = prod?.default_code ? String(prod.default_code).trim() : `PROD-${pId}`;
      const abc = abcMap[pId] || "C";
      const diasInvDeseado = abc === "A" ? 60 : abc === "B" ? 45 : 30;
      const stockSeguridad = abc === "A" ? 2 : abc === "B" ? 1 : 0;
      const demandaDiaria = ventas45d / 45;
      const puntoReorden = demandaDiaria * ETA_DIAS + stockSeguridad;
      const stockObjetivo = demandaDiaria * diasInvDeseado;

      const moqRaw = moqMap.get(codigo);
      const tieneMoq = moqRaw !== undefined && moqRaw > 0;
      const moq = tieneMoq ? moqRaw! : 0;

      // Count sugeridos: products below reorder point (same as sugeridos API)
      if (stock <= puntoReorden && demandaDiaria > 0) {
        totalSugeridos++;
        // Only calculate value if MOQ configured
        if (tieneMoq) {
          const gap = stockObjetivo - stock;
          if (gap > 0) {
            const cantidadAComprar = Math.ceil(gap / moq) * moq;
            valorTotalComprar += cantidadAComprar * costo;
          }
        }
      }

      if (stock <= 0 && demandaDiaria > 0) {
        enQuiebre++;
      } else if (stock <= puntoReorden && demandaDiaria > 0) {
        enRiesgo++;
      }
    }

    // Estancados (lightweight: count + capital)
    let totalEstancados = 0;
    let capitalEstancado = 0;

    const allProductData = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "product_tmpl_id"], limit: 0 },
    );

    const estStockMap: Record<number, number> = {};
    for (const cid of companies) {
      const whId = MAIN_WAREHOUSE_BY_COMPANY[cid];
      const wh = warehouseData?.find((w: any) => w.id === whId);
      const whLoc = wh?.lot_stock_id?.[0];
      const stockDomain: any[] = [["product_id", "!=", false]];
      if (whLoc) {
        stockDomain.push(["location_id", "child_of", [whLoc]]);
      } else {
        stockDomain.push(["location_id.usage", "=", "internal"]);
      }
      stockDomain.push(["company_id", "=", cid]);
      const stockData = await callOdooRPC<any[]>(
        "stock.quant",
        "search_read",
        [stockDomain],
        { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      stockData?.forEach((s: any) => {
        if (!s.product_id) return;
        const id = s.product_id[0];
        estStockMap[id] = (estStockMap[id] || 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    // Get last invoice date per product for estancados
    const estTmplIds = [...new Set(allProductData?.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean) ?? [])];
    const estPriceMap: Record<number, number> = {};
    for (const cid of companies) {
      const prices = await callOdooRPC<any[]>(
        "product.template",
        "search_read",
        [[["id", "in", estTmplIds]]],
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      prices?.forEach((t: any) => {
        const val = Number(t.standard_price) || 0;
        if (val > 0) estPriceMap[t.id] = val;
      });
    }

    // Get invoices to find last sale date
    const invoiceDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["state", "=", "posted"],
      ["partner_id.name", "not ilike", "supricom"],
      ["partner_id.name", "not ilike", "office solution"],
    ];
    if (sedeId) invoiceDomain.push(["company_id", "=", sedeId]);

    let invoiceIds: number[] = [];
    let offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [invoiceDomain],
        { fields: ["id", "invoice_date"], order: "id asc", limit: 5000, offset },
      );
      if (!page || page.length === 0) break;
      invoiceIds.push(...page.map((i: any) => i.id));
      if (page.length < 5000) break;
      offset += 5000;
    }

    const invoiceDateMap: Record<number, Date> = {};
    if (invoiceIds.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < invoiceIds.length; i += CHUNK) {
        const chunk = invoiceIds.slice(i, i + CHUNK);
        const invoices = await callOdooRPC<any[]>(
          "account.move",
          "search_read",
          [[["id", "in", chunk]]],
          { fields: ["id", "invoice_date"], limit: 0 },
        );
        invoices?.forEach((inv: any) => {
          if (inv.invoice_date) invoiceDateMap[inv.id] = new Date(inv.invoice_date);
        });
      }
    }

    const productLastInvoice: Record<number, Date> = {};
    if (invoiceIds.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < invoiceIds.length; i += CHUNK) {
        const chunk = invoiceIds.slice(i, i + CHUNK);
        const lines = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [[["move_id", "in", chunk], ["product_id", "!=", false]]],
          { fields: ["product_id", "move_id"], limit: 0 },
        );
        lines?.forEach((line: any) => {
          if (!line.product_id || !line.move_id) return;
          const pId = line.product_id[0];
          const date = invoiceDateMap[line.move_id[0]];
          if (!date) return;
          if (!productLastInvoice[pId] || date > productLastInvoice[pId])
            productLastInvoice[pId] = date;
        });
      }
    }

    for (const prod of allProductData ?? []) {
      const prodId = prod.id;
      const lastInvoice = productLastInvoice[prodId] || new Date(0);
      const daysInactive = lastInvoice.getTime() === 0
        ? 999
        : Math.floor((today.getTime() - lastInvoice.getTime()) / 86400000);
      const stock = estStockMap[prodId] ?? 0;
      const tmplId = prod.product_tmpl_id?.[0];
      const costo = tmplId ? (estPriceMap[tmplId] || 0) : 0;

      if (stock > 0 && daysInactive >= 30) {
        totalEstancados++;
        capitalEstancado += stock * costo;
      }
    }

    const result = {
      totalSugeridos,
      valorTotalComprar: Math.round(valorTotalComprar),
      enQuiebre,
      enRiesgo,
      totalEstancados,
      capitalEstancado: Math.round(capitalEstancado),
      totalSkusActivos: productIds.length,
      clasA,
      clasB,
      clasC,
    };

    dashboardCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Error en API Dashboard Compras:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
