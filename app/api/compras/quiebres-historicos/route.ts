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

    const cacheKey = `compras_qh_v1_sede${sedeId ?? "todas"}`;
    const cached = qhCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, data: cached.data });
    }

    // Stock locations
    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);
    const companies = sedeId ? [sedeId] : Object.keys(MAIN_WAREHOUSE_BY_COMPANY).map(Number);
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
      [
        [
          ["active", "=", true],
          ["type", "=", "product"],
        ],
      ],
      { fields: ["id", "default_code", "name", "categ_id"], limit: 0, context: { allowed_company_ids: companies } },
    );
    if (!productos) throw new Error("Sin productos");

    // Stock actual
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
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0, context: { allowed_company_ids: companies } },
    );
    const stockMap: Record<number, number> = {};
    stockData?.forEach((s: any) => {
      if (!s.product_id) return;
      const id = s.product_id[0];
      stockMap[id] =
        (stockMap[id] ?? 0) + Math.max(0, s.quantity - s.reserved_quantity);
    });
    Object.keys(stockMap).forEach((k) => {
      stockMap[+k] = Math.round(stockMap[+k] * 100) / 100;
    });

    // ============================================================
    // MOVIMIENTOS: salidas a cliente (ventas)
    // ============================================================
    const today = new Date();
    const date180 = new Date();
    date180.setDate(today.getDate() - 180);
    const date180Str = date180.toISOString().split("T")[0] + " 00:00:00";

    const outDomain: any[] = [
      ["state", "=", "done"],
      ["date", ">=", date180Str],
      ["location_dest_id.usage", "=", "customer"],
      ["product_id", "!=", false],
    ];
    if (locationIds.length > 0)
      outDomain.push(["location_id", "child_of", locationIds]);

    let outMoves: any[] = [];
    let offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>(
        "stock.move",
        "search_read",
        [outDomain],
        {
          fields: ["product_id", "product_uom_qty", "date"],
          order: "id asc",
          limit: 5000,
          offset,
          context: { allowed_company_ids: companies },
        },
      );
      if (!page || page.length === 0) break;
      outMoves = outMoves.concat(page);
      if (page.length < 5000) break;
      offset += 5000;
    }

    // ============================================================
    // MOVIMIENTOS: entradas al almacén (recepciones de compra)
    // ============================================================
    const inDomain: any[] = [
      ["state", "=", "done"],
      ["date", ">=", date180Str],
      ["location_dest_id.usage", "=", "internal"],
      ["location_id.usage", "!=", "internal"], // viene de proveedor, no de otro almacén interno
      ["product_id", "!=", false],
    ];
    if (locationIds.length > 0)
      inDomain.push(["location_dest_id", "child_of", locationIds]);

    let inMoves: any[] = [];
    offset = 0;
    while (true) {
      const page = await callOdooRPC<any[]>(
        "stock.move",
        "search_read",
        [inDomain],
        {
          fields: ["product_id", "product_uom_qty", "date"],
          order: "id asc",
          limit: 5000,
          offset,
          context: { allowed_company_ids: companies },
        },
      );
      if (!page || page.length === 0) break;
      inMoves = inMoves.concat(page);
      if (page.length < 5000) break;
      offset += 5000;
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

    function enSemana(fecha: Date, wi: number): boolean {
      const ws = weekStarts[wi];
      const we = new Date(ws);
      we.setDate(ws.getDate() + 7);
      return fecha >= ws && fecha < we;
    }

    // product -> semana -> tuvo salida?
    const productWeeklySales: Record<number, boolean[]> = {};
    outMoves.forEach((m: any) => {
      if (!m.product_id) return;
      const pId = m.product_id[0];
      const date = new Date(m.date);
      for (let wi = 0; wi < WEEKS; wi++) {
        if (enSemana(date, wi)) {
          if (!productWeeklySales[pId])
            productWeeklySales[pId] = Array(WEEKS).fill(false);
          productWeeklySales[pId][wi] = true;
          break;
        }
      }
    });

    // product -> semana -> tuvo recepción?
    const productWeeklyIn: Record<number, boolean[]> = {};
    inMoves.forEach((m: any) => {
      if (!m.product_id) return;
      const pId = m.product_id[0];
      const date = new Date(m.date);
      for (let wi = 0; wi < WEEKS; wi++) {
        if (enSemana(date, wi)) {
          if (!productWeeklyIn[pId])
            productWeeklyIn[pId] = Array(WEEKS).fill(false);
          productWeeklyIn[pId][wi] = true;
          break;
        }
      }
    });

    // ============================================================
    // DETECCIÓN DE QUIEBRES REALES
    // Un quiebre real ocurre cuando:
    //   1) Hay una brecha en ventas (semana sin ventas entre semanas con ventas)
    //   2) Y en esa misma semana o la siguiente hubo una recepción de compra
    //      (esto confirma que el producto se reabasteció porque se había agotado)
    // ============================================================
    const resultado = productos
      .map((p: any) => {
        const weeklySales =
          productWeeklySales[p.id] ?? Array(WEEKS).fill(false);
        const weeklyIn = productWeeklyIn[p.id] ?? Array(WEEKS).fill(false);
        const firstSale = weeklySales.findIndex((v) => v);
        const lastSale = weeklySales.reduceRight(
          (acc, v, i) => (acc === -1 && v ? i : acc),
          -1,
        );

        let quiebresContados = 0;
        if (firstSale !== -1 && lastSale !== -1 && lastSale > firstSale) {
          for (let wi = firstSale; wi <= lastSale; wi++) {
            // Si esta semana no tuvo ventas pero tuvo ventas antes y después
            if (!weeklySales[wi] && wi > firstSale && wi < lastSale) {
              // Verificar si hubo recepción en esta semana o la siguiente
              const huboRecepcion =
                weeklyIn[wi] || (wi + 1 < WEEKS && weeklyIn[wi + 1]);
              if (huboRecepcion) {
                quiebresContados++;
              }
            }
          }
        }

        const totalSalidas = outMoves
          .filter((m: any) => m.product_id?.[0] === p.id)
          .reduce((acc: number, m: any) => acc + (m.product_uom_qty || 0), 0);

        const semanasConVenta = weeklySales.filter(Boolean).length;
        const stockActual = stockMap[p.id] ?? 0;

        return {
          id: p.id,
          codigo: p.default_code
            ? String(p.default_code).trim()
            : `PROD-${p.id}`,
          name: p.name,
          categoria: p.categ_id?.[1] ?? "Sin categoría",
          stockActual,
          totalSalidas180d: Math.round(totalSalidas),
          semanasConVenta,
          quiebresContados,
          frecuenciaQuiebre:
            WEEKS > 0 ? Math.round((quiebresContados / WEEKS) * 100) : 0,
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
