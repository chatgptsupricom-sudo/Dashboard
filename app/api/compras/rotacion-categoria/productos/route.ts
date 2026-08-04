import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const prodsCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

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
    const categoria = searchParams.get("categoria") || "";
    const tipo = searchParams.get("tipo") || "";
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;

    const cacheKey = `compras_rotcat_prods_v1_${categoria}_${tipo}_sede${sedeId ?? "todas"}`;
    const cached = prodsCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const ALL_COMPANIES = [9, 10, 7];
    const companiesToFetch = sedeId ? [sedeId] : ALL_COMPANIES;
    const warehouseIds = companiesToFetch
      .map((cid) => MAIN_WAREHOUSE_BY_COMPANY[cid])
      .filter(Boolean);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id", "company_id"], limit: 0 },
    );
    const locationIds =
      warehouseData?.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) ?? [];

    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["active", "=", true],
          ["type", "=", "product"],
        ],
      ],
      {
        fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"],
        limit: 0,
      },
    );
    if (!productos) throw new Error("Sin productos");

    const stockDomain: any[] =
      locationIds.length > 0
        ? [
            ["location_id", "child_of", locationIds],
            ["product_id", "!=", false],
          ]
        : [
            ["location_id.usage", "=", "internal"],
            ["product_id", "!=", false],
          ];
    const stockData = await callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [stockDomain],
      {
        fields: ["product_id", "quantity", "reserved_quantity", "company_id"],
        limit: 0,
      },
    );
    const stockPorProdYComp: Record<number, Record<number, number>> = {};
    stockData?.forEach((s: any) => {
      if (!s.product_id) return;
      const pid = s.product_id[0];
      const compId = s.company_id?.[0] ?? (sedeId || 9);
      stockPorProdYComp[pid] ??= {};
      stockPorProdYComp[pid][compId] =
        (stockPorProdYComp[pid][compId] ?? 0) +
        Math.max(0, s.quantity - s.reserved_quantity);
    });

    const today = new Date();
    const date45Ago = new Date();
    date45Ago.setDate(today.getDate() - 45);
    const date45Str = date45Ago.toISOString().split("T")[0];
    const invoiceDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", date45Str],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.partner_id.name", "not ilike", "office solution"],
      ["product_id", "!=", false],
    ];
    if (sedeId) invoiceDomain.push(["move_id.company_id", "=", sedeId]);

    let saleLines: any[] = [];
    let offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [invoiceDomain],
        {
          fields: ["product_id", "quantity"],
          order: "id asc",
          limit: 5000,
          offset,
        },
      );
      if (!page || page.length === 0) break;
      saleLines = saleLines.concat(page);
      if (page.length < 5000) break;
      offset += 5000;
    }

    // Ventas por producto (ya filtrado por sede si aplica)
    const ventasPorProd: Record<number, number> = {};
    saleLines.forEach((l: any) => {
      if (!l.product_id) return;
      const pid = l.product_id[0];
      ventasPorProd[pid] = (ventasPorProd[pid] ?? 0) + (l.quantity || 0);
    });

    // ============================================================
    // COSTOS: 3 niveles de fallback
    // 1. product.template.standard_price
    // 2. product.product.standard_price
    // 3. product.supplierinfo.price
    // ============================================================
    const tmplIds = [
      ...new Set(
        productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean),
      ),
    ];
    const prodIds = productos.map((p: any) => p.id);

    // Nivel 1: product.template
    const tmplPriceMap: Record<number, number> = {};
    const costCompanies = sedeId ? [sedeId] : ALL_COMPANIES;
    for (const cid of costCompanies) {
      const prices = await callOdooRPC<any[]>(
        "product.template",
        "search_read",
        [[["id", "in", tmplIds]]],
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      if (!prices) continue;
      prices.forEach((t: any) => {
        const val = Number(t.standard_price) || 0;
        if (val > 0) tmplPriceMap[t.id] = val;
      });
    }

    // Nivel 2: product.product
    const prodPriceMap: Record<number, number> = {};
    for (const cid of costCompanies) {
      const prices = await callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["id", "in", prodIds]]],
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      if (!prices) continue;
      prices.forEach((p: any) => {
        const val = Number(p.standard_price) || 0;
        if (val > 0) prodPriceMap[p.id] = val;
      });
    }

    // Nivel 3: product.supplierinfo
    const supplierPriceMap: Record<number, number> = {};
    const supplierInfos = await callOdooRPC<any[]>(
      "product.supplierinfo",
      "search_read",
      [[["product_tmpl_id", "in", tmplIds]]],
      { fields: ["product_tmpl_id", "price"], limit: 0 },
    );
    supplierInfos?.forEach((s: any) => {
      const tmplId = s.product_tmpl_id?.[0];
      const val = Number(s.price) || 0;
      if (tmplId && val > 0 && !supplierPriceMap[tmplId]) {
        supplierPriceMap[tmplId] = val;
      }
    });

    // Construir priceMap con fallback
    const priceMap: Record<number, number> = {};
    productos.forEach((p: any) => {
      const tmplId = p.product_tmpl_id?.[0];
      let cost = 0;
      if (tmplId) {
        cost = tmplPriceMap[tmplId] ?? prodPriceMap[p.id] ?? supplierPriceMap[tmplId] ?? 0;
      } else {
        cost = prodPriceMap[p.id] ?? 0;
      }
      priceMap[p.id] = cost;
    });

    const companies_ = sedeId ? [sedeId] : ALL_COMPANIES;
    // Ventas totales para ABC (ya filtrado por sede si aplica)
    const ventasTotalesGlobal: Record<number, number> = ventasPorProd;
    const totalVentasGlobal = Object.values(ventasTotalesGlobal).reduce(
      (a, b) => a + b,
      0,
    );
    const productosOrdenados = productos
      .map((p: any) => ({ id: p.id, ventas: ventasTotalesGlobal[p.id] ?? 0 }))
      .sort((a, b) => b.ventas - a.ventas);
    const abcMap: Record<number, string> = {};
    let acumulado = 0;
    for (const p of productosOrdenados) {
      acumulado += p.ventas;
      const pct = totalVentasGlobal > 0 ? acumulado / totalVentasGlobal : 0;
      abcMap[p.id] = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
    }

    let result = productos.map((p: any) => {
      const costo = priceMap[p.id] ?? 0;
      // Capital estancado: stock GLOBAL sin ventas
      let stock = 0;
      for (const cid of companies_) {
        const s = Math.round((stockPorProdYComp[p.id]?.[cid] ?? 0) * 100) / 100;
        stock += s;
      }
      const ventas = ventasPorProd[p.id] ?? 0;
      const capital = ventas === 0 && stock > 0 ? stock * costo : 0;
      const quiebre = stock <= 0 && ventas > 0;
      return {
        id: p.id,
        codigo: p.default_code || `PROD-${p.id}`,
        nombre: p.name,
        categoria: p.categ_id?.[1] ?? "Sin categoría",
        stock,
        ventas45d: Math.round(ventas),
        costo: Math.round(costo * 100) / 100,
        capitalEstancado: Math.round(capital),
        quiebre,
        abc: abcMap[p.id] ?? "C",
      };
    });

    if (categoria) {
      result = result.filter(
        (p) => p.categoria.toLowerCase() === categoria.toLowerCase(),
      );
    }
    if (tipo === "estancado") {
      result = result.filter((p) => p.capitalEstancado > 0);
    } else if (tipo === "quiebre") {
      result = result.filter((p) => p.quiebre);
    }

    result.sort((a, b) => b.ventas45d - a.ventas45d);

    prodsCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error en API productos rotacion-categoria:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
