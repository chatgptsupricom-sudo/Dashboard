import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles, obtenerSemanasDelMes } from "@/lib/feriados";
import { computeComprasKpis } from "@/lib/compras/kpis";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

function normalize(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\./g, "")
    .toUpperCase()
    .trim()
    .replace(/\s+/g, " ");
}

async function ensureTables() {
  await query(`CREATE TABLE IF NOT EXISTS kpi_targets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kpi_key VARCHAR(100) NOT NULL,
    company_id INT NOT NULL,
    meta_mensual DECIMAL(15,2) NOT NULL DEFAULT 0,
    mes VARCHAR(7) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_kpi (kpi_key, company_id, mes)
  )`);
  await query(`CREATE TABLE IF NOT EXISTS kpi_weekly_data (
    id INT AUTO_INCREMENT PRIMARY KEY,
    kpi_key VARCHAR(100) NOT NULL,
    company_id INT NOT NULL,
    mes VARCHAR(7) NOT NULL,
    semana_index INT NOT NULL,
    semana_label VARCHAR(50),
    valor DECIMAL(15,2) DEFAULT 0,
    meta DECIMAL(15,2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_kpi_week (kpi_key, company_id, mes, semana_index)
  )`);
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    await ensureTables();

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const semanas = obtenerSemanasDelMes(anio, mesNum);
    const numSemanas = semanas.length;

    // 1. Load saved weekly data from DB
    const savedData = await query(
      "SELECT kpi_key, semana_index, valor, meta FROM kpi_weekly_data WHERE company_id = ? AND mes = ?",
      [companyId, mes]
    );
    const savedMap: Record<string, Record<number, { valor: number; meta: number }>> = {};
    (savedData.rows as any[]).forEach((row) => {
      if (!savedMap[row.kpi_key]) savedMap[row.kpi_key] = {};
      savedMap[row.kpi_key][row.semana_index] = { valor: Number(row.valor), meta: Number(row.meta) };
    });

    // 2. Fetch cuota data
    let sellers: any[] = [];
    let totalCuotaMensual = 0;
    try {
      const cuotaResult = await query(
        `SELECT s.id as seller_id, s.name, s.user_id, c.cuota 
         FROM sellers s 
         INNER JOIN (
           SELECT seller_id, cuota FROM cuota 
           WHERE id IN (SELECT MAX(id) FROM cuota GROUP BY seller_id)
         ) c ON s.id = c.seller_id
         WHERE s.cids = ?`,
        [companyId]
      );
      sellers = cuotaResult.rows as any[];
      totalCuotaMensual = sellers.reduce((sum, s) => sum + Number(s.cuota || 0), 0);
    } catch (e: any) {
      console.error("Error cuota:", e.message);
    }

    // 3. Fetch invoices for the month
    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    const invoices = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["company_id", "=", companyId],
          ["invoice_date", ">=", fechaInicio],
          ["invoice_date", "<=", fechaFin],
          ["invoice_user_id", "!=", false],
        ],
      ],
      {
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id"],
        limit: 10000,
      }
    );

    // 4. Normalize seller names
    const normalizedSellerMap: Record<string, string> = {};
    const sellerMap: Record<string, { nombre: string; cuotaMensual: number; facturadoMensual: number; semanas: { facturado: number; cuotaSemanal: number }[] }> = {};
    sellers.forEach((s) => {
      const norm = normalize(s.name);
      normalizedSellerMap[norm] = s.name;
      sellerMap[s.name] = {
        nombre: s.name,
        cuotaMensual: Number(s.cuota || 0),
        facturadoMensual: 0,
        semanas: semanas.map(() => ({ facturado: 0, cuotaSemanal: 0 })),
      };
    });

    // 5. Distribute invoices
    (invoices || []).forEach((inv: any) => {
      const sellerName = inv.invoice_user_id?.[1];
      if (!sellerName) return;
      const invNorm = normalize(sellerName);
      const matchedName = normalizedSellerMap[invNorm];
      const amount = Number(inv.amount_untaxed) || 0;

      if (matchedName && sellerMap[matchedName]) {
        sellerMap[matchedName].facturadoMensual += amount;
        const invDate = new Date(inv.invoice_date);
        for (let i = 0; i < semanas.length; i++) {
          if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
            sellerMap[matchedName].semanas[i].facturado += amount;
            break;
          }
        }
      }
    });

    // 6. Calculate weekly quota by business days
    const totalDiasUtilesMes = contarDiasUtiles(new Date(anio, mesNum - 1, 1), new Date(anio, mesNum, 0));
    Object.values(sellerMap).forEach((seller) => {
      semanas.forEach((semana, i) => {
        seller.semanas[i].cuotaSemanal = totalDiasUtilesMes > 0
          ? (seller.cuotaMensual * semana.diasUtiles) / totalDiasUtilesMes
          : seller.cuotaMensual / numSemanas;
      });
    });

    // 7. Calculate visitas (activities per seller from Odoo)
    let visitasPorSeller: Record<string, number> = {};
    try {
      const sellerUserIds = sellers.map((s) => s.user_id).filter(Boolean);
      if (sellerUserIds.length > 0) {
        const allSellerInvoices = invoices || [];
        const invoiceIds = allSellerInvoices.map((inv: any) => inv.id);
        if (invoiceIds.length > 0) {
          const activities = await callOdooRPC<any[]>(
            "mail.message",
            "search_read",
            [
              [
                ["model", "=", "account.move"],
                ["subtype_id", "=", 2], // mail.mt_comment or activity
                ["create_date", ">=", fechaInicio],
                ["create_date", "<=", fechaFin],
              ],
            ],
            {
              fields: ["author_id", "create_date"],
              limit: 5000,
            }
          );
          (activities || []).forEach((act: any) => {
            const authorName = act.author_id?.[1];
            if (!authorName) return;
            const norm = normalize(authorName);
            const matchedName = normalizedSellerMap[norm];
            if (matchedName) {
              visitasPorSeller[matchedName] = (visitasPorSeller[matchedName] || 0) + 1;
            }
          });
        }
      }
    } catch (_) {}

    // 8. Calculate new clients
    // A "cliente nuevo" = partner whose FIRST invoice in Odoo is in the current month.
    // Goal = meta per seller (e.g. 10 means each seller must capture 10 new clients).
    // Weekly % = (new clients that week) / (goal_per_seller * num_sellers * dias_utiles_semana / dias_utiles_mes) * 100

    const clientesNuevosPorSeller: Record<string, number> = {};
    const clientesNuevosPorSellerPorSemana: Record<string, Record<number, number>> = {};

    try {
      // Collect unique partner_ids from current month invoices
      const currentMonthPartnerIds = [...new Set(
        (invoices || [])
          .map((inv: any) => inv.partner_id?.[0])
          .filter(Boolean)
      )];

      if (currentMonthPartnerIds.length > 0) {
        // For each partner, check if they have ANY invoice before the current month
        // Use Odoo RPC to find invoices for these partners before fechaInicio
        const historicalInvoices = await callOdooRPC<any[]>(
          "account.move",
          "search_read",
          [
            [
              ["partner_id", "in", currentMonthPartnerIds],
              ["invoice_date", "<", fechaInicio],
              ["move_type", "in", ["out_invoice", "out_refund"]],
              ["state", "=", "posted"],
              ["company_id", "=", companyId],
            ],
          ],
          {
            fields: ["partner_id"],
            limit: 50000,
          }
        );

        // Build set of partners who already existed (had invoices before this month)
        const existingPartnerIds = new Set<number>();
        (historicalInvoices || []).forEach((inv: any) => {
          const pid = inv.partner_id?.[0];
          if (pid) existingPartnerIds.add(pid);
        });

        // Now determine new clients from current month invoices
        // A partner is "new" if they are NOT in existingPartnerIds
        // Each partner is counted only once (first invoice in the current month)
        const partnerAlreadyCounted = new Set<number>();

        (invoices || []).forEach((inv: any) => {
          const partnerId = inv.partner_id?.[0];
          if (!partnerId) return;
          if (existingPartnerIds.has(partnerId)) return;
          if (partnerAlreadyCounted.has(partnerId)) return;

          partnerAlreadyCounted.add(partnerId);

          const sellerName = inv.invoice_user_id?.[1];
          if (!sellerName) return;
          const norm = normalize(sellerName);
          const matchedName = normalizedSellerMap[norm];
          if (!matchedName) return;

          clientesNuevosPorSeller[matchedName] = (clientesNuevosPorSeller[matchedName] || 0) + 1;

          // Track by week
          const invDate = new Date(inv.invoice_date);
          for (let i = 0; i < semanas.length; i++) {
            if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
              if (!clientesNuevosPorSellerPorSemana[matchedName]) {
                clientesNuevosPorSellerPorSemana[matchedName] = {};
              }
              clientesNuevosPorSellerPorSemana[matchedName][i] =
                (clientesNuevosPorSellerPorSemana[matchedName][i] || 0) + 1;
              break;
            }
          }
        });

        console.log(`[Stoplight] Clientes nuevos: ${partnerAlreadyCounted.size} de ${currentMonthPartnerIds.length} partners del mes (${existingPartnerIds.size} ya existian)`);
      }
    } catch (e: any) {
      console.error("Error calculating new clients:", e.message);
    }

    // 9. Build week headers
    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${s.inicio.toLocaleDateString("es-VE", opts)} - ${s.fin.toLocaleDateString("es-VE", opts)}`;
    });

    // 10. Build KPI data
    const totalFacturadoMensual = Object.values(sellerMap).reduce((sum, s) => sum + s.facturadoMensual, 0);

    // Load metas first (needed for weekly calculations)
    const kpiKeys = ["cumplimiento_cuota_ventas", "margen_bruto", "visitas_semanales", "efectividad_cierre", "activacion_cartera", "clientes_nuevos", "cobertura_marcas", "variacion_costo_compra", "rotacion_saludable", "quiebre_inventario", "inventario_90_dias", "forecast_semanal", "propuestas_calificadas"];
    const metasResult = await query(
      "SELECT kpi_key, meta_mensual FROM kpi_targets WHERE company_id = ? AND mes = ?",
      [companyId, mes]
    );
    const metasMap: Record<string, number> = {};
    (metasResult.rows as any[]).forEach((r) => { metasMap[r.kpi_key] = Number(r.meta_mensual); });

    const metaCuota = metasMap["cumplimiento_cuota_ventas"] || 0;
    const effectiveCuotaMensual = metaCuota > 0 ? metaCuota : totalCuotaMensual;
    const porcentajeCumplimiento = effectiveCuotaMensual > 0 ? Math.round((totalFacturadoMensual / effectiveCuotaMensual) * 100) : 0;

    const semanaCuota = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const facturadoSemana = Object.values(sellerMap).reduce((sum, s) => sum + s.semanas[i].facturado, 0);
      const cuotaSemana = metaCuota > 0
        ? (metaCuota * semana.diasUtiles) / totalDiasUtilesMes
        : Object.values(sellerMap).reduce((sum, s) => sum + s.semanas[i].cuotaSemanal, 0);
      const pct = cuotaSemana > 0 ? Math.round((facturadoSemana / cuotaSemana) * 100) : 0;
      return `${pct}%`;
    });

    const totalVisitasMes = Object.values(visitasPorSeller).reduce((sum, v) => sum + v, 0);

    const totalClientesNuevos = Object.values(clientesNuevosPorSeller).reduce((sum, v) => sum + v, 0);
    const numSellers = sellers.length || 1;

    const metaClientesNuevos = metasMap["clientes_nuevos"] || 0; // goal per seller

    // Calculate weekly % for clientes nuevos:
    // Goal per week for the whole team = meta_per_seller * num_sellers * (diasUtilesSemana / diasUtilesMes)
    const semanaClientes = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      if (metaClientesNuevos <= 0) return null;

      const newClientsThisWeek = Object.values(clientesNuevosPorSellerPorSemana).reduce(
        (sum, semanaMap) => sum + (semanaMap[i] || 0), 0
      );

      const goalThisWeek = metaClientesNuevos * numSellers * (semana.diasUtiles / totalDiasUtilesMes);
      if (goalThisWeek <= 0) return null;

      const pct = Math.round((newClientsThisWeek / goalThisWeek) * 100);
      return `${pct}%`;
    });

    const fromSavedOrComputed = (key: string, computed: (number | null)[], lowerIsBetter: boolean = false) =>
      semanas.map((semana, i) => {
        const esFuturo = semana.inicio > now;
        if (esFuturo) return null;
        const saved = savedMap[key]?.[i];
        const raw = saved ? saved.valor : computed[i];
        if (raw === null || raw === undefined) return null;
        const goal = metasMap[key] || 0;
        if (goal <= 0) return `${Math.round(raw)}%`;
        let pct: number;
        if (lowerIsBetter) {
          pct = raw > 0 ? Math.round((goal / Math.abs(raw)) * 100) : 100;
        } else {
          pct = raw > 0 ? Math.round((raw / goal) * 100) : 0;
        }
        return `${pct}%`;
      });

    const metaVisitasSemanal = metasMap["visitas_semanales"] || 0;
    const metaMargen = metasMap["margen_bruto"] || 0;
    const metaEfectividad = metasMap["efectividad_cierre"] || 0;
    const metaActivacion = metasMap["activacion_cartera"] || 0;
    const metaCantidad = metasMap["cobertura_marcas"] || 0;

    // --- Margen Bruto (gross margin per week) ---
    let margenPorSemana: { revenue: number; costo: number }[] = semanas.map(() => ({ revenue: 0, costo: 0 }));
    let totalRevenueMes = 0;
    let totalCostoMes = 0;
    try {
      const allInvoicesForMargin = await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "in", ["out_invoice", "out_refund"]],
            ["state", "=", "posted"],
            ["company_id", "=", companyId],
            ["invoice_date", ">=", fechaInicio],
            ["invoice_date", "<=", fechaFin],
            ["invoice_user_id", "!=", false],
          ],
        ],
        {
          fields: ["id", "invoice_user_id", "invoice_date", "move_type"],
          limit: 10000,
        }
      );

      const marginInvoiceIds = (allInvoicesForMargin || []).map((inv: any) => inv.id);
      const marginInvoiceMap: Record<number, any> = {};
      (allInvoicesForMargin || []).forEach((inv: any) => {
        marginInvoiceMap[inv.id] = inv;
      });

      if (marginInvoiceIds.length > 0) {
        const marginLines = (await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", marginInvoiceIds],
              ["display_type", "=", "product"],
              ["product_id", "!=", false],
            ],
          ],
          {
            fields: ["move_id", "product_id", "quantity", "price_subtotal"],
            limit: 50000,
          }
        )) || [];

        const marginProductIds = [...new Set(marginLines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
        const marginProductCostMap: Record<number, number> = {};

        if (marginProductIds.length > 0) {
          const variants = (await callOdooRPC<any[]>(
            "product.product",
            "search_read",
            [[["id", "in", marginProductIds], ["active", "=", true]]],
            { fields: ["id", "product_tmpl_id"], limit: 0 }
          )) || [];

          const variantToTmpl: Record<number, number> = {};
          variants.forEach((v: any) => {
            if (v.id && v.product_tmpl_id?.[0]) variantToTmpl[v.id] = v.product_tmpl_id[0];
          });

          const tmplIds = [...new Set(variants.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];
          if (tmplIds.length > 0) {
            const templates = (await callOdooRPC<any[]>(
              "product.template",
              "search_read",
              [[["id", "in", tmplIds]]],
              { fields: ["id", "standard_price"], limit: 0 }
            )) || [];

            const tmplCostMap: Record<number, number> = {};
            templates.forEach((t: any) => {
              tmplCostMap[t.id] = Number(t.standard_price) || 0;
            });

            marginProductIds.forEach((pid: number) => {
              const tid = variantToTmpl[pid];
              marginProductCostMap[pid] = tid ? (tmplCostMap[tid] || 0) : 0;
            });
          }
        }

        marginLines.forEach((line: any) => {
          const moveId = line.move_id?.[0];
          const inv = marginInvoiceMap[moveId];
          if (!inv) return;

          const productId = line.product_id?.[0];
          const qty = Number(line.quantity) || 0;
          const revenue = Number(line.price_subtotal) || 0;
          const unitCost = productId ? (marginProductCostMap[productId] || 0) : 0;
          const costo = qty * unitCost;

          const isRefund = inv.move_type === "out_refund";
          const revenueFinal = isRefund ? -revenue : revenue;
          const costoFinal = isRefund ? -costo : costo;

          totalRevenueMes += revenueFinal;
          totalCostoMes += costoFinal;

          const invDate = new Date(inv.invoice_date);
          for (let i = 0; i < semanas.length; i++) {
            if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
              margenPorSemana[i].revenue += revenueFinal;
              margenPorSemana[i].costo += costoFinal;
              break;
            }
          }
        });
      }
    } catch (e: any) {
      console.error("Error calculating margin:", e.message);
    }

    const semanaMargen = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const saved = savedMap["margen_bruto"]?.[i];
      if (saved) {
        const goal = metasMap["margen_bruto"] || 0;
        if (goal <= 0) return `${Math.round(saved.valor)}%`;
        const pct = saved.valor > 0 ? Math.round((saved.valor / goal) * 100) : 0;
        return `${pct}%`;
      }
      const sem = margenPorSemana[i];
      if (sem.revenue <= 0) return null;
      const margenActual = ((sem.revenue - sem.costo) / sem.revenue) * 100;
      const pct = metaMargen > 0 ? Math.round((margenActual / metaMargen) * 100) : 0;
      return `${pct}%`;
    });

    // --- Efectividad de cierre (sale order effectiveness per week) ---
    let efectividadPorSemana: { total: number; facturacion: number }[] = semanas.map(() => ({ total: 0, facturacion: 0 }));
    let totalOrdenesMes = 0;
    let totalFacturadasMes = 0;
    try {
      const saleOrders = await callOdooRPC<any[]>(
        "sale.order",
        "search_read",
        [
          [
            ["state", "in", ["sale", "done"]],
            ["company_id", "=", companyId],
            ["date_order", ">=", fechaInicio],
            ["date_order", "<=", fechaFin + " 23:59:59"],
            ["user_id", "!=", false],
          ],
        ],
        {
          fields: ["id", "user_id", "state", "date_order", "amount_total", "invoice_status", "invoice_ids"],
          limit: 10000,
        }
      );

      (saleOrders || []).forEach((order: any) => {
        const hasInvoiceIds = order.invoice_ids && order.invoice_ids.length > 0;
        const isInvoiced = hasInvoiceIds || order.invoice_status === "invoiced";

        totalOrdenesMes++;
        if (isInvoiced) totalFacturadasMes++;

        const orderDate = new Date(order.date_order);
        for (let i = 0; i < semanas.length; i++) {
          if (orderDate >= semanas[i].inicio && orderDate <= semanas[i].fin) {
            efectividadPorSemana[i].total++;
            if (isInvoiced) efectividadPorSemana[i].facturacion++;
            break;
          }
        }
      });
    } catch (e: any) {
      console.error("Error calculating efectividad:", e.message);
    }

    const semanaEfectividad = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const saved = savedMap["efectividad_cierre"]?.[i];
      if (saved) {
        const goal = metasMap["efectividad_cierre"] || 0;
        if (goal <= 0) return `${Math.round(saved.valor)}%`;
        const pct = saved.valor > 0 ? Math.round((saved.valor / goal) * 100) : 0;
        return `${pct}%`;
      }
      const sem = efectividadPorSemana[i];
      if (sem.total <= 0) return null;
      const efectividadActual = (sem.facturacion / sem.total) * 100;
      const pct = metaEfectividad > 0 ? Math.round((efectividadActual / metaEfectividad) * 100) : 0;
      return `${pct}%`;
    });

    // --- Activacion de cartera (client activation per week) ---
    let semanaActivacionData: { total: number; activos: number }[] = semanas.map(() => ({ total: 0, activos: 0 }));
    let totalClientsActivacion = 0;
    let totalActiveClients = 0;
    const sellerAllClients: Record<string, Set<number>> = {};
    const sellerActiveClients: Record<string, Set<number>> = {};
    Object.keys(sellerMap).forEach(name => {
      sellerAllClients[name] = new Set();
      sellerActiveClients[name] = new Set();
    });
    try {
      for (const seller of sellers) {
        if (!seller.user_id) continue;
        const norm = normalize(seller.name);
        if (!sellerAllClients[norm]) continue;

        const clients = (await callOdooRPC<any[]>(
          "res.partner",
          "search_read",
          [
            [
              ["user_id", "=", seller.user_id],
              ["customer_rank", ">", 0],
              ["active", "=", true],
            ],
          ],
          { fields: ["id"], limit: 10000 }
        )) || [];

        clients.forEach((c: any) => sellerAllClients[norm].add(c.id));
      }

      const invActivacionMap: Record<number, { sellerName: string; partnerId: number; date: Date }> = {};
      (invoices || []).forEach((inv: any) => {
        const sellerName = inv.invoice_user_id?.[1];
        const partnerId = inv.partner_id?.[0];
        if (!sellerName || !partnerId) return;
        const norm = normalize(sellerName);
        const matchedName = normalizedSellerMap[norm];
        if (matchedName) {
          invActivacionMap[inv.id] = { sellerName: matchedName, partnerId, date: new Date(inv.invoice_date) };
        }
      });

      const allInvIds = (invoices || []).map((inv: any) => inv.id);
      if (allInvIds.length > 0) {
        const actLines = (await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", allInvIds],
              ["display_type", "=", "product"],
            ],
          ],
          { fields: ["move_id"], limit: 50000 }
        )) || [];

        const invoicesWithProducts = new Set((actLines || []).map((l: any) => l.move_id?.[0]));

        (invoices || []).forEach((inv: any) => {
          if (!invoicesWithProducts.has(inv.id)) return;

          const info = invActivacionMap[inv.id];
          if (!info) return;

          if (sellerAllClients[info.sellerName]?.has(info.partnerId)) {
            sellerActiveClients[info.sellerName].add(info.partnerId);

            for (let i = 0; i < semanas.length; i++) {
              if (info.date >= semanas[i].inicio && info.date <= semanas[i].fin) {
                semanaActivacionData[i].activos++;
                break;
              }
            }
          }
        });
      }

      Object.keys(sellerAllClients).forEach(name => {
        const total = sellerAllClients[name].size;
        const activos = sellerActiveClients[name].size;
        totalClientsActivacion += total;
        totalActiveClients += activos;
      });

      semanaActivacionData.forEach(sem => { sem.total = totalClientsActivacion; });
    } catch (e: any) {
      console.error("Error calculating activacion:", e.message);
    }

    const semanaActivacion = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const saved = savedMap["activacion_cartera"]?.[i];
      if (saved) {
        const goal = metasMap["activacion_cartera"] || 0;
        if (goal <= 0) return `${Math.round(saved.valor)}%`;
        const pct = saved.valor > 0 ? Math.round((saved.valor / goal) * 100) : 0;
        return `${pct}%`;
      }
      const sem = semanaActivacionData[i];
      if (sem.total <= 0) return null;
      if (metaActivacion > 0) {
        const pct = Math.round((sem.activos / metaActivacion) * 100);
        return `${pct}%`;
      }
      const pct = Math.round((sem.activos / sem.total) * 100);
      return `${pct}%`;
    });

    // --- Cobertura de marcas (brand coverage per week) ---
    let semanaCoberturaData: { cantidad: number }[] = semanas.map(() => ({ cantidad: 0 }));
    let totalRevenueBrandsMes = 0;
    let totalCostoBrandsMes = 0;
    try {
      const allInvoiceIds = (invoices || []).map((inv: any) => inv.id);
      if (allInvoiceIds.length > 0) {
        const brandLines = (await callOdooRPC<any[]>(
          "account.move.line",
          "search_read",
          [
            [
              ["move_id", "in", allInvoiceIds],
              ["display_type", "=", "product"],
              ["product_id", "!=", false],
            ],
          ],
          {
            fields: ["move_id", "product_id", "quantity", "price_subtotal"],
            limit: 50000,
          }
        )) || [];

        const brandProductIds = [...new Set(brandLines.map((l: any) => l.product_id?.[0]).filter(Boolean))];
        const brandProductCostMap: Record<number, number> = {};

        if (brandProductIds.length > 0) {
          const brandVariants = (await callOdooRPC<any[]>(
            "product.product",
            "search_read",
            [[["id", "in", brandProductIds], ["active", "=", true]]],
            { fields: ["id", "product_tmpl_id"], limit: 0 }
          )) || [];

          const brandVariantToTmpl: Record<number, number> = {};
          brandVariants.forEach((v: any) => {
            if (v.id && v.product_tmpl_id?.[0]) brandVariantToTmpl[v.id] = v.product_tmpl_id[0];
          });

          const brandTmplIds = [...new Set(brandVariants.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];
          if (brandTmplIds.length > 0) {
            const brandTemplates = (await callOdooRPC<any[]>(
              "product.template",
              "search_read",
              [[["id", "in", brandTmplIds]]],
              { fields: ["id", "standard_price"], limit: 0 }
            )) || [];

            const brandTmplCostMap: Record<number, number> = {};
            brandTemplates.forEach((t: any) => {
              brandTmplCostMap[t.id] = Number(t.standard_price) || 0;
            });

            brandProductIds.forEach((pid: number) => {
              const tid = brandVariantToTmpl[pid];
              brandProductCostMap[pid] = tid ? (brandTmplCostMap[tid] || 0) : 0;
            });
          }
        }

        const invDateMap: Record<number, Date> = {};
        const invoiceMap: Record<number, any> = {};
        (invoices || []).forEach((inv: any) => {
          invDateMap[inv.id] = new Date(inv.invoice_date);
          invoiceMap[inv.id] = inv;
        });

        (brandLines || []).forEach((line: any) => {
          const moveId = line.move_id?.[0];
          const invDate = invDateMap[moveId];
          if (!invDate) return;

          const productId = line.product_id?.[0];
          const qty = Math.abs(Number(line.quantity) || 0);
          const revenue = Math.abs(Number(line.price_subtotal) || 0);
          const unitCost = productId ? (brandProductCostMap[productId] || 0) : 0;
          const costo = qty * unitCost;

          const inv = invoiceMap[moveId];
          const isRefund = inv?.move_type === "out_refund";
          const revenueFinal = isRefund ? -revenue : revenue;
          const costoFinal = isRefund ? -costo : costo;
          const qtyFinal = isRefund ? -qty : qty;

          totalRevenueBrandsMes += revenueFinal;
          totalCostoBrandsMes += costoFinal;

          for (let i = 0; i < semanas.length; i++) {
            if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
              semanaCoberturaData[i].cantidad += qtyFinal;
              break;
            }
          }
        });
      }
    } catch (e: any) {
      console.error("Error calculating cobertura:", e.message);
    }

    const semanaCobertura = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const saved = savedMap["cobertura_marcas"]?.[i];
      if (saved) {
        const goal = metasMap["cobertura_marcas"] || 0;
        if (goal <= 0) return `${Math.round(saved.valor)}%`;
        const pct = saved.valor > 0 ? Math.round((saved.valor / goal) * 100) : 0;
        return `${pct}%`;
      }
      if (metaCantidad > 0) {
        const pct = Math.round((semanaCoberturaData[i].cantidad / metaCantidad) * 100);
        return `${pct}%`;
      }
      return semanaCoberturaData[i].cantidad > 0 ? String(semanaCoberturaData[i].cantidad) : null;
    });

    // --- Visitas semanales (from weekly_visits table) ---
    let visitasPorSemana: number[] = semanas.map(() => 0);
    try {
      const visitasResult = await query(
        `SELECT visit_date, COUNT(*) as cnt FROM weekly_visits WHERE company_id = ? AND visit_date >= ? AND visit_date <= ? GROUP BY visit_date`,
        [companyId, fechaInicio, fechaFin]
      );
      (visitasResult.rows as any[]).forEach((row: any) => {
        const vDate = new Date(row.visit_date);
        for (let i = 0; i < semanas.length; i++) {
          if (vDate >= semanas[i].inicio && vDate <= semanas[i].fin) {
            visitasPorSemana[i] += Number(row.cnt);
            break;
          }
        }
      });
    } catch (_) {}

    const semanaVisitas = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const saved = savedMap["visitas_semanales"]?.[i];
      if (saved) {
        const goal = metasMap["visitas_semanales"] || 0;
        if (goal <= 0) return `${Math.round(saved.valor)}%`;
        const pct = saved.valor > 0 ? Math.round((saved.valor / goal) * 100) : 0;
        return `${pct}%`;
      }
      const total = visitasPorSemana[i];
      if (metaVisitasSemanal > 0) {
        const pct = Math.round((total / metaVisitasSemanal) * 100);
        return `${pct}%`;
      }
      return total > 0 ? String(total) : null;
    });

    // 10.5. KPIs del Departamento de Compras (semanal)
    const comprasRaw = await computeComprasKpis(companyId, semanas);
    const semanaVarCosto = fromSavedOrComputed("variacion_costo_compra", comprasRaw.semanaVarCosto, false);
    const semanaRotacion = fromSavedOrComputed("rotacion_saludable", comprasRaw.semanaRotacion, false);
    const semanaQuiebre = fromSavedOrComputed("quiebre_inventario", comprasRaw.semanaQuiebre, true);
    const semanaInv90 = fromSavedOrComputed("inventario_90_dias", comprasRaw.semanaInv90, true);
    const semanaForecast = await (async () => {
      try {
        const checklistRows = await query(
          "SELECT semana_index, reunion_realizada, forecast_actualizado, quiebres_revisados, decisiones_registradas FROM forecast_checklist WHERE company_id = ? AND mes = ?",
          [companyId, mes]
        );
        const checkMap: Record<number, any> = {};
        (checklistRows.rows as any[]).forEach((r: any) => { checkMap[r.semana_index] = r; });
        return semanas.map((semana, i) => {
          const esFuturo = semana.inicio > now;
          if (esFuturo) return null;
          const saved = savedMap["forecast_semanal"]?.[i];
          if (saved) return `${Math.round(saved.valor)}%`;
          const row = checkMap[i];
          if (!row) return null;
          const checked = [row.reunion_realizada, row.forecast_actualizado, row.quiebres_revisados, row.decisiones_registradas].filter(Boolean).length;
          return `${Math.round((checked / 4) * 100)}%`;
        });
      } catch {
        return Array(semanas.length).fill(null);
      }
    })();
    const semanaPropuestas = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      const saved = savedMap["propuestas_calificadas"]?.[i];
      return saved ? `${saved.valor}` : null;
    });

    // Average for each KPI
    const avgFromWeeks = (weeks: (string | null)[]) => {
      const vals = weeks.filter(Boolean).map((w) => parseInt(w!)).filter((n) => !isNaN(n));
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };

    let latestPct = 0;
    for (let i = semanaCuota.length - 1; i >= 0; i--) {
      const val = parseInt(semanaCuota[i]);
      if (!isNaN(val) && val > 0) { latestPct = val; break; }
    }

    return NextResponse.json({
      success: true,
      data: {
        metaMensual: effectiveCuotaMensual,
        totalCuotaMensual,
        totalFacturadoMensual,
        porcentajeCumplimiento,
        totalVisitasMes,
        totalClientesNuevos,
        numSemanas,
        weekHeaders,
        sellers: Object.values(sellerMap),
        semanaGlobal: semanaCuota,
        trend: latestPct >= 100 ? "green" : latestPct >= 75 ? "yellow" : "red",
        semanaVisitas,
        semanaClientes,
        semanaMargen,
        semanaEfectividad,
        semanaActivacion,
        semanaCobertura,
        avgCumplimiento: avgFromWeeks(semanaCuota),
        avgMargen: avgFromWeeks(semanaMargen),
        avgVisitas: avgFromWeeks(semanaVisitas),
        avgEfectividad: avgFromWeeks(semanaEfectividad),
        avgActivacion: avgFromWeeks(semanaActivacion),
        avgClientes: avgFromWeeks(semanaClientes),
        avgCobertura: avgFromWeeks(semanaCobertura),
        semanaVarCosto,
        semanaRotacion,
        semanaQuiebre,
        semanaInv90,
        semanaForecast,
        semanaPropuestas,
        avgVarCosto: avgFromWeeks(semanaVarCosto),
        avgRotacion: avgFromWeeks(semanaRotacion),
        avgQuiebre: avgFromWeeks(semanaQuiebre),
        avgInv90: avgFromWeeks(semanaInv90),
        avgForecast: avgFromWeeks(semanaForecast),
        avgPropuestas: avgFromWeeks(semanaPropuestas),
        metas: metasMap,
        sellersVisitas: visitasPorSeller,
        sellersClientes: clientesNuevosPorSeller,
        metaClientesNuevos,
      },
    });
  } catch (error: any) {
    console.error("Error en API Stoplight:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    await ensureTables();

    const body = await request.json();
    const { type } = body;

    if (type === "save_meta") {
      const { kpi_key, company_id, meta_mensual, mes } = body;
      if (!kpi_key || !company_id || !mes) {
        return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
      }
      await query(
        `INSERT INTO kpi_targets (kpi_key, company_id, meta_mensual, mes) 
         VALUES (?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE meta_mensual = VALUES(meta_mensual)`,
        [kpi_key, company_id, meta_mensual || 0, mes]
      );
      return NextResponse.json({ success: true });
    }

    if (type === "save_weekly") {
      const { kpi_key, company_id, mes, semana_index, semana_label, valor, meta } = body;
      if (!kpi_key || !company_id || !mes || semana_index === undefined) {
        return NextResponse.json({ error: "Faltan campos" }, { status: 400 });
      }
      await query(
        `INSERT INTO kpi_weekly_data (kpi_key, company_id, mes, semana_index, semana_label, valor, meta)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE valor = VALUES(valor), meta = VALUES(meta), semana_label = VALUES(semana_label)`,
        [kpi_key, company_id, mes, semana_index, semana_label || "", valor || 0, meta || 0]
      );
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Tipo de accion no valido" }, { status: 400 });
  } catch (error: any) {
    console.error("Error guardando KPI:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
