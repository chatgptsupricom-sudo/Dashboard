import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

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
    const cacheKey = `compras_sugeridos_v9_${rawCids || "default"}_sede${sedeId ?? "todas"}`;
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

    const companyFilter: any[] = sedeId
      ? [["company_id", "in", [sedeId, false]]]
      : [["company_id", "in", [9, 10, 7, false]]];

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

    async function fetchAllTemplates(): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const page = await callOdooRPC<any[]>(
          "product.template",
          "search_read",
          [
            [
              ["sale_ok", "=", true],
              ["purchase_ok", "=", true],
              ...companyFilter,
            ],
          ],
          {
            fields: [
              "id", "name", "default_code", "categ_id", "company_id",
              "standard_price", "product_variant_ids",
            ],
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

    const [templates, lines45, lines365, moqResult] = await Promise.all([
      fetchAllTemplates(),
      fetchInvoiceLines(str45),
      fetchInvoiceLines(str365),
      query("SELECT sku, cantidad FROM moqs"),
    ]);

    const allTmplIds = (templates || []).map((t: any) => t.id);

    const variants = allTmplIds.length > 0
      ? await callOdooRPC<any[]>(
          "product.product",
          "search_read",
          [
            [
              ["product_tmpl_id", "in", allTmplIds],
              ["active", "=", true],
            ],
          ],
          {
            fields: ["id", "default_code", "product_tmpl_id"],
            limit: 0,
          },
        )
      : [];

    const variantIdsByTmpl: Record<number, number[]> = {};
    const variantIdToTmpl: Record<number, number> = {};
    (variants || []).forEach((v: any) => {
      const tid = v.product_tmpl_id?.[0];
      if (!tid) return;
      if (!variantIdsByTmpl[tid]) variantIdsByTmpl[tid] = [];
      variantIdsByTmpl[tid].push(v.id);
      variantIdToTmpl[v.id] = tid;
    });

    const allVariantIds = (variants || []).map((v: any) => v.id);

    const stockData = allVariantIds.length > 0
      ? await callOdooRPC<any[]>(
          "stock.quant",
          "search_read",
          [
            [
              ["location_id.usage", "=", "internal"],
              ["product_id", "in", allVariantIds],
              ...companyFilter,
            ],
          ],
          { fields: ["product_id", "quantity", "reserved_quantity"], limit: 0 },
        )
      : [];

    const stockByVariant: Record<number, number> = {};
    if (stockData) {
      (stockData as any[]).forEach((s: any) => {
        if (!s.product_id) return;
        const vid = s.product_id[0];
        const disponible = Math.max(0, (s.quantity || 0) - (s.reserved_quantity || 0));
        stockByVariant[vid] = (stockByVariant[vid] || 0) + disponible;
      });
    }

    const stockByTmpl: Record<number, number> = {};
    for (const [vidStr, qty] of Object.entries(stockByVariant)) {
      const vid = Number(vidStr);
      const tid = variantIdToTmpl[vid];
      if (tid) {
        stockByTmpl[tid] = (stockByTmpl[tid] || 0) + qty;
      }
    }

    const stats45ByVariant: Record<number, { unidades: number; ingresos: number }> = {};
    lines45.forEach((l: any) => {
      if (!l.product_id) return;
      const vid = l.product_id[0];
      if (!stats45ByVariant[vid]) stats45ByVariant[vid] = { unidades: 0, ingresos: 0 };
      stats45ByVariant[vid].unidades += l.quantity || 0;
      stats45ByVariant[vid].ingresos += l.price_subtotal || 0;
    });

    const stats365ByVariant: Record<number, number> = {};
    lines365.forEach((l: any) => {
      if (!l.product_id) return;
      const vid = l.product_id[0];
      stats365ByVariant[vid] = (stats365ByVariant[vid] || 0) + (l.quantity || 0);
    });

    const stats45ByTmpl: Record<number, { unidades: number; ingresos: number }> = {};
    const stats365ByTmpl: Record<number, number> = {};
    for (const [vidStr, stats] of Object.entries(stats45ByVariant)) {
      const vid = Number(vidStr);
      const tid = variantIdToTmpl[vid];
      if (tid) {
        if (!stats45ByTmpl[tid]) stats45ByTmpl[tid] = { unidades: 0, ingresos: 0 };
        stats45ByTmpl[tid].unidades += stats.unidades;
        stats45ByTmpl[tid].ingresos += stats.ingresos;
      }
    }
    for (const [vidStr, qty] of Object.entries(stats365ByVariant)) {
      const vid = Number(vidStr);
      const tid = variantIdToTmpl[vid];
      if (tid) {
        stats365ByTmpl[tid] = (stats365ByTmpl[tid] || 0) + qty;
      }
    }

    const moqMap = new Map(
      (moqResult as any).rows.map((m: any) => [m.sku, Number(m.cantidad)]),
    );

    const abcInput = Object.keys(stats365ByTmpl)
      .map(Number)
      .map((id) => ({ id, ventas365d: stats365ByTmpl[id] || 0 }));
    const abcMap = clasificarABC(abcInput);

    const result: any[] = [];

    for (const tmpl of templates || []) {
      const tmplId = tmpl.id;
      const stock = stockByTmpl[tmplId] || 0;
      const ventas45d = Math.round(stats45ByTmpl[tmplId]?.unidades || 0);
      const ventas365d = Math.round(stats365ByTmpl[tmplId] || 0);
      const costo = Number(tmpl.standard_price) || 0;

      const codigo = tmpl.default_code
        ? String(tmpl.default_code).trim()
        : `TMPL-${tmplId}`;
      const moqRaw = moqMap.get(codigo);
      const tieneMoq = moqRaw !== undefined && moqRaw > 0;
      const moq = tieneMoq ? moqRaw! : 0;
      const abc = abcMap[tmplId] || "C";

      const diasInvDeseado = abc === "A" ? 60 : abc === "B" ? 45 : 30;
      const stockSeguridad = abc === "A" ? 2 : abc === "B" ? 1 : 0;
      const demandaDiaria = ventas45d / 45;
      const puntoReorden = demandaDiaria * ETA_DIAS + stockSeguridad;
      const stockObjetivo = demandaDiaria * diasInvDeseado;
      const diasInvActual = demandaDiaria > 0 ? stock / demandaDiaria : 999;

      if (stock > puntoReorden) continue;

      let cantidadAComprar = 0;
      if (tieneMoq) {
        const gap = stockObjetivo - stock;
        if (gap > 0) cantidadAComprar = Math.ceil(gap / moq) * moq;
      }

      const valorAComprar = cantidadAComprar * costo;

      let accion = "Stock OK";
      if (stock <= 0) accion = "QUIEBRE TOTAL";
      else if (stock <= puntoReorden) accion = "RIESGO: Quiebre Inminente";

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

      result.push({
        id: tmplId,
        codigo,
        name: tmpl.name || codigo,
        marca: tmpl.name
          ? tmpl.name.split(" ")[0].toUpperCase()
          : "SIN MARCA",
        categoria: tmpl.categ_id ? tmpl.categ_id[1] : "Sin Categoría",
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
      });
    }

    result.sort((a: any, b: any) => {
      const pa = prioridadAccion(a.accion);
      const pb = prioridadAccion(b.accion);
      if (pa !== pb) return pa - pb;
      return b.ventas45d - a.ventas45d;
    });

    sugeridosCache.set(cacheKey, { data: result, ts: Date.now() });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error("Error en API Sugeridos:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
