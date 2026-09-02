import { query } from "@/lib/db";
import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Cache en memoria — válido porque el servidor es node server.js (no serverless)
const aiCache = new Map<
  string,
  { results: any[]; productNames: Record<number, string>; ts: number }
>();
const AI_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 horas

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") || "all";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    // Unica fuente de verdad: el JWT de la cookie. Un fallback a ?userId= de
    // la URL dejaba entrar sin cookie con solo adivinar un id.
    const token = request.cookies.get("token")?.value;
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const mysqlId = Number((payload as any).sub || 0);

    if (!mysqlId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { rows } = await query(
      "SELECT cids FROM users_config WHERE id = ? LIMIT 1",
      [mysqlId],
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no configurado" },
        { status: 404 },
      );
    }

    const userCids = rows[0].cids;

    // Helper: companyFilter shared by both domains
    const companyFilter: any[] = [];
    if (companyId !== "all") {
      companyFilter.push(["company_id", "=", parseInt(companyId, 10)]);
    } else if (userCids !== null && userCids !== "null" && userCids !== "") {
      const cids = typeof userCids === "number"
        ? [userCids]
        : String(userCids).split(",").map((id: string) => parseInt(id.trim(), 10));
      companyFilter.push(["company_id", "in", cids]);
    }

    // ── Dominio con fecha (Monto/Volumen) ────────────────────────────────────
    const orderDomain: any[] = [
      ["state", "in", ["sale", "done"]],
      ...companyFilter,
    ];
    if (startDate)
      orderDomain.push(["date_order", ">=", `${startDate} 00:00:00`]);
    if (endDate) orderDomain.push(["date_order", "<=", `${endDate} 23:59:59`]);

    // ── Dominio sin fecha (Alertas — historial completo) ─────────────────────
    const allTimeDomain: any[] = [
      ["state", "in", ["sale", "done"]],
      ...companyFilter,
    ];

    const PAGE = 5000;

    async function fetchOrders(domain: any[]): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      while (true) {
        const page = await callOdooRPC<any[]>(
          "sale.order",
          "search_read",
          [domain],
          {
            fields: [
              "id",
              "partner_id",
              "date_order",
              "amount_untaxed",
              "user_id",
            ],
            order: "date_order asc",
            limit: PAGE,
            offset,
          },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
        if (result.length >= 100000) break;
      }
      return result;
    }

    // ── 1. Traer pedidos (filtrados por fecha para Monto/Volumen) ────────────
    // Si no hay startDate, orders ya cubre todo el historial → reutilizar
    const orders = await fetchOrders(orderDomain);
    const allTimeOrders = startDate ? await fetchOrders(allTimeDomain) : orders;

    if (!orders || orders.length === 0) {
      return NextResponse.json({ topClients: [], inactiveClients: [] });
    }

    // ── 2. Agregar stats por cliente desde los pedidos ───────────────────────
    type ClientStat = {
      id: number;
      name: string;
      total_spent: number;
      order_dates: Date[];
      order_amounts: { date: Date; amount: number }[];
      vendedor: string;
      brands: Record<string, number>;
      products: Record<string, number>;
      product_ids: Set<number>;
    };

    function buildClientStats(orderList: any[]): Record<number, ClientStat> {
      const stats: Record<number, ClientStat> = {};
      orderList.forEach((o) => {
        if (!o.partner_id) return;
        const cId = o.partner_id[0];
        const cName = o.partner_id[1];
        const amount = o.amount_untaxed || 0;
        const date = new Date(o.date_order);
        const vendedor = o.user_id?.[1] || "Sin asignar";

        if (!stats[cId]) {
          stats[cId] = {
            id: cId,
            name: cName,
            total_spent: 0,
            order_dates: [],
            order_amounts: [],
            vendedor,
            brands: {},
            products: {},
            product_ids: new Set(),
          };
        }
        stats[cId].total_spent += amount;
        stats[cId].order_dates.push(date);
        stats[cId].order_amounts.push({ date, amount });
        stats[cId].vendedor = vendedor;
      });
      return stats;
    }

    const clientStats = buildClientStats(orders);
    const allTimeClientStats = buildClientStats(allTimeOrders);

    // ── 3. Traer líneas solo para producto/marca ─────────────────────────────
    // All-time lines (no date filter) — needed for Alertas brand/product data
    const allTimeLineDomain: any[] = [
      ["order_id.state", "in", ["sale", "done"]],
      ...companyFilter,
    ];

    async function fetchLines(domain: any[]): Promise<any[]> {
      let result: any[] = [];
      let offset = 0;
      const LINE_PAGE = 5000;
      while (true) {
        const page = await callOdooRPC<any[]>(
          "sale.order.line",
          "search_read",
          [domain],
          {
            fields: [
              "product_id",
              "product_uom_qty",
              "price_subtotal",
              "order_partner_id",
            ],
            limit: LINE_PAGE,
            offset,
          },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < LINE_PAGE) break;
        offset += LINE_PAGE;
        if (result.length >= 200000) break;
      }
      return result;
    }

    // Fetch all-time lines (covers allTimeClientStats) — filtered lines are a subset
    const saleLines = await fetchLines(allTimeLineDomain);

    const productNames: Record<number, string> = {};

    saleLines.forEach((line) => {
      if (!line.order_partner_id) return;
      const cId = line.order_partner_id[0];
      const pId = line.product_id?.[0];
      const pName = line.product_id?.[1] || "";
      const qty = line.product_uom_qty || 0;
      const amount = line.price_subtotal || 0;

      if (pId) productNames[pId] = pName;

      // Enrich both clientStats (filtered) and allTimeClientStats with brand/product info
      for (const stats of [clientStats, allTimeClientStats]) {
        if (!stats[cId]) continue;
        if (pName) {
          const cleanName = pName.replace(/^\[.*?\]\s*/, "").trim();
          const brand = cleanName.split(" ")[0].toUpperCase() || "OTROS";
          stats[cId].brands[brand] = (stats[cId].brands[brand] || 0) + amount;
        }
        if (pId) {
          stats[cId].products[pName] = (stats[cId].products[pName] || 0) + qty;
          stats[cId].product_ids.add(pId);
        }
      }
    });

    // ── 4. Calcular métricas finales ─────────────────────────────────────────
    const today = new Date();

    function buildClientMetrics(
      stats: Record<number, ClientStat>,
      includeAmountFields = false,
    ) {
      return Object.values(stats).map((c) => {
        const dates = c.order_dates.sort((a, b) => a.getTime() - b.getTime());
        const ordersCount = dates.length;
        const lastDate = dates[dates.length - 1];
        const daysInactive = Math.floor(
          (today.getTime() - lastDate.getTime()) / 86400000,
        );

        const twelveMonthsAgo = new Date(today);
        twelveMonthsAgo.setFullYear(today.getFullYear() - 1);
        const recentDates = dates.filter((d) => d >= twelveMonthsAgo);
        const uniqueDays = [
          ...new Set(recentDates.map((d) => d.toISOString().split("T")[0])),
        ].sort();
        let avgInterval = 0;
        if (uniqueDays.length >= 2) {
          const spanDays =
            (new Date(uniqueDays[uniqueDays.length - 1]).getTime() -
              new Date(uniqueDays[0]).getTime()) /
            86400000;
          avgInterval = spanDays / (uniqueDays.length - 1);
        }

        const topBrand =
          Object.entries(c.brands).sort(([, a], [, b]) => b - a)[0]?.[0] ||
          "N/A";
        const topProduct =
          Object.entries(c.products).sort(([, a], [, b]) => b - a)[0]?.[0] ||
          "N/A";
        const topBrands = Object.entries(c.brands)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 3)
          .map(([name, amt]) => ({ name, amount: amt }));

        const base: any = {
          id: c.id,
          name: c.name,
          total_spent: c.total_spent,
          orders_count: ordersCount,
          days_inactive: daysInactive,
          avg_interval: Math.round(avgInterval),
          vendedor: c.vendedor,
          top_brand: topBrand,
          top_product: topProduct,
          top_brands: topBrands,
          product_ids: Array.from(c.product_ids),
          ai_insight: "",
          upsell_suggestion: "",
        };

        if (includeAmountFields) {
          const sorted = [...c.order_amounts].sort(
            (a, b) => a.date.getTime() - b.date.getTime(),
          );
          base.last_order_amount = sorted[sorted.length - 1]?.amount ?? 0;
          base.avg_order_amount =
            ordersCount > 0 ? c.total_spent / ordersCount : 0;
        }

        return base;
      });
    }

    const allClients = buildClientMetrics(clientStats);
    const allClientsAllTime = buildClientMetrics(allTimeClientStats, true);

    const topClients = [...allClients].sort(
      (a, b) => b.total_spent - a.total_spent,
    );

    // Churn: usa historial completo (sin filtro de fecha)
    const inactiveClients = allClientsAllTime
      .filter((c) => {
        if (c.orders_count < 3) return false;
        if (c.days_inactive <= 40) return false;
        if (c.avg_interval === 0) return true;
        const threshold = Math.max(40, Math.round(c.avg_interval * 1.5));
        return c.days_inactive > threshold;
      })
      .sort((a, b) => b.days_inactive - a.days_inactive);

    // ── 5. OpenAI con cache en memoria (TTL 6h por filtro) ──────────────────
    if (process.env.OPENAI_API_KEY) {
      try {
        const cacheKey = `${companyId}|${startDate}|${endDate}`;
        const cached = aiCache.get(cacheKey);
        const now = Date.now();

        let aiResults: Array<{
          client_id: number;
          ai_insight: string;
          upsell_id: number | null;
        }> = [];
        let aiProductNames: Record<number, string> = productNames;

        if (cached && now - cached.ts < AI_CACHE_TTL) {
          // Usar resultados cacheados
          aiResults = cached.results;
          aiProductNames = cached.productNames;
        } else {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

          // Índice marca → productos (para filtrar catálogo por cliente)
          const brandToProducts: Record<
            string,
            Array<{ id: number; name: string }>
          > = {};
          Object.entries(productNames).forEach(([idStr, name]) => {
            const clean = name.replace(/^\[.*?\]\s*/, "").trim();
            const brand = clean.split(" ")[0].toUpperCase() || "OTROS";
            if (!brandToProducts[brand]) brandToProducts[brand] = [];
            brandToProducts[brand].push({ id: Number(idStr), name });
          });

          // top 10 monto + top 10 volumen + primeros 30 inactivos (máx 50)
          const seenIds = new Set<number>();
          const aiTargets: any[] = [];
          for (const c of [
            ...topClients.slice(0, 10),
            ...[...allClients]
              .sort((a, b) => b.orders_count - a.orders_count)
              .slice(0, 10),
            ...inactiveClients.slice(0, 30),
          ]) {
            if (!seenIds.has(c.id)) {
              seenIds.add(c.id);
              aiTargets.push(c);
            }
            if (aiTargets.length >= 50) break;
          }

          // Fallback catalog: top 40 productos más frecuentes del catálogo general
          const fallbackCatalog = Object.entries(productNames)
            .slice(0, 40)
            .map(([id, name]) => ({ id: Number(id), name }));

          const clientsForAI = aiTargets.map((c) => {
            const boughtSet = new Set(c.product_ids);
            // Catálogo relevante: marcas habituales que NO ha comprado
            let relevantCatalog = (c.top_brands as any[])
              .flatMap((b: any) => brandToProducts[b.name] || [])
              .filter((p) => !boughtSet.has(p.id))
              .slice(0, 15);
            // Fallback si no hay productos relevantes
            if (relevantCatalog.length === 0) {
              relevantCatalog = fallbackCatalog
                .filter((p) => !boughtSet.has(p.id))
                .slice(0, 10);
            }

            return {
              id: c.id,
              name: c.name,
              total_spent: Math.round(c.total_spent),
              orders_count: c.orders_count,
              days_inactive: c.days_inactive,
              avg_interval_days: c.avg_interval,
              vendedor: c.vendedor,
              top_brand: c.top_brand,
              top_product: c.top_product,
              relevant_catalog: relevantCatalog,
            };
          });

          const systemPrompt = `Eres el Agente Comercial IA de SUPRICOM, mayorista de tecnología en Venezuela.
Cada cliente trae su propio "relevant_catalog": productos de sus marcas habituales que NUNCA ha comprado.
Analiza y devuelve:
1. "ai_insight": 1 oración concisa sobre su perfil y la acción que debe tomar su vendedor. Menciona al vendedor por nombre.
2. "upsell_id": elige el ID más apropiado de relevant_catalog del cliente. Si está vacío devuelve null.

REGLAS:
- Solo puedes elegir IDs que estén en el relevant_catalog de ESE cliente específico.
- Cada cliente debe recibir una sugerencia DIFERENTE y personalizada a lo que compra.
- Si days_inactive > avg_interval_days * 1.5, el insight debe mencionar urgencia de reactivación.
- Sé breve y directo.

Devuelve SOLO JSON válido:
{"results": [{"client_id": 123, "ai_insight": "...", "upsell_id": 456}]}`;

          const completion = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            temperature: 0.2,
            max_tokens: 8192,
            messages: [
              { role: "system", content: systemPrompt },
              {
                role: "user",
                content: JSON.stringify({ clients: clientsForAI }),
              },
            ],
          });

          const raw = completion.choices[0]?.message?.content || "{}";
          aiResults = JSON.parse(raw).results || [];
          aiCache.set(cacheKey, { results: aiResults, productNames, ts: now });
        }

        const applyAI = (list: any[]) => {
          list.forEach((c) => {
            const match = aiResults.find((r) => r.client_id === c.id);
            if (match) {
              c.ai_insight = match.ai_insight || "";
              c.upsell_suggestion =
                match.upsell_id && aiProductNames[match.upsell_id]
                  ? aiProductNames[match.upsell_id]
                  : "";
            }
          });
        };
        applyAI(topClients);
        applyAI(inactiveClients);
      } catch (aiError) {
        console.error("⚠️ IA clientes falló:", aiError);
      }
    }

    // Limpiar campos internos
    [...topClients, ...inactiveClients].forEach((c) => {
      delete (c as any).product_ids;
    });

    return NextResponse.json({ topClients, inactiveClients });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
