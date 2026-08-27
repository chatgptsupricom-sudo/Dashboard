import { query } from "@/lib/db";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { getPendingPurchaseQtyByProduct } from "@/lib/compras/purchaseOrders";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const sugeridosCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

const ETA_DIAS = 25;

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

// Prioridad ABC: A primero, luego B, luego C
function prioridadABC(abc: string): number {
  if (abc === "A") return 0;
  if (abc === "B") return 1;
  return 2;
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
    const cacheKey = `compras_sugeridos_v8_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
    const cached = sugeridosCache.get(cacheKey);
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
          ["move_id.partner_id.name", "not ilike", "office solution"],
          ["product_id", "!=", false],
        ];
        if (sedeId) domain.push(["move_id.company_id", "=", sedeId]);
        const page = await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [domain],
          {
            fields: ["product_id", "quantity", "price_subtotal"],
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

    const [lines45, lines365, moqResult] = await Promise.all([
      fetchInvoiceLines(str45),
      fetchInvoiceLines(str365),
      query("SELECT sku, cantidad FROM moqs"),
    ]);

    console.log(`[Sugeridos] sede=${sedeId} lines45=${lines45.length} lines365=${lines365.length}`);

    const stats45: Record<number, { unidades: number; ingresos: number }> = {};
    lines45.forEach((l) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      if (!stats45[id]) stats45[id] = { unidades: 0, ingresos: 0 };
      stats45[id].unidades += l.quantity || 0;
      stats45[id].ingresos += l.price_subtotal || 0;
    });

    const stats365: Record<number, number> = {};
    lines365.forEach((l) => {
      if (!l.product_id) return;
      const id = l.product_id[0];
      stats365[id] = (stats365[id] || 0) + (l.quantity || 0);
    });

    const productIds = Object.keys(stats45)
      .map(Number)
      .filter((id) => stats45[id].unidades > 0);
    console.log(`[Sugeridos] sede=${sedeId} productIds=${productIds.length}`);
    if (productIds.length === 0)
      return NextResponse.json({ success: true, data: [] });

    // Obtener lot_stock_id de los almacenes principales conocidos.
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
    console.log(`[Sugeridos] sede=${sedeId} warehouseIds=${JSON.stringify(warehouseIds)} locationIds=${JSON.stringify(locationIds)}`);

    const stockQuantDomain: any[] = [
      ["product_id", "in", productIds],
    ];
    if (locationIds.length > 0) {
      stockQuantDomain.push(["location_id", "child_of", locationIds]);
    } else {
      stockQuantDomain.push(["location_id.usage", "=", "internal"]);
    }
    if (sedeId) stockQuantDomain.push(["company_id", "=", sedeId]);

    const [productos, stockData, pendingPurchaseByProduct] = await Promise.all([
      callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [
          [
            ["id", "in", productIds],
            ["active", "=", true],
          ],
        ],
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
      getPendingPurchaseQtyByProduct(companies),
    ]);

    // Si hay warehouse configurado pero no retorna stock, reportar el problema
    if (sedeId && warehouseIds.length > 0 && locationIds.length > 0 && (!stockData || stockData.length === 0)) {
      console.log(`[Sugeridos] sede=${sedeId} WARNING: warehouse configurado (id=${warehouseIds[0]}, ubicación=${locationIds[0]}) pero sin stock. Verificar configuración del almacén en Odoo.`);
    }

    if (!productos) throw new Error("Error obteniendo productos");
    console.log(`[Sugeridos] sede=${sedeId} productos=${productos.length} stockData=${stockData?.length ?? 0}`);

    const stockMap: Record<number, number> = {};
    if (stockData) {
      stockData.forEach((s: any) => {
        if (!s.product_id) return;
        const id = s.product_id[0];
        stockMap[id] =
          (stockMap[id] || 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }

    // Costos por empresa con allowed_company_ids
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
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      if (!prices) continue;
      prices.forEach((t: any) => {
        const val = Number(t.standard_price) || 0;
        if (val > 0) tmplPriceMap[t.id] = val;
      });
    }

    // Fallback: buscar standard_price a nivel product.product para templates con costo 0
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

    // Fallback 3: precio de compra desde product.supplierinfo (pestaña "Compras" en Odoo)
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

    const moqMap = new Map(
      (moqResult as any).rows.map((m: any) => [m.sku, Number(m.cantidad)]),
    );
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

        const ventas45d = Math.round(stats45[pId]?.unidades || 0);
        const ventas365d = Math.round(stats365[pId] || 0);
        const stock = stockMap[pId] || 0;
        const costo = tmplId ? (tmplPriceMap[tmplId] || productPriceFallback[pId] || supplierPriceFallback[tmplId] || 0) : (productPriceFallback[pId] || 0);
        const moqRaw = moqMap.get(codigo);
        // Sin MOQ configurado, se recomienda igual en base a rotacion (default 1),
        // igual que ya hace /api/compras/quiebre.
        const moq = moqRaw !== undefined && moqRaw > 0 ? moqRaw : 1;
        const abc = abcMap[pId] || "C";

        const diasInvDeseado = abc === "A" ? 60 : abc === "B" ? 45 : 30;
        const stockSeguridad = abc === "A" ? 2 : abc === "B" ? 1 : 0;
        const demandaDiaria = ventas45d / 45;
        const puntoReorden = demandaDiaria * ETA_DIAS + stockSeguridad;
        const stockObjetivo = demandaDiaria * diasInvDeseado;
        const diasInvActual = demandaDiaria > 0 ? stock / demandaDiaria : 999;

        // Excluir productos con stock por encima del punto de reorden
        if (stock > puntoReorden) return null;

        const cantidadEnOC = pendingPurchaseByProduct[pId] || 0;

        // Se descuenta lo que ya esta en camino (OC confirmada, aun no recibida)
        // para no duplicar la sugerencia de compra.
        let cantidadAComprar = 0;
        const gap = stockObjetivo - stock - cantidadEnOC;
        if (gap > 0) cantidadAComprar = Math.ceil(gap / moq) * moq;
        const valorAComprar = cantidadAComprar * costo;

        return {
          id: pId,
          codigo,
          name: prod.name,
          marca: prod.name
            ? prod.name.split(" ")[0].toUpperCase()
            : "SIN MARCA",
          categoria: prod.categ_id ? prod.categ_id[1] : "Sin Categoría",
          ventas45d,
          ventas365d,
          demandaDiaria: Number(demandaDiaria.toFixed(2)),
          abc,
          stockDisponible: stock,
          costo,
          moq,
          puntoReorden: Number(puntoReorden.toFixed(1)),
          stockObjetivo: Number(stockObjetivo.toFixed(1)),
          diasInvActual:
            diasInvActual >= 999 ? 999 : Number(diasInvActual.toFixed(0)),
          cantidadAComprar,
          valorAComprar: Number(valorAComprar.toFixed(2)),
          cantidadEnOC,
          tieneOCPendiente: cantidadEnOC > 0,
          tipo: stock <= 0 ? "quiebre" : "riesgo" as const,
        };
      })
      .filter(Boolean)
      // Ordenar: días de inventario (más bajo = más urgente primero) → ABC → ventas45d desc
      .sort((a: any, b: any) => {
        if (a.diasInvActual !== b.diasInvActual)
          return a.diasInvActual - b.diasInvActual;
        const aa = prioridadABC(a.abc);
        const ab = prioridadABC(b.abc);
        if (aa !== ab) return aa - ab;
        return b.ventas45d - a.ventas45d;
      });

    sugeridosCache.set(cacheKey, { data: result, ts: Date.now() });

    // Warning si el almacén configurado no tiene stock
    const warehouseWarning =
      sedeId && warehouseIds.length > 0 && locationIds.length > 0 && (!stockData || stockData.length === 0)
        ? `El almacén de esta sede no tiene stock registrado. Verificar ubicación principal (lot_stock_id) en Odoo.`
        : undefined;

    return NextResponse.json({ success: true, data: result, warning: warehouseWarning });
  } catch (error: any) {
    console.error("❌ Error en API Sugeridos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
