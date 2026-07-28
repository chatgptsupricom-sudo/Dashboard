// import { query } from "@/lib/db";
// import { callOdooRPC } from "@/lib/odoo";
// import { NextResponse } from "next/server";
// import OpenAI from "openai";

// const openai = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
//   baseURL: "https://openrouter.ai/api/v1",
// });

// export async function GET(request: Request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const userId = searchParams.get("userId");

//     if (!userId) {
//       return NextResponse.json({ error: "Falta el userId" }, { status: 400 });
//     }

//     // 1. Restricción de empresas MySQL
//     const { rows } = await query(
//       "SELECT cids FROM users_config WHERE id = ? LIMIT 1",
//       [userId],
//     );

//     if (!rows || rows.length === 0) {
//       return NextResponse.json(
//         { error: "Usuario no configurado" },
//         { status: 404 },
//       );
//     }

//     const userCids = rows[0].cids;
//     const odooDomain: any[] = [["order_id.state", "in", ["sale", "done"]]];

//     if (userCids !== null && userCids !== "null" && userCids !== "") {
//       const companyIds = userCids
//         .split(",")
//         .map((id: string) => parseInt(id.trim(), 10));
//       odooDomain.push(["company_id", "in", companyIds]);
//     }

//     // 2. Traer líneas desde Odoo
//     const saleLines = await callOdooRPC<any[]>(
//       "sale.order.line",
//       "search_read",
//       [odooDomain],
//       {
//         fields: [
//           "product_id",
//           "product_uom_qty",
//           "price_subtotal",
//           "order_id",
//           "create_date",
//         ],
//         order: "create_date desc",
//         limit: 3000,
//       },
//     );

//     if (!saleLines || saleLines.length === 0) {
//       return NextResponse.json({
//         masVendidos: [],
//         mayorRotacion: [],
//         estancados: [],
//         msg: "No hay suficiente data comercial para generar analíticas.",
//       });
//     }

//     // 3. Procesamiento en memoria
//     const productStats: Record<number, any> = {};
//     const productNames: Record<number, string> = {};

//     saleLines.forEach((line) => {
//       if (!line.product_id) return;

//       const pId = line.product_id[0];
//       const pName = line.product_id[1];
//       const qty = line.product_uom_qty || 0;
//       const amount = line.price_subtotal || 0;
//       const date = new Date(line.create_date);

//       productNames[pId] = pName;

//       if (!productStats[pId]) {
//         productStats[pId] = {
//           id: pId,
//           name: pName,
//           total_qty: 0,
//           total_amount: 0,
//           order_count: 0,
//           last_sale_date: date,
//         };
//       }

//       productStats[pId].total_qty += qty;
//       productStats[pId].total_amount += amount;
//       productStats[pId].order_count += 1;
//       if (date > productStats[pId].last_sale_date) {
//         productStats[pId].last_sale_date = date;
//       }
//     });

//     const today = new Date();
//     const allProducts = Object.values(productStats).map((p: any) => {
//       const daysInactive = Math.floor(
//         (today.getTime() - p.last_sale_date.getTime()) / (1000 * 60 * 60 * 24),
//       );
//       return {
//         id: p.id,
//         name: p.name,
//         total_qty: p.total_qty,
//         total_amount: p.total_amount,
//         order_count: p.order_count,
//         days_inactive: daysInactive,
//         cross_sell_product: "", // Se llenará dinámicamente
//       };
//     });

//     const masVendidos = [...allProducts]
//       .sort((a, b) => b.total_amount - a.total_amount)
//       .slice(0, 8);
//     const mayorRotacion = [...allProducts]
//       .sort((a, b) => b.total_qty - a.total_qty)
//       .slice(0, 8);
//     const estancados = [...allProducts]
//       .filter((p) => p.days_inactive > 1)
//       .sort((a, b) => b.days_inactive - a.days_inactive)
//       .slice(0, 8);

//     // =========================================================================
//     // 4. EMBEDDED INTEL (FUNCIÓN DE CONTINGENCIA LOCAL INTELIGENTE POR CATEGORÍAS)
//     // =========================================================================
//     const getSmartFallback = (productName: string): string => {
//       const name = productName.toLowerCase();

