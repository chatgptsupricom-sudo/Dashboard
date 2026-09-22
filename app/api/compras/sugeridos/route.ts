import { query } from "@/lib/db";
import { MAIN_WAREHOUSE_BY_COMPANY } from "@/lib/compras/constants";
import { getPendingPurchaseQtyByProduct } from "@/lib/compras/purchaseOrders";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

/**
 * GET /api/compras/sugeridos?sede=9
 *
 * Devuelve los datos de entrada de la hoja de analisis del comprador, uno por
 * producto vendido en el ultimo ano en la sede: fisico, reservado, transito,
 * ventas 45d/365d, MOQ, costo, y el ETA y la compra manual que cargo Compras.
 * El calculo (lib/compras/sugeridos.ts) lo hace la pantalla, para que al
 * cambiar un ETA o una compra manual se recalcule al instante.
 *
 * Lo de Odoo se cachea 10 minutos; los ajustes del comprador se leen siempre,
 * para que lo que acaba de cargar no se pierda al recargar.
 */

const odooCache = new Map<string, { data: FilaOdoo[]; warning?: string; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

type FilaOdoo = {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  fisico: number;
  reservado: number;
  transito: number;
  ventas45d: number;
  ventas365d: number;
  moq: number;
  costo: number;
};

async function leerDeOdoo(sedeId: number): Promise<{ data: FilaOdoo[]; warning?: string }> {
  const hoy = new Date();
  const fecha45 = new Date(hoy);
  fecha45.setDate(hoy.getDate() - 45);
  const fecha365 = new Date(hoy);
  fecha365.setDate(hoy.getDate() - 365);
  const str45 = fecha45.toISOString().split("T")[0];

  // Una sola lectura de 365 dias: las ventas de 45 son el subconjunto con
  // fecha >= hace 45 dias (antes se pedian dos veces a Odoo).
  let lineas: any[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [[
        ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
        ["move_id.state", "=", "posted"],
        ["move_id.invoice_date", ">=", fecha365.toISOString().split("T")[0]],
        ["move_id.partner_id.name", "not ilike", "supricom"],
        ["move_id.partner_id.name", "not ilike", "office solution"],
        ["product_id", "!=", false],
        ["move_id.company_id", "=", sedeId],
      ]],
      { fields: ["product_id", "quantity", "date", "move_type"], order: "id asc", limit: 5000, offset },
    );
    if (!page || page.length === 0) break;
    lineas = lineas.concat(page);
    if (page.length < 5000) break;
  }

  // Las notas de credito (out_refund) vienen con cantidad positiva en Odoo:
  // se restan. Antes se sumaban y inflaban las ventas (8276B001AA en Panama:
  // 5181 facturadas + 49 devueltas daba 5230 en vez de 5132).
  const v45: Record<number, number> = {};
  const v365: Record<number, number> = {};
  for (const l of lineas) {
    const id = l.product_id?.[0];
    if (!id) continue;
    const q = (Number(l.quantity) || 0) * (l.move_type === "out_refund" ? -1 : 1);
    v365[id] = (v365[id] || 0) + q;
    if (String(l.date || "") >= str45) v45[id] = (v45[id] || 0) + q;
  }

  // Productos con compra manual/ETA cargado en la sede entran aunque no
  // hayan vendido en el ano (el comprador los esta siguiendo).
  const ajustes = await leerAjustes(sedeId);
  const productIds = [
    ...new Set([
      ...Object.keys(v365).map(Number).filter((id) => v365[id] > 0),
      ...ajustes.keys(),
    ]),
  ];
  if (productIds.length === 0) return { data: [] };

  const companies = [sedeId];
  const warehouseId = MAIN_WAREHOUSE_BY_COMPANY[sedeId];
  const warehouseData = warehouseId
    ? await callOdooRPC<any[]>(
        "stock.warehouse",
        "search_read",
        [[["id", "=", warehouseId]]],
        { fields: ["id", "lot_stock_id"], limit: 0, context: { allowed_company_ids: companies } },
      )
    : [];
  const locationIds = (warehouseData || []).map((w: any) => w.lot_stock_id?.[0]).filter(Boolean);

  const stockDomain: any[] = [["product_id", "in", productIds], ["company_id", "=", sedeId]];
  stockDomain.push(
    locationIds.length > 0
      ? ["location_id", "child_of", locationIds]
      : ["location_id.usage", "=", "internal"],
  );

  const [productos, stockData, transito, moqResult] = await Promise.all([
    callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "in", productIds], ["active", "=", true]]],
      {
        fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id"],
        limit: 0,
        context: { allowed_company_ids: companies },
      },
    ),
    callOdooRPC<any[]>("stock.quant", "search_read", [stockDomain], {
      fields: ["product_id", "quantity", "reserved_quantity"],
      limit: 0,
      context: { allowed_company_ids: companies },
    }),
    getPendingPurchaseQtyByProduct(companies),
    query("SELECT sku, cantidad FROM moqs"),
  ]);
  if (!productos) throw new Error("Error obteniendo productos");

  // Fisico y reservado por separado, como las columnas C y D de la hoja.
  const fisico: Record<number, number> = {};
  const reservado: Record<number, number> = {};
  for (const s of stockData || []) {
    const id = s.product_id?.[0];
    if (!id) continue;
    fisico[id] = (fisico[id] || 0) + (Number(s.quantity) || 0);
    reservado[id] = (reservado[id] || 0) + (Number(s.reserved_quantity) || 0);
  }

  const costos = await leerCostos(productos, companies);
  const moqMap = new Map((moqResult as any).rows.map((m: any) => [m.sku, Number(m.cantidad)]));

  const data: FilaOdoo[] = productos.map((prod: any) => {
    const id = prod.id;
    const codigo = prod.default_code ? String(prod.default_code).trim() : `PROD-${id}`;
    const moq = Number(moqMap.get(codigo)) || 0;
    return {
      id,
      codigo,
      name: prod.name,
      // Primera palabra del nombre (hay nombres que empiezan con espacio).
      marca: String(prod.name || "").trim().split(/\s+/)[0]?.toUpperCase() || "SIN MARCA",
      categoria: (prod.categ_id && String(prod.categ_id[1]).trim()) || "Sin Categoría",
      fisico: Math.round(fisico[id] || 0),
      reservado: Math.round(reservado[id] || 0),
      transito: Math.round(transito[id] || 0),
      ventas45d: Math.max(0, Math.round(v45[id] || 0)),
      ventas365d: Math.max(0, Math.round(v365[id] || 0)),
      // Sin MOQ cargado se usa 1, como la hoja (IFERROR(...;1)).
      moq: moq > 0 ? moq : 1,
      costo: costos(prod),
    };
  });

  const warning =
    locationIds.length > 0 && (!stockData || stockData.length === 0)
      ? "El almacén de esta sede no tiene stock registrado. Verificar ubicación principal (lot_stock_id) en Odoo."
      : undefined;
  return { data, warning };
}

