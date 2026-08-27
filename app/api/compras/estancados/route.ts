import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const estancadosCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutos

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
    const cacheKey = `compras_estancados_v11_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
    const cached = estancadosCache.get(cacheKey);
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
      { fields: ["id", "name", "lot_stock_id", "company_id"], limit: 0, context: { allowed_company_ids: companies } },
    );
    const locationIds = warehouseData
      ? warehouseData.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean)
      : [];

    // Paso 2: traer productos activos de tipo storable.
    const productDomain: any[] = [
      ["active", "=", true],
      ["type", "=", "product"],
    ];

    const productsData = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [productDomain],
      {
        fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"],
        limit: 0,
      },
    );
    if (!productsData) throw new Error("Error obteniendo productos");

    // Paso 3: traer stock del almacén principal — query por cada empresa
    const stockMap: Record<number, number> = {};
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
    // Redondear a 2 decimales para evitar diferencias por float de Odoo
    Object.keys(stockMap).forEach((k) => {
      stockMap[+k] = Math.round(stockMap[+k] * 100) / 100;
    });

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
    // Mapa productId → costo (via product_tmpl_id)
    const priceMap: Record<number, number> = {};
    productsData.forEach((p: any) => {
      const tmplId = p.product_tmpl_id?.[0];
      priceMap[p.id] = tmplId ? (tmplPriceMap[tmplId] || productPriceFallback[p.id] || supplierPriceFallback[tmplId] || 0) : 0;
    });
    // Paso 3: obtener facturas de cliente confirmadas (account.move)
    // Sin contexto de empresa — el usuario RPC usa su empresa por defecto.
    // Pasar empresas ajenas al RPC user vacía los resultados.
    async function fetchInvoices(): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const domain: any[] = [
          ["move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
          ["state", "=", "posted"],
          ["partner_id.name", "not ilike", "supricom"],
          ["partner_id.name", "not ilike", "office solution"],
        ];
        if (sedeId) domain.push(["company_id", "=", sedeId]);
        const page = await callOdooRPC<any[]>(
          "account.move",
          "search_read",
          [domain],
          {
            fields: ["id", "invoice_date"],
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

    const invoices = await fetchInvoices();

    // Mapa move_id → invoice_date
    const invoiceDateMap: Record<number, Date> = {};
    invoices.forEach((inv) => {
      if (inv.invoice_date) invoiceDateMap[inv.id] = new Date(inv.invoice_date);
    });
    const invoiceIds = Object.keys(invoiceDateMap).map(Number);

    // Paso 4: líneas de factura filtradas por esos IDs (usa índice en move_id, rápido)
    const today = new Date();
    const productLastInvoice: Record<number, Date> = {};

    if (invoiceIds.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < invoiceIds.length; i += CHUNK) {
        const chunk = invoiceIds.slice(i, i + CHUNK);
        const lines = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", chunk],
              ["product_id", "!=", false],
            ],
          ],
          { fields: ["product_id", "move_id"], limit: 0 },
        );
        if (lines) {
          lines.forEach((line) => {
            if (!line.product_id || !line.move_id) return;
            const pId = line.product_id[0];
            const date = invoiceDateMap[line.move_id[0]];
            if (!date) return;
            if (!productLastInvoice[pId] || date > productLastInvoice[pId])
              productLastInvoice[pId] = date;
          });
        }
      }
    }

    const estancados = productsData
      .map((prod: any) => {
        const prodId = prod.id;
        const lastInvoice = productLastInvoice[prodId] || new Date(0);
        const daysInactive =
          lastInvoice.getTime() === 0
            ? 999
            : Math.floor((today.getTime() - lastInvoice.getTime()) / 86400000);
        const stock = stockMap[prodId] ?? 0;

        return {
          id: prod.id,
          codigo: prod.default_code
            ? String(prod.default_code).trim()
            : `PROD-${prod.id}`,
          name: prod.name,
          descripcion: prod.name,
          marca: prod.name
            ? prod.name.split(" ")[0].toUpperCase()
            : "SIN MARCA",
          categoria: prod.categ_id ? prod.categ_id[1] : "Sin Categoría",
          stockDisponible: stock,
          costo: priceMap[prod.id] ?? 0,
          days_inactive: daysInactive,
        };
      })
      .filter((p) => p.stockDisponible > 0 && p.days_inactive >= 30)
      .sort((a, b) => b.days_inactive - a.days_inactive);

    estancadosCache.set(cacheKey, { data: estancados, ts: Date.now() });
    return NextResponse.json(
      { success: true, data: estancados },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("❌ Error en API Estancados:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
