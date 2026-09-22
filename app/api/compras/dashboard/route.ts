import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { calcularSugerido } from "@/lib/compras/sugeridos";
import { leerSugeridos } from "@/lib/compras/sugeridosDatos";
import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const dashboardCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
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

    const cacheKey = `compras_dashboard_v3_sede${sedeId ?? "todas"}`;
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

    // Sugeridos: mismos datos y mismo calculo que la pantalla
    // /compras/sugeridos (la hoja de analisis del comprador), para que el
    // resumen no diga una cosa y la pantalla otra.
    let totalSugeridos = 0;
    let valorTotalComprar = 0;
    let enQuiebre = 0;
    let enRiesgo = 0;
    let clasA = 0;
    let clasB = 0;
    let clasC = 0;
    let totalSkusActivos = 0;

    for (const cid of companies) {
      const { data } = await leerSugeridos(cid);
      for (const fila of data) {
        const c = calcularSugerido(fila);
        totalSkusActivos++;
        if (c.abc === "A") clasA++;
        else if (c.abc === "B") clasB++;
        else clasC++;

        if (c.compraFinal > 0) {
          totalSugeridos++;
          valorTotalComprar += c.valorAComprar;
        }
        // "En quiebre" = sin stock pero con demanda; "en riesgo" = todavia
        // hay algo pero esta en el punto de reorden o por debajo.
        if (c.demandaDiaria > 0) {
          if (c.stockEfectivo <= 0) enQuiebre++;
          else if (c.stockEfectivo <= c.puntoReorden) enRiesgo++;
        }
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
      totalSkusActivos,
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
