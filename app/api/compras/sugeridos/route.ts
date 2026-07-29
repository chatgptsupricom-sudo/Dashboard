import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const sugeridosCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL = 10 * 60 * 1000;

const MAIN_WAREHOUSE_BY_COMPANY: Record<number, number> = {
  9: 9,
  10: 10,
  7: 11,
};

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

// Prioridad de acción para ordenar: quiebre primero, luego riesgo, luego ok
function prioridadAccion(accion: string): number {
  if (accion.includes("QUIEBRE")) return 0;
  if (accion.includes("RIESGO")) return 1;
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
    const cacheKey = `compras_sugeridos_v7_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
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
          ["move_id.move_type", "in", ["out_invoice", "out_refund", "out_receipt"]],
          ["move_id.state", "=", "posted"],
          ["move_id.invoice_date", ">=", fechaDesde],
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
    if (productIds.length === 0)
      return NextResponse.json({ success: true, data: [] });

    const productCompanyFilter: any[] = sedeId
      ? [["company_id", "in", [sedeId, false]]]
      : [["company_id", "in", [9, 10, 7, false]]];

    const [productos] = await Promise.all([
      callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [
          [
            ["id", "in", productIds],
            ["active", "=", true],
            ...productCompanyFilter,
          ],
        ],
        {
          fields: ["id", "default_code", "name", "categ_id", "product_tmpl_id", "qty_available"],
          limit: 0,
        },
      ),
    ]);

    if (!productos) throw new Error("Error obteniendo productos");

    const validProductIds = new Set((productos || []).map((p: any) => p.id));

    const stockMap: Record<number, number> = {};
    (productos || []).forEach((p: any) => {
      stockMap[p.id] = Math.max(0, p.qty_available || 0);
    });

    const tmplIds = [
      ...new Set(
        productos.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean),
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
        const costo = tmplId ? (tmplPriceMap[tmplId] ?? 0) : 0;
        const moqRaw = moqMap.get(codigo);
        const tieneMoq = moqRaw !== undefined && moqRaw > 0;
        const moq = tieneMoq ? moqRaw! : 0;
        const abc = abcMap[pId] || "C";

        const diasInvDeseado = abc === "A" ? 60 : abc === "B" ? 45 : 30;
        const stockSeguridad = abc === "A" ? 2 : abc === "B" ? 1 : 0;
        const demandaDiaria = ventas45d / 45;
        const puntoReorden = demandaDiaria * ETA_DIAS + stockSeguridad;
        const stockObjetivo = demandaDiaria * diasInvDeseado;
        const diasInvActual = demandaDiaria > 0 ? stock / demandaDiaria : 999;

        // Mostrar todos los productos bajo punto de reorden, con o sin MOQ
        if (stock > puntoReorden) return null;

        let cantidadAComprar = 0;
        if (tieneMoq) {
          const gap = stockObjetivo - stock;
          if (gap > 0) cantidadAComprar = Math.ceil(gap / moq) * moq;
        }

        const valorAComprar = cantidadAComprar * costo;

        let accion = "✅ Stock OK";
        if (stock <= 0) accion = "🚨 QUIEBRE TOTAL";
        else if (stock <= puntoReorden) accion = "⚠️ RIESGO: Quiebre Inminente";

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
          accion,
          fechaQuiebreEstimada,
        };
      })
      .filter(Boolean)
      // Ordenar: quiebre primero, luego riesgo, luego por ventas45d desc
      .sort((a: any, b: any) => {
        const pa = prioridadAccion(a.accion);
        const pb = prioridadAccion(b.accion);
        if (pa !== pb) return pa - pb;
        return b.ventas45d - a.ventas45d;
      });

    sugeridosCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("❌ Error en API Sugeridos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
