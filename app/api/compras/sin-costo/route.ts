import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

// Empresa (company_id) → { warehouseId, nombre }
const SEDES = [
  { companyId: 9,  warehouseId: 9,  nombre: "Valencia" },
  { companyId: 10, warehouseId: 10, nombre: "Caracas" },
  { companyId: 7,  warehouseId: 11, nombre: "Panamá" },
];

const sinCostoCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;

    const cacheKey = `compras_sin_costo_v2_sede${sedeId ?? "todas"}`;
    const cached = sinCostoCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return NextResponse.json({ success: true, total: cached.data.length, data: cached.data });
    }

    // Paso 1: obtener lot_stock_id de cada almacén principal
    const warehouseIds = SEDES.map((s) => s.warehouseId);
    const warehouseData = await callOdooRPC<any[]>(
      "stock.warehouse",
      "search_read",
      [[["id", "in", warehouseIds]]],
      { fields: ["id", "lot_stock_id"], limit: 0 },
    );

    // warehouseId → locationId
    const whToLoc: Record<number, number> = {};
    if (warehouseData) {
      warehouseData.forEach((w: any) => {
        const locId = w.lot_stock_id?.[0];
        if (locId) whToLoc[w.id] = locId;
      });
    }

    // Paso 2: por cada sede, obtener stock disponible por producto
    // stockBySede: productId → { sedeName → qty }
    const stockBySede: Record<number, Record<string, number>> = {};

    for (const sede of SEDES) {
      const locId = whToLoc[sede.warehouseId];
      if (!locId) continue;

      const quants = await callOdooRPC<any[]>(
        "stock.quant",
        "search_read",
        [[["location_id", "child_of", locId], ["product_id", "!=", false]]],
        { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
      );

      if (!quants) continue;
      quants.forEach((q: any) => {
        if (!q.product_id) return;
        const pId = q.product_id[0];
        const qty = Math.max(0, q.quantity - q.reserved_quantity);
        if (qty <= 0) return;
        if (!stockBySede[pId]) stockBySede[pId] = {};
        stockBySede[pId][sede.nombre] = (stockBySede[pId][sede.nombre] ?? 0) + qty;
      });
    }

    const productIdsConStock = Object.keys(stockBySede).map(Number);
    if (productIdsConStock.length === 0) {
      return NextResponse.json({ success: true, total: 0, data: [] });
    }

    // Paso 3: traer info básica de productos
    const productos = await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "in", productIdsConStock], ["active", "=", true], ["type", "=", "product"]]],
      { fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"], limit: 0 },
    );
    if (!productos) throw new Error("Error obteniendo productos");

    const tmplIds = [...new Set(productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];

    // productId → product_tmpl_id
    const prodToTmpl: Record<number, number> = {};
    productos.forEach((p: any) => {
      if (p.product_tmpl_id?.[0]) prodToTmpl[p.id] = p.product_tmpl_id[0];
    });

    // Paso 4: leer standard_price por empresa con contexto explícito
    // costBySede: tmplId → { sedeName → precio }
    const costBySede: Record<number, Record<string, number>> = {};

    for (const sede of SEDES) {
      const prices = await callOdooRPC<any[]>(
        "product.template",
        "search_read",
        [[["id", "in", tmplIds]]],
        {
          fields: ["id", "standard_price"],
          limit: 0,
          context: { allowed_company_ids: [sede.companyId] },
        },
      );
      if (!prices) continue;
      prices.forEach((t: any) => {
        if (!costBySede[t.id]) costBySede[t.id] = {};
        costBySede[t.id][sede.nombre] = Number(t.standard_price) || 0;
      });
    }

    // Paso 5: construir resultado
    // Un producto aparece si en al menos una sede tiene stock > 0 Y costo = 0 en esa sede
    const resultado: {
      id: number;
      codigo: string;
      name: string;
      categoria: string;
      stockTotal: number;
      stockPorSede: Record<string, number>;
      sinCostoEn: string[];
    }[] = [];

    for (const prod of productos) {
      const tmplId = prodToTmpl[prod.id];
      const stockSedes = stockBySede[prod.id] ?? {};
      const costoSedes = tmplId ? (costBySede[tmplId] ?? {}) : {};

      // Sedes donde tiene stock Y no tiene costo
      const sinCostoEn = Object.entries(stockSedes)
        .filter(([sedeName, qty]) => qty > 0 && (costoSedes[sedeName] ?? 0) === 0)
        .map(([sedeName]) => sedeName);

      if (sinCostoEn.length === 0) continue;

      // Solo el stock de las sedes donde no tiene costo
      const stockSinCosto: Record<string, number> = {};
      sinCostoEn.forEach((sedeName) => {
        stockSinCosto[sedeName] = stockSedes[sedeName] ?? 0;
      });
      const stockTotal = Object.values(stockSinCosto).reduce((a, b) => a + b, 0);

      resultado.push({
        id: prod.id,
        codigo: prod.default_code ? String(prod.default_code).trim() : `PROD-${prod.id}`,
        name: prod.name,
        categoria: prod.categ_id?.[1] ?? "Sin categoría",
        stockTotal,
        stockPorSede: stockSinCosto,
        sinCostoEn,
      });
    }

    resultado.sort((a, b) => b.stockTotal - a.stockTotal);

    // Filtrar por sede si se especificó
    let final = resultado;
    if (sedeId) {
      const sedeNombre = SEDES.find((s) => s.companyId === sedeId)?.nombre;
      if (sedeNombre) {
        final = resultado.filter((p) => p.sinCostoEn.includes(sedeNombre));
      }
    }

    sinCostoCache.set(cacheKey, { data: final, ts: Date.now() });
    return NextResponse.json({ success: true, total: final.length, data: final });
  } catch (error: any) {
    console.error("❌ Error en API sin-costo:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
