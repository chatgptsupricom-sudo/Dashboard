import { query } from "@/lib/db";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const quiebreCache = new Map<string, { data: any; ts: number }>();
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

    // Extraer company IDs del JWT para pasar contexto correcto a Odoo.
    // standard_price es un campo ir.property (específico por empresa).
    // Solo se pasa contexto si el usuario tiene empresas asignadas;
    // sin cids se deja que Odoo use la empresa por defecto del usuario RPC.
    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;

    const rawCids = String(payload.cids ?? "");
    const cacheKey = `compras_quiebre_v12_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
    const cached = quiebreCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { status: 200 },
      );
    }

    // Paso 1: obtener lot_stock_id de los almacenes principales conocidos.
    const companies = sedeId ? [sedeId] : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);
    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "name", "lot_stock_id"], limit: 0, context: { allowed_company_ids: companies } },
    );
    const locationIds = warehouseData
      ? warehouseData.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean)
      : [];

    const productPromise = callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [
        [
          ["active", "=", true],
          ["type", "=", "product"],
        ],
      ],
      { fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"] },
    );
    // Stock por producto y por compañía — query por cada empresa
    const stockMap: Record<number, number> = {};
    for (const cid of companies) {
      const whId = MAIN_WAREHOUSE_BY_COMPANY[cid];
      const wh = warehouseData?.find((w: any) => w.id === whId);
      const whLoc = wh?.lot_stock_id?.[0];

      const stockDomain: any[] = [];
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
        const id = s.product_id[0];
        stockMap[id] =
          (stockMap[id] ?? 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }
    const moqPromise = query("SELECT sku, cantidad FROM moqs");

    const [productsData, moqResult] = await Promise.all([
      productPromise,
      moqPromise,
    ]);
    if (!productsData) throw new Error("Error obteniendo productos");

    // Paso 2: traer standard_price con allowed_company_ids para obtener
    // el costo correcto por empresa.
    const tmplIds = [
      ...new Set(
        productsData.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean),
      ),
    ];
    const tmplPriceMap: Record<number, number> = {};

    for (const cid of companies) {
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
    // Fallback 2: standard_price a nivel product.product
    const tmplIdsSinCosto = tmplIds.filter((tid) => !tmplPriceMap[tid] || tmplPriceMap[tid] === 0);
    const productPriceFallback: Record<number, number> = {};
    if (tmplIdsSinCosto.length > 0) {
      const prodIdsFallback = productsData
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
      const prod = productsData.find((p: any) => p.product_tmpl_id?.[0] === tid);
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
    const priceMap: Record<number, number> = {};
    productsData.forEach((p: any) => {
      const tmplId = p.product_tmpl_id?.[0];
      priceMap[p.id] = tmplId ? (tmplPriceMap[tmplId] || productPriceFallback[p.id] || supplierPriceFallback[tmplId] || 0) : 0;
    });

    // Velocidad reciente: últimos 45 días basada en facturas confirmadas
    // Se excluyen socios con "Supricom" en el nombre (ventas intercompany)
    const today = new Date();
    const date45DaysAgo = new Date();
    date45DaysAgo.setDate(today.getDate() - 45);
    const date45Str = date45DaysAgo.toISOString().split("T")[0];

    const invoiceLineDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", date45Str],
      ["move_id.partner_id.name", "not ilike", "supricom"],
      ["move_id.partner_id.name", "not ilike", "office solution"],
      ["product_id", "!=", false],
    ];
    if (sedeId) invoiceLineDomain.push(["move_id.company_id", "=", sedeId]);

    async function fetchRecentLines(): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const page = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [invoiceLineDomain],
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

    const saleLines = await fetchRecentLines();

    const productSalesStats: Record<number, number> = {};
    saleLines.forEach((line) => {
      if (!line.product_id) return;
      const pId = line.product_id[0];
      const qty = line.quantity || 0;
      productSalesStats[pId] = (productSalesStats[pId] || 0) + qty;
    });


    // Redondear a 2 decimales para evitar diferencias por float de Odoo
    Object.keys(stockMap).forEach((k) => {
      stockMap[+k] = Math.round(stockMap[+k] * 100) / 100;
    });

    const moqMap = new Map((moqResult as any).rows.map((m: any) => [m.sku, m]));

    const alertasQuiebre = productsData
      .map((prod: any) => {
        const prodId = prod.id;
        const sku = prod.default_code
          ? String(prod.default_code).trim()
          : `PROD-${prod.id}`;

        const ventas45d = productSalesStats[prodId] || 0;
        const stock = stockMap[prodId] ?? 0;

        const moqData = moqMap.get(sku);
        const moq = moqData && moqData.cantidad > 0 ? moqData.cantidad : 1;
        const costo = priceMap[prod.id] ?? 0;

        const etaDias = 25;
        const stockSeguridad = 1;
        const diasInventarioDeseado = 45;

        const demandaDiaria = ventas45d / 45;
        const puntoReorden = demandaDiaria * etaDias + stockSeguridad;
        const stockObjetivo = demandaDiaria * diasInventarioDeseado;

        let cantidadAComprar = 0;
        if (stock <= puntoReorden && demandaDiaria > 0) {
          const gap = stockObjetivo - stock;
          if (gap > 0) cantidadAComprar = Math.ceil(gap / moq) * moq;
        }

        const nivelCritico = stock <= 0 ? "QUIEBRE TOTAL" : "RIESGO ALTO";
        const diasHastaQuiebre =
          demandaDiaria > 0 ? Math.floor(stock / demandaDiaria) : 999;
        const fechaQuiebre = new Date(today);
        fechaQuiebre.setDate(fechaQuiebre.getDate() + diasHastaQuiebre);
        const fechaQuiebreEstimada =
          diasHastaQuiebre >= 999
            ? "Sin riesgo inmediato"
            : fechaQuiebre.toLocaleDateString("es-VE", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

        return {
          id: prod.id,
          codigo: sku,
          name: prod.name,
          descripcion: prod.name,
          marca: prod.name
            ? prod.name.split(" ")[0].toUpperCase()
            : "SIN MARCA",
          categoria: prod.categ_id ? prod.categ_id[1] : "Sin Categoría",
          stockDisponible: stock,
          ventas45d,
          demandaDiaria,
          puntoReorden,
          moq,
          costo,
          cantidadAComprar,
          nivelCritico,
          accion: nivelCritico,
          fechaQuiebreEstimada,
        };
      })
      // FILTRO ESTRICTO: Solo productos con demanda activa Y que su stock esté por debajo del punto de reorden
      .filter((p) => p.demandaDiaria > 0 && p.stockDisponible <= p.puntoReorden)
      .sort((a, b) => b.ventas45d - a.ventas45d);

    quiebreCache.set(cacheKey, { data: alertasQuiebre, ts: Date.now() });
    return NextResponse.json(
      { success: true, data: alertasQuiebre },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("❌ Error en API Quiebre:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