//       // 1. Laptops, computadoras, servidores y hardware
//       if (
//         name.includes("laptop") ||
//         name.includes("notebook") ||
//         name.includes("pc") ||
//         name.includes("computadora") ||
//         name.includes("ideapad")
//       ) {
//         const foundMousOrBag = Object.values(productNames).find(
//           (n) =>
//             n.toLowerCase().includes("mouse") ||
//             n.toLowerCase().includes("teclado") ||
//             n.toLowerCase().includes("ups") ||
//             n.toLowerCase().includes("regulador"),
//         );
//         // 💡 Si no encuentra uno en el lote actual, le forzamos un accesorio real de tu inventario
//         return (
//           foundMousOrBag ||
//           "[HAVIT-MP845] HAVIT MP845 GAMING MOUSE PAD / ACCESORIO"
//         );
//       }

//       // 2. Componentes internos (Memorias RAM, SSD)
//       if (
//         name.includes("memoria") ||
//         name.includes("ram") ||
//         name.includes("ssd") ||
//         name.includes("disco")
//       ) {
//         const foundCasingOrCable = Object.values(productNames).find(
//           (n) =>
//             n.toLowerCase().includes("case") ||
//             n.toLowerCase().includes("regulador"),
//         );
//         return (
//           foundCasingOrCable ||
//           "[SBNB1800] SMARTBITT UPS SMART 1800VA 6 SALIDAS"
//         );
//       }

//       // 3. Impresoras y multifuncionales
//       if (
//         name.includes("impresora") ||
//         name.includes("ecotank") ||
//         name.includes("laserjet")
//       ) {
//         const foundInk = Object.values(productNames).find(
//           (n) =>
//             (n.toLowerCase().includes("tinta") ||
//               n.toLowerCase().includes("toner")) &&
//             !n.toLowerCase().includes("impresora"),
//         );
//         return foundInk || "[C11CJ71301] EPSON BOTELLA DE TINTA T544 NEGRO";
//       }

//       // 4. Consumibles puros (Papel, cintas)
//       if (
//         name.includes("papel") ||
//         name.includes("resma") ||
//         name.includes("bond")
//       ) {
//         const foundInks = Object.values(productNames).find(
//           (n) =>
//             n.toLowerCase().includes("tinta") ||
//             n.toLowerCase().includes("toner"),
//         );
//         return foundInks || "[C11CJ71301] EPSON BOTELLA DE TINTA T544 NEGRO";
//       }

//       return "Consumible / Accesorio Compatible";
//     };
//     // =========================================================================
//     // 5. MOTOR DE CORRECCIÓN SEMÁNTICA POR IA ULTRA-ESTRICTA (FETCH DIRECTO)
//     // =========================================================================
//     if (masVendidos.length > 0 && process.env.OPENAI_API_KEY) {
//       try {
//         const catalogMap = Object.entries(productNames).map(([id, name]) => ({
//           id: Number(id),
//           name,
//         }));
//         const targetsMap = masVendidos.map((p) => ({ id: p.id, name: p.name }));

//         const aiPrompt = `Eres el motor de Inteligencia de Negocios de SUPRICOM (Mayorista de Tecnología en Venezuela).
//         Tu labor es asociar cada producto objetivo ("targets") con un producto de venta cruzada ("cross-selling") lógico y de alto valor comercial extraído EXCLUSIVAMENTE de la lista de catálogo ("catalog") provista.

//         REGLAS DE COHERENCIA TECNOLÓGICA OBLIGATORIAS:
//         1. ¡PROHIBIDO RECOMENDAR RESMAS DE PAPEL PARA LAPTOPS, COMPUTADORAS O MEMORIAS RAM! Es una mala práctica comercial.
//         2. Si el target es una LAPTOP o COMPUTADORA, debe emparejarse con: Un Mouse, Teclado, Mochila/Bulto, Memoria RAM de expansión, SSD o Regulador/UPS del catálogo.
//         3. Si el target es un COMPONENTE (Memoria RAM, Disco SSD, etc.), debe emparejarse con: Un Case externo, herramientas, Regulador de voltaje u otro componente compatible del catálogo.
//         4. Si el target es una IMPRESORA, debe emparejarse obligatoriamente con: Sus Botellas de Tinta correspondientes, Tóner, Cintas o Resmas de Papel.

//         Devuelve única y estrictamente un objeto JSON estructurado con la llave "products":
//         {"products": [{"target_id": 123, "suggested_id": 456}]}`;

