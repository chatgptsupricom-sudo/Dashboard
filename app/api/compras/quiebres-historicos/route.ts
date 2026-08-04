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

    const cacheKey = `compras_qh_v2_sede${sedeId ?? "todas"}`;
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
    // FACTURAS: ventas de los últimos 180 días
    // ============================================================
    const today = new Date();
    const date180 = new Date();
    date180.setDate(today.getDate() - 180);
    const str180 = date180.toISOString().split("T")[0];

    async function fetchInvoiceLines(fechaDesde: string): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const domain: any[] = [
          ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
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
          { fields: ["product_id", "quantity", "move_id"], order: "id asc", limit: 5000, offset },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < 5000) break;
        offset += 5000;
      }
      return result;
    }

    const invoiceLines = await fetchInvoiceLines(str180);

    // Obtener move_ids únicos para buscar fechas
    const moveIds = [...new Set(invoiceLines.map((l: any) => l.move_id?.[0]).filter(Boolean))];
    const moveDateMap: Record<number, Date> = {};

    if (moveIds.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < moveIds.length; i += CHUNK) {
        const chunk = moveIds.slice(i, i + CHUNK);
        const moves = await callOdooRPC<any[]>(
          "account.move",
          "search_read",
          [[["id", "in", chunk]]],
          { fields: ["id", "invoice_date"], limit: 0 },
        );
        if (moves) {
          moves.forEach((m: any) => {
            if (m.invoice_date) moveDateMap[m.id] = new Date(m.invoice_date);
          });
        }
      }
    }

    // ============================================================
    // VENTANAS SEMANALES (26 semanas = 180 días)
    // ============================================================
    const WEEKS = 26;
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

    // Agregar ventas por producto y semana usando invoice_date
    const weeklySales: Record<number, boolean[]> = {};
    const totalSales: Record<number, number> = {};

    invoiceLines.forEach((line: any) => {
      if (!line.product_id) return;
      const pId = line.product_id[0];
      const qty = line.quantity || 0;
      const moveId = line.move_id?.[0];
      const fecha = moveDateMap[moveId];
      if (!fecha) return;

      const wi = getWeekIndex(fecha);
      if (wi === -1) return;

      if (!weeklySales[pId]) weeklySales[pId] = Array(WEEKS).fill(false);
      weeklySales[pId][wi] = true;
      totalSales[pId] = (totalSales[pId] || 0) + qty;
    });

    // ============================================================
    // DETECCIÓN DE QUIEBRES
    // Brecha de al menos 1 semana sin ventas entre semanas con ventas
    // ============================================================
    const resultado = productos
      .map((p: any) => {
        const sales = weeklySales[p.id] ?? Array(WEEKS).fill(false);
        const total = totalSales[p.id] ?? 0;

        // Encontrar primera y última semana con ventas
        const firstSale = sales.findIndex((v) => v);
        const lastSale = sales.reduceRight(
          (acc, v, i) => (acc === -1 && v ? i : acc),
          -1,
        );

        let quiebresContados = 0;
        let semanasQuiebre = 0;
        let enQuiebre = false;

        if (firstSale !== -1 && lastSale !== -1 && lastSale > firstSale) {
          for (let wi = firstSale; wi <= lastSale; wi++) {
            if (!sales[wi]) {
              // Semana sin ventas entre primera y última venta
              if (!enQuiebre) {
                quiebresContados++; // Nuevo quiebre
                enQuiebre = true;
              }
              semanasQuiebre++; // Semana en quiebre
            } else {
              enQuiebre = false; // Se reabasteció
            }
          }
        }

        const semanasConVenta = sales.filter(Boolean).length;
        const stockActual = stockMap[p.id] ?? 0;

        return {
          id: p.id,
          codigo: p.default_code ? String(p.default_code).trim() : `PROD-${p.id}`,
          name: p.name,
          categoria: p.categ_id?.[1] ?? "Sin categoría",
          stockActual,
          totalSalidas180d: Math.round(total),
          semanasConVenta,
          quiebresContados,
          semanasQuiebre,
          frecuenciaQuiebre: WEEKS > 0 ? Math.round((semanasQuiebre / WEEKS) * 100) : 0,
        };
      })
      .filter((p) => p.quiebresContados > 0)
      .sort((a, b) => b.quiebresContados - a.quiebresContados);

    qhCache.set(cacheKey, { data: resultado, ts: Date.now() });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error: any) {
    console.error("❌ Error en API quiebres-historicos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
