import { query } from "@/lib/db";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const mayorRotacionCache = new Map<string, { data: any; ts: number }>();
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
    const cacheKey = `compras_mayor_rotacion_v6_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
    const cached = mayorRotacionCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const today = new Date();

    // Obtener lot_stock_id de los almacenes principales únicamente
    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);

    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id"], limit: 0 },
    );
    const locationIds = warehouseData
      ? warehouseData.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean)
      : [];

    // Fechas para 45d y 365d
    const fecha45 = new Date();
    fecha45.setDate(today.getDate() - 45);
    const fecha365 = new Date();
    fecha365.setDate(today.getDate() - 365);
    const str45 = fecha45.toISOString().split("T")[0];
    const str365 = fecha365.toISOString().split("T")[0];

    // Ventas desde facturas de cliente confirmadas (account.move.line)
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

    // Agregar ventas por producto (out_refund resta unidades)
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

    // Solo productos con ventas en 45d
    const productIds = Object.keys(stats45)
      .map(Number)
      .filter((id) => stats45[id].unidades > 0);
    if (productIds.length === 0)
      return NextResponse.json({ success: true, data: [] });

    // Paso 2: datos de productos, stock y costos en paralelo
    const [productos, stockData, tmplPricesRaw] = await Promise.all([
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
        },
      ),
      callOdooRPC<any[]>(
        "stock.quant",
        "search_read",
        [
          [
            ...(locationIds.length > 0
              ? [["location_id", "child_of", locationIds]]
              : [["location_id.usage", "=", "internal"]]),
            ["product_id", "in", productIds],
          ],
        ],
        { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
      ),
      // placeholder — costos se obtienen después de tener tmplIds
      Promise.resolve(null as any),
    ]);

    if (!productos) throw new Error("Error obteniendo productos");

    // Stock map
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
    const companies = sedeId ? [sedeId] : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);
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

    // MOQ desde MySQL
    const moqMap = new Map(
      (moqResult as any).rows.map((m: any) => [m.sku, Number(m.cantidad)]),
    );

    // Clasificación ABC basada en ventas 365d
    const abcInput = productIds.map((id) => ({
      id,
      ventas365d: stats365[id] || 0,
    }));
    const abcMap = clasificarABC(abcInput);

    // Construir resultado final con todos los cálculos del Excel
    const result = productos
      .map((prod: any) => {
        const pId = prod.id;
        const tmplId = prod.product_tmpl_id?.[0];
        const codigo = prod.default_code
          ? String(prod.default_code).trim()
          : `PROD-${pId}`;

        const ventas45d = Math.round(stats45[pId]?.unidades || 0);
        const ventas365d = Math.round(stats365[pId] || 0);
        const ingresos = Number((stats45[pId]?.ingresos || 0).toFixed(2));
        const stock = stockMap[pId] || 0;
        const costo = tmplId ? (tmplPriceMap[tmplId] ?? 0) : 0;
        const moqRaw = moqMap.get(codigo);
        const tieneMoq = moqRaw !== undefined && moqRaw > 0;
        const moq = tieneMoq ? moqRaw! : 0;
        const abc = abcMap[pId] || "C";

        // Parámetros según clasificación ABC (igual que el Excel)
        const diasInvDeseado = abc === "A" ? 60 : abc === "B" ? 45 : 30;
        const stockSeguridad = abc === "A" ? 2 : abc === "B" ? 1 : 0;

        const demandaDiaria = ventas45d / 45;
        const puntoReorden = demandaDiaria * ETA_DIAS + stockSeguridad;
        const stockObjetivo = demandaDiaria * diasInvDeseado;
        const diasInvActual = demandaDiaria > 0 ? stock / demandaDiaria : 999;

        // Solo calcular cantidad si el producto tiene MOQ configurado en MySQL
        let cantidadAComprar = 0;
        if (tieneMoq && stock <= puntoReorden && demandaDiaria > 0) {
          const gap = stockObjetivo - stock;
          if (gap > 0) cantidadAComprar = Math.ceil(gap / moq) * moq;
        }

        const valorAComprar = cantidadAComprar * costo;

        // Acción y fecha de quiebre (igual que el Excel)
        let accion = "✅ Stock OK";
        if (stock <= 0) {
          accion = "🚨 QUIEBRE TOTAL";
        } else if (stock <= puntoReorden) {
          accion = "⚠️ RIESGO: Quiebre Inminente";
        }

        const diasHastaQuiebre =
          demandaDiaria > 0 ? Math.floor(stock / demandaDiaria) : 999;
        const fechaQuiebre = new Date(today);
        fechaQuiebre.setDate(fechaQuiebre.getDate() + diasHastaQuiebre);
        const fechaQuiebreEstimada =
          diasHastaQuiebre >= 999
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
          ventas45d,
          ventas365d,
          ingresos,
          demandaDiaria: Number(demandaDiaria.toFixed(2)),
          abc,
          stockDisponible: stock,
          costo,
          moq,
          etaDias: ETA_DIAS,
          diasInvDeseado,
          stockSeguridad,
          puntoReorden: Number(puntoReorden.toFixed(1)),
          stockObjetivo: Number(stockObjetivo.toFixed(1)),
          diasInvActual:
            diasInvActual >= 999 ? 999 : Number(diasInvActual.toFixed(0)),
          tieneMoq,
          cantidadAComprar,
          valorAComprar: Number(valorAComprar.toFixed(2)),
          accion,
          fechaQuiebreEstimada,
        };
      })
      .sort((a, b) => b.ventas45d - a.ventas45d);

    mayorRotacionCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Error en API Mayor Rotación:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
