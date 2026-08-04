import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const qhCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 20 * 60 * 1000;

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

    const cacheKey = `compras_qh_v3_sede${sedeId ?? "todas"}`;
    const cached = qhCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    const companies = sedeId ? [sedeId] : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);

    // Stock locations
    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id"], limit: 0, context: { allowed_company_ids: companies } },
    );
    const locationIds =
      warehouseData?.map((w: any) => w.lot_stock_id?.[0]).filter(Boolean) ?? [];

    // Productos activos
    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "default_code", "name", "categ_id"], limit: 0, context: { allowed_company_ids: companies } },
    );
    if (!productos) throw new Error("Sin productos");

    // Stock actual
    const stockDomain: any[] =
      locationIds.length > 0
        ? [["location_id", "child_of", locationIds], ["product_id", "!=", false]]
        : [["location_id.usage", "=", "internal"], ["product_id", "!=", false]];
    const stockData = await callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0, context: { allowed_company_ids: companies } },
    );
    const stockMap: Record<number, number> = {};
    stockData?.forEach((s: any) => {
      if (!s.product_id) return;
      const id = s.product_id[0];
      stockMap[id] = (stockMap[id] ?? 0) + Math.max(0, s.quantity - s.reserved_quantity);
    });
    Object.keys(stockMap).forEach((k) => {
      stockMap[+k] = Math.round(stockMap[+k] * 100) / 100;
    });

    // ============================================================
    // VENTANAS SEMANALES (26 semanas = 180 días)
    // ============================================================
    const WEEKS = 26;
    const today = new Date();
    const weekStarts: Date[] = [];
    for (let i = WEEKS - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i * 7);
      d.setHours(0, 0, 0, 0);
      weekStarts.push(d);
    }

    function getWeekIndex(fecha: Date): number {
      for (let wi = 0; wi < WEEKS; wi++) {
        const ws = weekStarts[wi];
        const we = new Date(ws);
        we.setDate(ws.getDate() + 7);
        if (fecha >= ws && fecha < we) return wi;
      }
      return -1;
    }

    // ============================================================
    // OBTENER ÓRDENES DE VENTA CON ENTREGAS INCOMPLETAS
    // Un quiebre real = cuando alguien pidió pero no se pudo entregar
    // ============================================================
    const date180 = new Date();
    date180.setDate(today.getDate() - 180);
    const str180 = date180.toISOString().split("T")[0];

    // Buscar sale.order.line donde qty_delivered < product_uom_qty (entrega incompleta)
    async function fetchIncompleteLines(): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const domain: any[] = [
          ["create_date", ">=", str180],
          ["product_id", "!=", false],
          ["product_uom_qty", ">", 0],
          // Solo líneas donde no se entregó todo
          ["qty_delivered", "<", "product_uom_qty"],
          // Excluir supricom y office solution
          ["order_id.partner_id.name", "not ilike", "supricom"],
          ["order_id.partner_id.name", "not ilike", "office solution"],
        ];
        if (sedeId) domain.push(["order_id.company_id", "=", sedeId]);
        const page = await callOdooRPC<any[]>(
          "sale.order.line",
          "search_read",
          [domain],
          { fields: ["product_id", "product_uom_qty", "qty_delivered", "order_id", "create_date", "state"],
            order: "create_date asc", limit: 5000, offset,
            context: { allowed_company_ids: companies } },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < 5000) break;
        offset += 5000;
      }
      return result;
    }

    const incompleteLines = await fetchIncompleteLines();

    // ============================================================
    // DETECCIÓN DE QUIEBRES REALES
    // Cada línea incompleta = 1 semana de quiebre para ese producto
    // Si hay múltiples líneas en la misma semana = 1 sola semana
    // ============================================================
    const quiebresPorProducto: Record<number, Set<number>> = {};
    const ventasNoCumplidas: Record<number, number> = {};
    const unidadesFaltantes: Record<number, number> = {};

    incompleteLines.forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId) return;

      const fecha = new Date(line.create_date);
      const wi = getWeekIndex(fecha);
      if (wi === -1) return;

      if (!quiebresPorProducto[pId]) quiebresPorProducto[pId] = new Set();
      quiebresPorProducto[pId].add(wi);

      ventasNoCumplidas[pId] = (ventasNoCumplidas[pId] ?? 0) + 1;
      unidadesFaltantes[pId] = (unidadesFaltantes[pId] ?? 0) + (line.product_uom_qty - (line.qty_delivered || 0));
    });

    // También obtener ventas totales (facturas entregadas) para contexto
    async function fetchDeliveredLines(): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const domain: any[] = [
          ["create_date", ">=", str180],
          ["product_id", "!=", false],
          ["qty_delivered", ">", 0],
          ["order_id.partner_id.name", "not ilike", "supricom"],
          ["order_id.partner_id.name", "not ilike", "office solution"],
        ];
        if (sedeId) domain.push(["order_id.company_id", "=", sedeId]);
        const page = await callOdooRPC<any[]>(
          "sale.order.line",
          "search_read",
          [domain],
          { fields: ["product_id", "qty_delivered", "create_date"],
            order: "create_date asc", limit: 5000, offset,
            context: { allowed_company_ids: companies } },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < 5000) break;
        offset += 5000;
      }
      return result;
    }

    const deliveredLines = await fetchDeliveredLines();
    const totalSales: Record<number, number> = {};
    const semanasConVenta: Record<number, Set<number>> = {};

    deliveredLines.forEach((line: any) => {
      const pId = line.product_id?.[0];
      if (!pId) return;
      totalSales[pId] = (totalSales[pId] ?? 0) + (line.qty_delivered || 0);

      const fecha = new Date(line.create_date);
      const wi = getWeekIndex(fecha);
      if (wi !== -1) {
        if (!semanasConVenta[pId]) semanasConVenta[pId] = new Set();
        semanasConVenta[pId].add(wi);
      }
    });

    // ============================================================
    // RESULTADO: productos con quiebres reales
    // ============================================================
    const resultado = productos
      .filter((p: any) => quiebresPorProducto[p.id]?.size > 0)
      .map((p: any) => {
        const semanasQuiebre = quiebresPorProducto[p.id]?.size ?? 0;
        const totalVentas = totalSales[p.id] ?? 0;
        const semanasActivas = semanasConVenta[p.id]?.size ?? 0;

        return {
          id: p.id,
          codigo: p.default_code ? String(p.default_code).trim() : `PROD-${p.id}`,
          name: p.name,
          categoria: p.categ_id?.[1] ?? "Sin categoría",
          stockActual: stockMap[p.id] ?? 0,
          totalSalidas180d: Math.round(totalVentas),
          semanasConVenta: semanasActivas,
          quiebresContados: semanasQuiebre,
          semanasQuiebre,
          ventasNoCumplidas: ventasNoCumplidas[p.id] ?? 0,
          unidadesFaltantes: Math.round(unidadesFaltantes[p.id] ?? 0),
          frecuenciaQuiebre: WEEKS > 0 ? Math.round((semanasQuiebre / WEEKS) * 100) : 0,
        };
      })
      .sort((a, b) => b.quiebresContados - a.quiebresContados);

    qhCache.set(cacheKey, { data: resultado, ts: Date.now() });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error: any) {
    console.error("❌ Error en API quiebres-historicos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