//         // Realizamos el fetch manual inyectando de forma explícita las cabeceras requeridas por OpenRouter
//         // const aiResponse = await fetch(
//         //   "https://openrouter.ai/api/v1/chat/completions",
//         //   {
//         //     method: "POST",
//         //     headers: {
//         //       Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
//         //       "Content-Type": "application/json",
//         //       "HTTP-Referer": "http://localhost:3000", // Requerido por OpenRouter
//         //       "X-Title": "SUPRICOM Dashboard", // Requerido por OpenRouter
//         //     },
//         //     body: JSON.stringify({
//         //       model: "openai/gpt-4o-mini",
//         //       messages: [
//         //         { role: "system", content: aiPrompt },
//         //         {
//         //           role: "user",
//         //           content: JSON.stringify({
//         //             catalog: catalogMap,
//         //             targets: targetsMap,
//         //           }),
//         //         },
//         //       ],
//         //       response_format: { type: "json_object" },
//         //     }),
//         //   },
//         // );
//         const apiKeyRaw = process.env.OPENAI_API_KEY || "";
//         const cleanApiKey = apiKeyRaw.trim().replace(/^["']|["']$/g, ""); // Limpia comillas accidentales del .env

//         const aiResponse = await fetch(
//           "https://openrouter.ai/api/v1/chat/completions",
//           {
//             method: "POST",
//             headers: {
//               Authorization: `Bearer ${cleanApiKey}`,
//               "Content-Type": "application/json",
//               "HTTP-Referer": "https://supricom.com", // Cambiado a HTTPS plano para cumplir con políticas B2B
//               "X-Title": "SUPRICOM BI",
//             },
//             body: JSON.stringify({
//               model: "openai/gpt-4o-mini",
//               messages: [
//                 { role: "system", content: aiPrompt },
//                 {
//                   role: "user",
//                   content: JSON.stringify({
//                     catalog: catalogMap,
//                     targets: targetsMap,
//                   }),
//                 },
//               ],
//               response_format: { type: "json_object" },
//             }),
//           },
//         );
//         if (aiResponse.ok) {
//           const resData = await aiResponse.json();
//           const rawText = resData.choices?.[0]?.message?.content;
//           const aiData = JSON.parse(rawText || "{}");
//           const matches = aiData.products || aiData;

//           if (Array.isArray(matches)) {
//             masVendidos.forEach((p) => {
//               const match = matches.find((m: any) => m.target_id === p.id);
//               if (match && productNames[match.suggested_id]) {
//                 const aiSuggestion =
//                   productNames[match.suggested_id].toLowerCase();
//                 const targetName = p.name.toLowerCase();

//                 // Doble capa de protección contra errores de la IA
//                 if (
//                   (targetName.includes("laptop") ||
//                     targetName.includes("ram") ||
//                     targetName.includes("memoria")) &&
//                   aiSuggestion.includes("papel")
//                 ) {
//                   p.cross_sell_product = getSmartFallback(p.name);
//                 } else {
//                   p.cross_sell_product = productNames[match.suggested_id];
//                 }
//               } else {
//                 p.cross_sell_product = getSmartFallback(p.name);
//               }
//             });
//           }
//         } else {
//           const errText = await aiResponse.text();
//           console.error(
//             "⚠️ HTTP Error desde OpenRouter:",
//             aiResponse.status,
//             errText,
//           );
//           masVendidos.forEach(
//             (p) => (p.cross_sell_product = getSmartFallback(p.name)),
//           );
//         }
//       } catch (aiError) {
//         console.error(
//           "⚠️ Error en el procesamiento de IA, aplicando smart fallback:",
//           aiError,
//         );
//         masVendidos.forEach((p) => {
//           p.cross_sell_product = getSmartFallback(p.name);
//         });
//       }
//     } else {
//       masVendidos.forEach((p) => {
//         p.cross_sell_product = getSmartFallback(p.name);
//       });
//     }

//     return NextResponse.json({
//       masVendidos,
//       mayorRotacion,
//       estancados,
//     });
//   } catch (error: any) {
//     console.error("❌ Error BI Engine:", error);
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { query } from "@/lib/db";
import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

