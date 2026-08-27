import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const rotCatCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 15 * 60 * 1000;

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

    const cacheKey = `compras_rotcat_v4_sede${sedeId ?? "todas"}`;
    const cached = rotCatCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const ALL_COMPANIES = [9, 10, 7];
    const companiesToFetch = sedeId ? [sedeId] : ALL_COMPANIES;

    // Stock locations
    const warehouseIds = companiesToFetch
      .map((cid) => MAIN_WAREHOUSE_BY_COMPANY[cid])
      .filter(Boolean);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id"], limit: 0, context: { allowed_company_ids: companiesToFetch } },
    );
    const locationIds =
      warehouseData?.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) ?? [];

    // Productos activos
    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      {
        fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"],
        limit: 0,
      },
    );
    if (!productos) throw new Error("Sin productos");

    // Stock por producto y por compañía — query por cada empresa
    const stockPorProdYComp: Record<number, Record<number, number>> = {};
    for (const cid of companiesToFetch) {
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
        {
          fields: ["product_id", "quantity", "reserved_quantity"],
          limit: 0,
          context: { allowed_company_ids: [cid] },
        },
      );
      stockData?.forEach((s: any) => {
        if (!s.product_id) return;
        const pid = s.product_id[0];
        stockPorProdYComp[pid] ??= {};
        stockPorProdYComp[pid][cid] =
          (stockPorProdYComp[pid][cid] ?? 0) +
          Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    // ============================================================
    // VENTAS 45d — mismo patrón que tendencia (que sí funciona)
    // ============================================================
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

    const saleLines = await fetchLines(invoiceDomain, ["product_id", "quantity"]);

    const ventasPorProd: Record<number, number> = {};
    saleLines.forEach((l: any) => {
      if (!l.product_id) return;
      const pid = l.product_id[0];
      ventasPorProd[pid] = (ventasPorProd[pid] ?? 0) + (l.quantity || 0);
    });

    // ============================================================
    // COSTOS: 3 niveles de fallback
    // ============================================================
    const tmplIds = [
      ...new Set(productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean)),
    ];
    const prodIds = productos.map((p: any) => p.id);

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

    // ============================================================
    // CLASIFICACIÓN ABC (global)
    // ============================================================
    const ventasTotalGlobal = Object.values(ventasPorProd).reduce((a, b) => a + b, 0);
    const productosOrdenados = productos
      .map((p: any) => ({ id: p.id, ventas: ventasPorProd[p.id] ?? 0 }))
      .sort((a, b) => b.ventas - a.ventas);
    const abcMap: Record<number, "A" | "B" | "C"> = {};
    let acumulado = 0;
    for (const p of productosOrdenados) {
      acumulado += p.ventas;
      const pct = ventasTotalGlobal > 0 ? acumulado / ventasTotalGlobal : 0;
      abcMap[p.id] = pct <= 0.8 ? "A" : pct <= 0.95 ? "B" : "C";
    }

    // ============================================================
    // AGRUPAR POR CATEGORÍA
    // ============================================================
    const categorias: Record<string, any> = {};
    const companies = sedeId ? [sedeId] : ALL_COMPANIES;

    productos.forEach((p: any) => {
      // Calcular stock y ventas primero para filtrar
      let stockTotal = 0;
      for (const cid of companies) {
        stockTotal += Math.round((stockPorProdYComp[p.id]?.[cid] ?? 0) * 100) / 100;
      }
      const ventas = ventasPorProd[p.id] ?? 0;

      // Excluir productos sin stock Y sin ventas (no aportan)
      if (stockTotal <= 0 && ventas <= 0) return;

      const catId = p.categ_id?.[0] ?? 0;
      const catNombre = p.categ_id?.[1] ?? "Sin categoría";
      const key = String(catId);
      if (!categorias[key]) {
        categorias[key] = {
          nombre: catNombre,
          skus: 0,
          clasA: 0,
          clasB: 0,
          clasC: 0,
          ventas45d: 0,
          stockTotal: 0,
          capitalEstancado: 0,
          skusQuiebre: 0,
        };
      }
      const cat = categorias[key];
      const costo = priceMap[p.id] ?? 0;
      const abc = abcMap[p.id] ?? "C";

      cat.skus++;
      if (abc === "A") cat.clasA++;
      else if (abc === "B") cat.clasB++;
      else cat.clasC++;

      const capital = ventas === 0 && stockTotal > 0 ? stockTotal * costo : 0;

      cat.ventas45d += Math.round(ventas);
      cat.stockTotal += stockTotal;
      cat.capitalEstancado += capital;

      if (stockTotal <= 0 && ventas > 0) cat.skusQuiebre++;
    });

    const resultado = Object.values(categorias)
      .map((c: any) => ({
        ...c,
        ventas45d: Math.round(c.ventas45d),
        stockTotal: Math.round(c.stockTotal),
        capitalEstancado: Math.round(c.capitalEstancado),
        pctA: c.skus > 0 ? Math.round((c.clasA / c.skus) * 100) : 0,
        pctB: c.skus > 0 ? Math.round((c.clasB / c.skus) * 100) : 0,
        pctC: c.skus > 0 ? Math.round((c.clasC / c.skus) * 100) : 0,
      }))
      .sort((a: any, b: any) => b.ventas45d - a.ventas45d);

    rotCatCache.set(cacheKey, { data: resultado, ts: Date.now() });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error: any) {
    console.error("❌ Error en API rotacion-categoria:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