/**
 * Costo por producto: standard_price del template en la sede, si no el del
 * product.product, si no el precio de proveedor (product.supplierinfo).
 */
async function leerCostos(productos: any[], companies: number[]) {
  const tmplIds = [...new Set(productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean))];
  const tmplPrice: Record<number, number> = {};
  for (const cid of companies) {
    const prices = await callOdooRPC<any[]>(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
    );
    for (const t of prices || []) {
      const val = Number(t.standard_price) || 0;
      if (val > 0) tmplPrice[t.id] = val;
    }
  }

  const sinCosto = productos.filter((p: any) => !tmplPrice[p.product_tmpl_id?.[0]]);
  const prodPrice: Record<number, number> = {};
  if (sinCosto.length > 0) {
    for (const cid of companies) {
      const prices = await callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["id", "in", sinCosto.map((p: any) => p.id)]]],
        { fields: ["id", "standard_price"], limit: 0, context: { allowed_company_ids: [cid] } },
      );
      for (const p of prices || []) {
        const val = Number(p.standard_price) || 0;
        if (val > 0) prodPrice[p.id] = val;
      }
    }
  }

  const tmplAunSinCosto = [
    ...new Set(sinCosto.filter((p: any) => !prodPrice[p.id]).map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean)),
  ];
  const supplierPrice: Record<number, number> = {};
  if (tmplAunSinCosto.length > 0) {
    const data = await callOdooRPC<any[]>(
      "product.supplierinfo",
      "search_read",
      [[["product_tmpl_id", "in", tmplAunSinCosto]]],
      { fields: ["product_tmpl_id", "price"], limit: 0 },
    );
    for (const s of data || []) {
      const tid = s.product_tmpl_id?.[0];
      const val = Number(s.price) || 0;
      if (tid && val > 0 && !supplierPrice[tid]) supplierPrice[tid] = val;
    }
  }

  return (prod: any): number => {
    const tid = prod.product_tmpl_id?.[0];
    return (tid && tmplPrice[tid]) || prodPrice[prod.id] || (tid && supplierPrice[tid]) || 0;
  };
}

type Ajuste = {
  eta_dias: number | null;
  compra_manual: number | null;
  actualizado_por: string | null;
  updated_at: string | null;
};

async function leerAjustes(sedeId: number): Promise<Map<number, Ajuste>> {
  try {
    const r = await query(
      `SELECT product_odoo_id, eta_dias, compra_manual, actualizado_por, updated_at
         FROM compras_sugeridos_ajustes WHERE cids = ?`,
      [sedeId],
    );
    return new Map(
      (r.rows as any[]).map((a) => [
        Number(a.product_odoo_id),
        {
          eta_dias: a.eta_dias === null ? null : Number(a.eta_dias),
          compra_manual: a.compra_manual === null ? null : Number(a.compra_manual),
          actualizado_por: a.actualizado_por,
          updated_at: a.updated_at,
        },
      ]),
    );
  } catch (e: any) {
    // Sin la migracion (sql/compras_sugeridos_ajustes.sql) la pantalla sigue
    // funcionando, solo que sin ETA/compra manual guardados.
    console.error("[Sugeridos] no se pudieron leer los ajustes:", e.message);
    return new Map();
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    // Siempre una sede: el ETA y la compra manual son por sucursal.
    const sedeId = Number(new URL(request.url).searchParams.get("sede")) || 9;
    if (!MAIN_WAREHOUSE_BY_COMPANY[sedeId]) {
      return NextResponse.json({ error: "Sede invalida" }, { status: 400 });
    }

    const cacheKey = `sugeridos_excel_v3_sede${sedeId}`;
    let cached = odooCache.get(cacheKey);
    if (!cached || Date.now() - cached.ts >= CACHE_TTL) {
      const leido = await leerDeOdoo(sedeId);
      cached = { ...leido, ts: Date.now() };
      odooCache.set(cacheKey, cached);
    }

    const ajustes = await leerAjustes(sedeId);
    const data = cached.data.map((p) => {
      const a = ajustes.get(p.id);
      return {
        ...p,
        eta: a?.eta_dias ?? null,
        compraManual: a?.compra_manual ?? null,
        ajustadoPor: a?.actualizado_por ?? null,
        ajustadoAt: a?.updated_at ?? null,
      };
    });

    return NextResponse.json({ success: true, sede: sedeId, data, warning: cached.warning });
  } catch (error: any) {
    console.error("❌ Error en API Sugeridos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