const inventoryCache = new Map<string, { data: any; ts: number }>();
const INVENTORY_CACHE_TTL = 24 * 60 * 60 * 1000;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId") || "all";
    const startDate = searchParams.get("startDate") || "";
    const endDate = searchParams.get("endDate") || "";

    // Obtener userId desde el JWT de la cookie (fuente de verdad)
    // con fallback al query param para compatibilidad
    const token = request.cookies.get("token")?.value;
    const payload = verifyToken(token);
    const mysqlId = payload
      ? Number((payload as any).sub || (payload as any).userId || 0)
      : Number(searchParams.get("userId") || 0);

    if (!mysqlId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // 1. Validar la restricción de empresa (cids) en MySQL
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

    // Filtro base de empresa (compartido por ambos dominios)
    const companyFilter: any[] = [];
    if (companyId !== "all") {
      companyFilter.push(["company_id", "=", parseInt(companyId, 10)]);
    } else if (userCids !== null && userCids !== "null" && userCids !== "") {
      const companyIds = userCids
        .split(",")
        .map((id: string) => parseInt(id.trim(), 10));
      companyFilter.push(["company_id", "in", companyIds]);
    }

    // Dominio con fecha → masVendidos / mayorRotacion / marcas
    const odooDomain: any[] = [
      ["order_id.state", "in", ["sale", "done"]],
      ...companyFilter,
    ];
    if (startDate)
      odooDomain.push(["order_id.date_order", ">=", `${startDate} 00:00:00`]);
    if (endDate)
      odooDomain.push(["order_id.date_order", "<=", `${endDate} 23:59:59`]);

    // Dominio sin fecha → estancados (historial completo para days_inactive real)
    const allTimeDomain: any[] = [
      ["order_id.state", "in", ["sale", "done"]],
      ...companyFilter,
    ];

    // Caché: devolver si existe y es válida
    const cacheKey = `${mysqlId}|${companyId}|${startDate}|${endDate}`;
    const cached = inventoryCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < INVENTORY_CACHE_TTL) {
      return NextResponse.json(cached.data);
    }

    // 2. Traer las líneas de órdenes de venta de Odoo (paginado)
    async function fetchLines(domain: any[]): Promise<any[]> {
      const PAGE = 5000;
      let result: any[] = [];
      let offset = 0;
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
              "order_id",
              "order_partner_id",
              "salesman_id",
            ],
            order: "id asc",
            limit: PAGE,
            offset,
          },
        );
        if (!page || page.length === 0) break;
        result = result.concat(page);
        if (page.length < PAGE) break;
        offset += PAGE;
        if (result.length >= 200000) break;
      }
      return result;
    }

    // Fetch con fecha (masVendidos/rotación/marcas) y sin fecha (estancados) en paralelo
    // Si no hay filtro de fecha los dominios son iguales → reutilizar
    const [saleLines, allTimeLines] = await (startDate
      ? Promise.all([fetchLines(odooDomain), fetchLines(allTimeDomain)])
      : fetchLines(odooDomain).then((lines) => [lines, lines]));

    if (!saleLines || saleLines.length === 0) {
      return NextResponse.json({
        masVendidos: [],
        mayorRotacion: [],
        estancados: [],
        msg: "No hay suficiente data comercial para generar analíticas.",
      });
    }

    // 3. Traer fechas reales de los pedidos (date_order) — unión de ambos sets
    const allLinesCombined =
      saleLines === allTimeLines ? saleLines : [...saleLines, ...allTimeLines];
    const uniqueOrderIds = [
      ...new Set(allLinesCombined.map((l) => l.order_id?.[0]).filter(Boolean)),
    ];
    const orderDates: Record<number, Date> = {};
    if (uniqueOrderIds.length > 0) {
      const CHUNK = 1000;
      for (let i = 0; i < uniqueOrderIds.length; i += CHUNK) {
        const chunk = uniqueOrderIds.slice(i, i + CHUNK);
        const orders = await callOdooRPC<any[]>(
          "sale.order",
          "search_read",
          [[["id", "in", chunk]]],
          { fields: ["id", "date_order"], limit: CHUNK },
        );
        if (Array.isArray(orders)) {
          orders.forEach((o) => {
            orderDates[o.id] = new Date(o.date_order);
          });
        }
      }
    }

    // Helper: agrega líneas en un mapa de estadísticas por producto
    function buildProductStats(lines: any[]): Record<number, any> {
      const stats: Record<number, any> = {};
      lines.forEach((line) => {
        if (!line.product_id) return;
        const pId = line.product_id[0];
        const pName = line.product_id[1];
        const qty = line.product_uom_qty || 0;
        const amount = line.price_subtotal || 0;
        const orderId = line.order_id?.[0];
        const date =
          orderId && orderDates[orderId] ? orderDates[orderId] : new Date(0);
        if (!stats[pId]) {
          stats[pId] = {
            id: pId,
            name: pName,
            total_qty: 0,
            total_amount: 0,
            order_count: 0,
            last_sale_date: date,
          };
        }
        stats[pId].total_qty += qty;
        stats[pId].total_amount += amount;
        stats[pId].order_count += 1;
        if (date > stats[pId].last_sale_date) stats[pId].last_sale_date = date;
      });
      return stats;
    }

    // 4. Agregación: con fecha para monto/rotación/marcas; sin fecha para estancados
    const productStats = buildProductStats(saleLines);
    const allTimeProductStats =
      saleLines === allTimeLines
        ? productStats
        : buildProductStats(allTimeLines);

    const productNames: Record<number, string> = {};
    allLinesCombined.forEach((l) => {
      if (l.product_id) productNames[l.product_id[0]] = l.product_id[1];
    });

    const today = new Date();

    function toMetrics(stats: Record<number, any>) {
      return Object.values(stats).map((p: any) => ({
        id: p.id,
        name: p.name,
        total_qty: p.total_qty,
        total_amount: p.total_amount,
        order_count: p.order_count,
        days_inactive: Math.floor(
          (today.getTime() - p.last_sale_date.getTime()) / 86400000,
        ),
        cross_sell_product: "",
        strategic_action: "",
      }));
    }

    const allProducts = toMetrics(productStats);
    const allProductsAllTime = toMetrics(allTimeProductStats);

    const masVendidos = [...allProducts]
      .sort((a, b) => b.total_amount - a.total_amount)
      .slice(0, 8);
    const mayorRotacion = [...allProducts]
      .sort((a, b) => b.total_qty - a.total_qty)
      .slice(0, 8);
    const estancados = [...allProductsAllTime]
      .filter((p) => p.days_inactive >= 30)
      .sort((a, b) => b.days_inactive - a.days_inactive);

    // Agregación por marca (primera palabra del nombre del producto)
    const brandStats: Record<string, any> = {};
    const brandClientStats: Record<
      string,
      Record<string, { amount: number; orders: number }>
    > = {};
    const brandVendorStats: Record<string, Record<string, number>> = {};

    saleLines.forEach((line) => {
      if (!line.product_id) return;
      const brand = (line.product_id[1] as string)
        .replace(/\[.*?\]/g, "")
        .trim()
        .split(" ")[0]
        .toUpperCase();
      const qty = line.product_uom_qty || 0;
      const amount = line.price_subtotal || 0;

      if (!brandStats[brand]) {
        brandStats[brand] = {
          brand,
          total_qty: 0,
          total_amount: 0,
          order_count: 0,
        };
      }
      brandStats[brand].total_qty += qty;
      brandStats[brand].total_amount += amount;
      brandStats[brand].order_count += 1;

      // Rastrear cliente top por marca (usando partner_id si está disponible)
      const clientName: string =
        (line as any).order_partner_id?.[1] ||
        (line as any).partner_id?.[1] ||
        "";
      if (clientName) {
        if (!brandClientStats[brand]) brandClientStats[brand] = {};
        if (!brandClientStats[brand][clientName])
          brandClientStats[brand][clientName] = { amount: 0, orders: 0 };
        brandClientStats[brand][clientName].amount += amount;
        brandClientStats[brand][clientName].orders += 1;
      }

      // Rastrear vendedor responsable
      const vendorName: string =
        (line as any).salesman_id?.[1] || (line as any).user_id?.[1] || "";
      if (vendorName) {
        if (!brandVendorStats[brand]) brandVendorStats[brand] = {};
        brandVendorStats[brand][vendorName] =
          (brandVendorStats[brand][vendorName] || 0) + amount;
      }
    });

    const porMarca = Object.values(brandStats)
      .sort((a: any, b: any) => b.total_amount - a.total_amount)
      .slice(0, 15)
      .map((b: any) => {
        // Cliente top de esa marca
        const clients = brandClientStats[b.brand] || {};
        const topClientEntry = Object.entries(clients).sort(
          (x: any, y: any) => y[1].amount - x[1].amount,
        )[0];
        const topClient = topClientEntry ? topClientEntry[0] : "N/A";
        const clientAmount = topClientEntry ? topClientEntry[1].amount : 0;
        const frequencyMonthly = topClientEntry ? topClientEntry[1].orders : 0;

        // Vendedor top de esa marca
        const vendors = brandVendorStats[b.brand] || {};
        const topVendorEntry = Object.entries(vendors).sort(
          (x: any, y: any) => y[1] - x[1],
        )[0];
        const vendor = topVendorEntry ? topVendorEntry[0] : "N/A";

        return {
          brand: b.brand,
          total_qty: b.total_qty,
          total_amount: b.total_amount,
          top_client: topClient,
          client_amount: clientAmount,
          frequency_monthly: frequencyMonthly,
          vendor,
        };
      });

    // =========================================================================
    // 4. MOTOR ALGORÍTMICO LOCAL DE MATRICES DE CATEGORÍA (CROSS-SELLING REAL)
    // =========================================================================
    const getSmartFallback = (productName: string): string => {
      const name = productName.toLowerCase();

      // Categoría A: Laptops, Computadoras y Servidores de Odoo
      if (
        name.includes("laptop") ||
        name.includes("notebook") ||
        name.includes("pc") ||
        name.includes("computadora") ||
        name.includes("ideapad") ||
        name.includes("probook") ||
        name.includes("victus")
      ) {
        const matchingTech = Object.values(productNames).find(
          (n) =>
            n.toLowerCase().includes("mouse") ||
            n.toLowerCase().includes("ups") ||
            n.toLowerCase().includes("regulador") ||
            n.toLowerCase().includes("smartbitt"),
        );
        return (
          matchingTech || "[SBNB1800] SMARTBITT UPS SMART 1800VA 6 SALIDAS"
        );
      }

      // Categoría B: Componentes de Hardware internos (RAM, SSD, Boards)
      if (
        name.includes("memoria") ||
        name.includes("ram") ||
        name.includes("ssd") ||
        name.includes("disco") ||
        name.includes("kingston") ||
        name.includes("acer laptop al")
      ) {
        const matchingComponent = Object.values(productNames).find(
          (n) =>
            n.toLowerCase().includes("regulador") ||
            n.toLowerCase().includes("ups") ||
            n.toLowerCase().includes("case"),
        );
        return (
          matchingComponent || "[SBNB1800] SMARTBITT UPS SMART 1800VA 6 SALIDAS"
        );
      }

      // Categoría C: Impresoras físicas
      if (
        name.includes("impresora") ||
        name.includes("ecotank") ||
        name.includes("laserjet") ||
        name.includes("epson") ||
        name.includes("canon")
      ) {
        const matchingInk = Object.values(productNames).find(
          (n) =>
            (n.toLowerCase().includes("tinta") ||
              n.toLowerCase().includes("toner") ||
              n.toLowerCase().includes("t544") ||
              n.toLowerCase().includes("cli-171")) &&
            !n.toLowerCase().includes("impresora"),
        );
        return matchingInk || "[C11CJ71301] EPSON BOTELLA DE TINTA T544 NEGRO";
      }

      // Categoría D: Consumibles, Papelería y Cintas
      if (
        name.includes("papel") ||
        name.includes("resma") ||
        name.includes("bond") ||
        name.includes("cartucho") ||
        name.includes("toner")
      ) {
        const matchingOffice = Object.values(productNames).find(
          (n) =>
            n.toLowerCase().includes("tinta") ||
            n.toLowerCase().includes("resma") ||
            (n.toLowerCase().includes("papel") && n !== productName),
        );
        return (
          matchingOffice || "[C11CJ71301] EPSON BOTELLA DE TINTA T544 NEGRO"
        );
      }

      return "[C11CJ71301] EPSON BOTELLA DE TINTA T544 NEGRO";
    };

    // Aplicar fallback local primero (garantiza que siempre haya algo)
    masVendidos.forEach((p) => {
      p.cross_sell_product = getSmartFallback(p.name);
    });
    mayorRotacion.forEach((p) => {
      p.cross_sell_product = getSmartFallback(p.name);
    });
    estancados.forEach((p) => {
      p.cross_sell_product = getSmartFallback(p.name);
    });

    // =========================================================================
    // 5. MOTOR DE IA (OpenAI GPT-4o-mini) — enriquece el cross-selling con el
    //    catálogo real de Odoo y semántica de negocio
    // =========================================================================
    if (process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Catálogo completo de productos disponibles para sugerencias
        const catalogSample = Object.entries(productNames).map(
          ([id, name]) => ({ id: Number(id), name }),
        );

        // Unir los 3 conjuntos eliminando duplicados por id
        // Estancados llevan days_inactive para que la IA genere strategic_action
        const estancadosSlice = estancados.slice(0, 20); // max 20 estancados para IA
        const allTargets = [
          ...masVendidos.map((p) => ({ id: p.id, name: p.name })),
          ...mayorRotacion
            .filter((r) => !masVendidos.find((m) => m.id === r.id))
            .map((p) => ({ id: p.id, name: p.name })),
          ...estancadosSlice
            .filter(
              (e) =>
                !masVendidos.find((m) => m.id === e.id) &&
                !mayorRotacion.find((r) => r.id === e.id),
            )
            .map((p) => ({
              id: p.id,
              name: p.name,
              days_inactive: p.days_inactive,
            })),
        ];

        const systemPrompt = `Eres el motor de Inteligencia Comercial de SUPRICOM, mayorista de tecnología en Venezuela.
Tu tarea es asignar a cada producto objetivo ("targets") el mejor producto de venta cruzada del catálogo ("catalog").
Algunos targets son productos ESTANCADOS (días sin venta >= 30) — para esos, también debes generar una "strategic_action".

REGLAS DE CROSS-SELLING:
1. Laptops/PCs/Notebooks → Mouse, Teclado, UPS, Mochila, SSD, Memoria RAM del catálogo.
2. Componentes (RAM, SSD, Disco) → UPS, Regulador, Case externo del catálogo.
3. Impresoras/Ecotank/LaserJet → Botellas de tinta, tóner o resmas de papel del catálogo.
4. Consumibles (papel, tinta, tóner) → Impresora compatible o consumible complementario.
5. Periféricos (mouse, teclado, audífono) → Laptop, PC o hub USB del catálogo.
6. Tablets → Teclado, funda protectora, stylus o cargador del catálogo.
7. NUNCA sugieras papel o resma para laptops, memorias RAM o componentes de hardware.
8. Si no hay coincidencia clara, elige el producto más vendido del catálogo como sugerencia.

REGLAS DE ACCIÓN ESTRATÉGICA (solo para targets con days_inactive >= 30):
- "strategic_action": 1 oración táctica concreta para reactivar ventas de ese producto.
- Menciona el suggested_id como producto de apoyo si aplica (ej: "combo con X").
- Ejemplos válidos: "Incluir en campaña de email como kit con [suggested]", "Oferta flash 10% a distribuidores de tecnología", "Presentar al top cliente como renovación de su equipo actual", "Liquidar con precio especial a revendedores del interior".
- Para targets sin days_inactive >= 30, devuelve strategic_action: "".

Devuelve SOLO JSON válido:
{"suggestions": [{"target_id": 123, "suggested_id": 456, "strategic_action": "..."}]}`;

        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          response_format: { type: "json_object" },
          temperature: 0.1,
          max_tokens: 4096,
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: JSON.stringify({
                catalog: catalogSample,
                targets: allTargets,
              }),
            },
          ],
        });

        const rawText = completion.choices[0]?.message?.content || "{}";
        const aiData = JSON.parse(rawText);
        const suggestions: Array<{
          target_id: number;
          suggested_id: number;
          strategic_action?: string;
        }> = aiData.suggestions || [];

        if (Array.isArray(suggestions) && suggestions.length > 0) {
          const applyAI = (list: any[], includeStrategy = false) => {
            list.forEach((p) => {
              const match = suggestions.find((s) => s.target_id === p.id);
              if (match && productNames[match.suggested_id]) {
                p.cross_sell_product = productNames[match.suggested_id];
              }
              if (includeStrategy && match?.strategic_action) {
                p.strategic_action = match.strategic_action;
              }
            });
          };

          applyAI(masVendidos);
          applyAI(mayorRotacion);
          applyAI(estancados, true);
        }
      } catch (aiError) {
        console.error(
          "⚠️ IA cross-selling falló, usando fallback local:",
          aiError,
        );
        // El fallback local ya fue aplicado arriba, no hacer nada más
      }
    }

    const responseData = { masVendidos, mayorRotacion, estancados, porMarca };
    inventoryCache.set(cacheKey, { data: responseData, ts: Date.now() });
    return NextResponse.json(responseData);
  } catch (error: any) {
    console.error("❌ Error BI Engine:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
