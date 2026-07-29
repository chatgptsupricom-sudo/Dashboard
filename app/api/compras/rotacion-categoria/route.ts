import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = { 9: 9, 10: 10, 7: 11 };

const rotCatCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;

    const cacheKey = `compras_rotcat_v2_sede${sedeId ?? "todas"}`;
    const cached = rotCatCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    // Stock locations
    const ALL_COMPANIES = [9, 10, 7];
    const companiesToFetch = sedeId ? [sedeId] : ALL_COMPANIES;
    const warehouseIds = companiesToFetch
      .map((cid) => MAIN_WAREHOUSE_BY_COMPANY[cid])
      .filter(Boolean);
    const warehouseData = await callOdooRPC<any[]>("stock.warehouse", "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id", "company_id"], limit: 0 },
    );
    const locationIds = warehouseData?.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) ?? [];

    // Map lot_stock_id → company_id
    const locCompanyMap: Record<number, number> = {};
    warehouseData?.forEach((w: any) => {
      const locId = w.lot_stock_id?.[0];
      const compId = w.company_id?.[0];
      if (locId && compId) locCompanyMap[locId] = compId;
    });

    // Productos activos
    const productos = await callOdooRPC<any[]>("product.product", "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"], limit: 0 },
    );
    if (!productos) throw new Error("Sin productos");

    // Stock por producto y por compañía
    const stockDomain: any[] = locationIds.length > 0
      ? [["location_id", "child_of", locationIds], ["product_id", "!=", false]]
      : [["location_id.usage", "=", "internal"], ["product_id", "!=", false]];
    const stockData = await callOdooRPC<any[]>("stock.quant", "search_read", [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity", "location_id", "company_id"], limit: 0 },
    );
    const stockPorProdYComp: Record<number, Record<number, number>> = {};
    stockData?.forEach((s: any) => {
      if (!s.product_id) return;
      const pid = s.product_id[0];
      const compId = s.company_id?.[0] ?? (sedeId || 9);
      stockPorProdYComp[pid] ??= {};
      stockPorProdYComp[pid][compId] = (stockPorProdYComp[pid][compId] ?? 0) + Math.max(0, s.quantity - s.reserved_quantity);
    });

    // Ventas 45d por producto y por compañía
    const today = new Date();
    const date45Ago = new Date(); date45Ago.setDate(today.getDate() - 45);
    const date45Str = date45Ago.toISOString().split("T")[0];
    const invoiceDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", date45Str],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["product_id", "!=", false],
    ];
    if (sedeId) invoiceDomain.push(["move_id.company_id", "=", sedeId]);

    let saleLines: any[] = [];
    let offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>("account.move.line", "search_read", [invoiceDomain], {
        fields: ["product_id", "quantity", "move_id.company_id"],
        order: "id asc", limit: 5000, offset,
      });
      if (!page || page.length === 0) break;
      saleLines = saleLines.concat(page);
      if (page.length < 5000) break;
      offset += 5000;
    }
    const ventasPorProdYComp: Record<number, Record<number, number>> = {};
    let ventasTotalGlobal = 0;
    saleLines.forEach((l: any) => {
      if (!l.product_id) return;
      const pid = l.product_id[0];
      let compId: number | null = null;
      if (sedeId) {
        compId = sedeId;
      } else if (l.move_id_company_id) {
        compId = l.move_id_company_id;
      } else {
        return; // skip lines without company info in "todas" mode
      }
      ventasPorProdYComp[pid] ??= {};
      const qty = l.quantity || 0;
      ventasPorProdYComp[pid][compId] = (ventasPorProdYComp[pid][compId] ?? 0) + qty;
      ventasTotalGlobal += qty;
    });

    // Mapa de ventas totales por producto (global, para ABC)
    const ventasMapGlobal: Record<number, number> = {};
    for (const [pid, comps] of Object.entries(ventasPorProdYComp)) {
      ventasMapGlobal[+pid] = Object.values(comps).reduce((a, b) => a + b, 0);
    }

    // Costos
    const tmplIds = [...new Set(productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];
    const tmplPrices = await callOdooRPC<any[]>("product.template", "search_read",
      [[["id", "in", tmplIds]]],
      { fields: ["id", "standard_price"], limit: 0 },
    );
    const tmplPriceMap: Record<number, number> = {};
    tmplPrices?.forEach((t: any) => { tmplPriceMap[t.id] = Number(t.standard_price) || 0; });
    const priceMap: Record<number, number> = {};
    productos.forEach((p: any) => {
      const tmplId = p.product_tmpl_id?.[0];
      priceMap[p.id] = tmplId ? (tmplPriceMap[tmplId] ?? 0) : 0;
    });

    // Clasificación ABC por ventas totales (global, sin importar sede)
    const productosOrdenados = productos
      .map((p: any) => ({ id: p.id, ventas: ventasMapGlobal[p.id] ?? 0 }))
      .sort((a, b) => b.ventas - a.ventas);
    const abcMap: Record<number, "A" | "B" | "C"> = {};
    let acumulado = 0;
    for (const p of productosOrdenados) {
      acumulado += p.ventas;
      const pct = ventasTotalGlobal > 0 ? acumulado / ventasTotalGlobal : 0;
      abcMap[p.id] = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
    }

    // Agrupar por categoría
    const categorias: Record<string, {
      nombre: string;
      skus: number;
      clasA: number; clasB: number; clasC: number;
      ventas45d: number;
      stockTotal: number;
      capitalEstancado: number;
      skusQuiebre: number;
    }> = {};

    // Para capital estancado: calculamos por (producto, compañía) y sumamos,
    // así un producto con stock muerto en Valencia pero ventas en Caracas
    // se cuenta correctamente como estancado en Valencia.
    const companies = sedeId ? [sedeId] : ALL_COMPANIES;
    productos.forEach((p: any) => {
      const catId = p.categ_id?.[0] ?? 0;
      const catNombre = p.categ_id?.[1] ?? "Sin categoría";
      const key = String(catId);
      if (!categorias[key]) {
        categorias[key] = { nombre: catNombre, skus: 0, clasA: 0, clasB: 0, clasC: 0, ventas45d: 0, stockTotal: 0, capitalEstancado: 0, skusQuiebre: 0 };
      }
      const cat = categorias[key];
      const costo = priceMap[p.id] ?? 0;
      const abc = abcMap[p.id] ?? "C";

      cat.skus++;
      if (abc === "A") cat.clasA++;
      else if (abc === "B") cat.clasB++;
      else cat.clasC++;

      // Sumar stock y ventas por compañía para calcular estancado correctamente
      let stockTotal = 0;
      let ventasTotal = 0;
      let capital = 0;

      for (const cid of companies) {
        const stock = Math.round((stockPorProdYComp[p.id]?.[cid] ?? 0) * 100) / 100;
        const ventas = ventasPorProdYComp[p.id]?.[cid] ?? 0;
        stockTotal += stock;
        ventasTotal += ventas;
        if (ventas === 0 && stock > 0) {
          capital += stock * costo;
        }
      }

      cat.ventas45d += Math.round(ventasTotal);
      cat.stockTotal += stockTotal;
      cat.capitalEstancado += capital;

      // Quiebre: global — stock total 0 pero ventas > 0
      if (stockTotal <= 0 && ventasTotal > 0) cat.skusQuiebre++;
    });

    const resultado = Object.values(categorias)
      .map((c) => ({
        ...c,
        ventas45d: Math.round(c.ventas45d),
        stockTotal: Math.round(c.stockTotal),
        capitalEstancado: Math.round(c.capitalEstancado),
        pctA: c.skus > 0 ? Math.round((c.clasA / c.skus) * 100) : 0,
        pctB: c.skus > 0 ? Math.round((c.clasB / c.skus) * 100) : 0,
        pctC: c.skus > 0 ? Math.round((c.clasC / c.skus) * 100) : 0,
      }))
      .sort((a, b) => b.ventas45d - a.ventas45d);

    rotCatCache.set(cacheKey, { data: resultado, ts: Date.now() });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error: any) {
    console.error("❌ Error en API rotacion-categoria:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
