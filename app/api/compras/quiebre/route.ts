import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const quiebreCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = {
  9: 9,
  10: 10,
  7: 11,
};

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
    const cacheKey = `compras_quiebre_v11_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
    const cached = quiebreCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json(
        { success: true, data: cached.data },
        { status: 200 },
      );
    }

    // Paso 1: obtener lot_stock_id de los almacenes principales conocidos.
    const warehouseIds = sedeId
      ? [MAIN_WAREHOUSE_BY_COMPANY[sedeId]].filter(Boolean)
      : Object.values(MAIN_WAREHOUSE_BY_COMPANY);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "name", "lot_stock_id"], limit: 0 },
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
    const stockDomain: any[] = locationIds.length > 0
      ? [["location_id", "child_of", locationIds]]
      : [["location_id.usage", "=", "internal"], ...(sedeId ? [["company_id", "=", sedeId]] : [])];
    const stockPromise = callOdooRPC<any[]>(
      "stock.quant",
      "search_read",
      [stockDomain],
      { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
    );
    const moqPromise = query("SELECT sku, cantidad FROM moqs");

    const [productsData, stockData, moqResult] = await Promise.all([
      productPromise,
      stockPromise,
      moqPromise,
    ]);
    if (!productsData) throw new Error("Error obteniendo productos");

    // Paso 2: traer standard_price desde product.template SIN contexto de empresa.
    // El usuario de servicio (uid=388) tiene acceso a los costos de su empresa por defecto.
    // Pasar allowed_company_ids del usuario del dashboard puede hacer que Odoo devuelva 0
    // si el costo está registrado en otra empresa.
    const tmplIds = [
      ...new Set(
        productsData.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean),
      ),
    ];
    const tmplPrices = await callOdooRPC<any[]>(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      { fields: ["id", "standard_price"], limit: 0 },
    );
    const tmplPriceMap: Record<number, number> = {};
    if (tmplPrices) {
      tmplPrices.forEach((t: any) => {
        tmplPriceMap[t.id] = Number(t.standard_price) || 0;
      });
    }
    const priceMap: Record<number, number> = {};
    productsData.forEach((p: any) => {
      const tmplId = p.product_tmpl_id?.[0];
      priceMap[p.id] = tmplId ? (tmplPriceMap[tmplId] ?? 0) : 0;
    });

    // Velocidad reciente: últimos 45 días basada en facturas confirmadas
    // Se excluyen socios con "Supricom" en el nombre (ventas intercompany)
    const today = new Date();
    const date45DaysAgo = new Date();
    date45DaysAgo.setDate(today.getDate() - 45);
    const date45Str = date45DaysAgo.toISOString().split("T")[0];

    const invoiceLineDomain: any[] = [
      ["move_id.move_type", "in", ["out_invoice", "out_receipt"]],
      ["move_id.state", "=", "posted"],
      ["move_id.invoice_date", ">=", date45Str],
      ["move_id.partner_id.name", "not ilike", "supricom"],
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

    // Construir stockMap una sola vez (evita O(n²) y asegura precisión)
    const stockMap: Record<number, number> = {};
    if (stockData) {
      (stockData as any[]).forEach((s) => {
        if (!s.product_id) return;
        const id = s.product_id[0];
        stockMap[id] = (stockMap[id] ?? 0) + Math.max(0, s.quantity - s.reserved_quantity);
      });
    }
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
