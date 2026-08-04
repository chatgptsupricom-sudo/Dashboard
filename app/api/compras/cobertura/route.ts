import { query } from "@/lib/db";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const coberturaCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

function clasificarABC(
  productos: { id: number; ventas365d: number }[],
): Record<number, string> {
  const total = productos.reduce((s, p) => s + p.ventas365d, 0);
  const sorted = [...productos].sort((a, b) => b.ventas365d - a.ventas365d);
  const map: Record<number, string> = {};
  let acum = 0;
  for (const p of sorted) {
    acum += p.ventas365d;
    const pct = total > 0 ? acum / total : 1;
    map[p.id] = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
  }
  return map;
}

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

    const rawCids = String(payload.cids ?? "");
    const cacheKey = `compras_cobertura_v1_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
    const cached = coberturaCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const today = new Date();
    const fecha45 = new Date();
    fecha45.setDate(today.getDate() - 45);
    const fecha365 = new Date();
    fecha365.setDate(today.getDate() - 365);
    const str45 = fecha45.toISOString().split("T")[0];
    const str365 = fecha365.toISOString().split("T")[0];

    async function fetchInvoiceLines(fechaDesde: string): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const domain: any[] = [
          [
            "move_id.move_type",
            "in",
            ["out_invoice", "out_refund", "out_receipt"],
          ],
          ["move_id.state", "=", "posted"],
          ["move_id.invoice_date", ">=", fechaDesde],
          ["move_id.partner_id.name", "not ilike", "supricom"],
          ["product_id", "!=", false],
        ];
        if (sedeId) domain.push(["move_id.company_id", "=", sedeId]);
        const page = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [domain],
          {
            fields: ["product_id", "quantity"],
            order: "id asc",
            limit: 5000,
            offset,
          },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < 5000) break;
        offset += 5000;
      }
      return result;
    }

    const [lines45, lines365] = await Promise.all([
      fetchInvoiceLines(str45),
      fetchInvoiceLines(str365),
    ]);

    const stats45: Record<number, number> = {};
    lines45.forEach((l) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      stats45[id] = (stats45[id] || 0) + (l.quantity || 0);
    });

    const stats365: Record<number, number> = {};
    lines365.forEach((l) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      stats365[id] = (stats365[id] || 0) + (l.quantity || 0);
    });

    const productIds = Object.keys(stats365)
      .map(Number)
      .filter((id) => stats365[id] > 0);
    if (productIds.length === 0)
      return NextResponse.json({ success: true, data: [] });

    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);
    const companies = sedeId ? [sedeId] : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "name", "lot_stock_id"], limit: 0, context: { allowed_company_ids: companies } },
    );
    const locationIds = warehouseData
      ? warehouseData.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean)
      : [];

    const stockQuantDomain: any[] = [
      ["product_id", "in", productIds],
    ];
    if (locationIds.length > 0) {
      stockQuantDomain.push(["location_id", "child_of", locationIds]);
    } else {
      stockQuantDomain.push(["location_id.usage", "=", "internal"]);
    }
    if (sedeId) stockQuantDomain.push(["company_id", "=", sedeId]);

    const [productos, stockData] = await Promise.all([
      callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["id", "in", productIds], ["active", "=", true]]],
        {
          fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"],
          limit: 0,
          context: { allowed_company_ids: companies },
        },
      ),
      callOdooRPC<any[]>("stock.quant", "search_read", [stockQuantDomain], {
        fields: ["product_id", "quantity", "reserved_quantity"],
        limit: 0,
        context: { allowed_company_ids: companies },
      }),
    ]);

    if (!productos) throw new Error("Error obteniendo productos");

    const stockMap: Record<number, number> = {};
    if (stockData) {
      stockData.forEach((s: any) => {
        if (!s.product_id) return;
        const id = s.product_id[0];
        stockMap[id] =
          (stockMap[id] || 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    const tmplIds = [
      ...new Set(
        productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean),
      ),
    ];
    const tmplPriceMap: Record<number, number> = {};
    for (const cid of companies) {
      const prices = await callOdooRPC<any[]>(
        "product.template",
        "search_read",
        [[["id", "in", tmplIds]]],
        {
          fields: ["id", "standard_price"],
          limit: 0,
          context: { allowed_company_ids: [cid] },
        },
      );
      if (!prices) continue;
      prices.forEach((t: any) => {
        const val = Number(t.standard_price) || 0;
        if (val > 0) tmplPriceMap[t.id] = val;
      });
    }

    // Fallback 2: standard_price a nivel product.product
    const tmplIdsSinCosto = tmplIds.filter((tid) => !tmplPriceMap[tid] || tmplPriceMap[tid] === 0);
    const productPriceFallback: Record<number, number> = {};
    if (tmplIdsSinCosto.length > 0) {
      const prodIdsFallback = productos
        .filter((p: any) => tmplIdsSinCosto.includes(p.product_tmpl_id?.[0]))
        .map((p: any) => p.id);
      if (prodIdsFallback.length > 0) {
        for (const cid of companies) {
          const prodPrices = await callOdooRPC<any[]>(
            "product.product",
            "search_read",
            [[["id", "in", prodIdsFallback]]],
            { fields: ["id", "product_tmpl_id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
          );
          if (!prodPrices) continue;
          prodPrices.forEach((p: any) => {
            const val = Number(p.standard_price) || 0;
            if (val > 0) productPriceFallback[p.id] = val;
          });
        }
      }
    }

    // Fallback 3: precio de compra desde product.supplierinfo
    const tmplIdsAunSinCosto = tmplIdsSinCosto.filter((tid) => {
      const prod = productos.find((p: any) => p.product_tmpl_id?.[0] === tid);
      return prod && !(productPriceFallback[prod.id] > 0);
    });
    const supplierPriceFallback: Record<number, number> = {};
    if (tmplIdsAunSinCosto.length > 0) {
      const supplierData = await callOdooRPC<any[]>(
        "product.supplierinfo",
        "search_read",
        [[["product_tmpl_id", "in", tmplIdsAunSinCosto]]],
        { fields: ["product_tmpl_id", "price"], limit: 0 },
      );
      if (supplierData) {
        supplierData.forEach((s: any) => {
          const tmplId = s.product_tmpl_id?.[0];
          const val = Number(s.price) || 0;
          if (tmplId && val > 0 && !supplierPriceFallback[tmplId]) {
            supplierPriceFallback[tmplId] = val;
          }
        });
      }
    }

    const abcInput = productIds.map((id) => ({
      id,
      ventas365d: stats365[id] || 0,
    }));
    const abcMap = clasificarABC(abcInput);

    const result = productos
      .map((prod: any) => {
        const pId = prod.id;
        const tmplId = prod.product_tmpl_id?.[0];
        const codigo = prod.default_code
          ? String(prod.default_code).trim()
          : `PROD-${pId}`;

        const ventas45d = Math.round(stats45[pId] || 0);
        const stock = stockMap[pId] || 0;
        const costo = tmplId ? (tmplPriceMap[tmplId] || productPriceFallback[pId] || supplierPriceFallback[tmplId] || 0) : 0;
        const abc = abcMap[pId] || "C";

        const diasInvDeseado = abc === "A" ? 60 : abc === "B" ? 45 : 30;
        const demandaDiaria = ventas45d / 45;
        const diasCobertura =
          demandaDiaria > 0 ? Math.floor(stock / demandaDiaria) : 999;

        const fechaQuiebre = new Date(today);
        fechaQuiebre.setDate(
          fechaQuiebre.getDate() + (diasCobertura >= 999 ? 999 : diasCobertura),
        );
        const fechaQuiebreEstimada =
          diasCobertura >= 999
            ? "Sin riesgo"
            : fechaQuiebre.toLocaleDateString("es-VE", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

        return {
          id: pId,
          codigo,
          name: prod.name,
          marca: prod.name
            ? prod.name.split(" ")[0].toUpperCase()
            : "SIN MARCA",
          categoria: prod.categ_id ? prod.categ_id[1] : "Sin Categoría",
          abc,
          stockDisponible: stock,
          ventas45d,
          demandaDiaria: Number(demandaDiaria.toFixed(2)),
          diasCobertura: diasCobertura >= 999 ? 999 : diasCobertura,
          diasInvDeseado,
          costo,
          fechaQuiebreEstimada,
        };
      })
      .filter((p) => p.ventas45d > 0 && p.stockDisponible > 0)
      .sort((a, b) => a.diasCobertura - b.diasCobertura);

    coberturaCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Error en API Cobertura:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
