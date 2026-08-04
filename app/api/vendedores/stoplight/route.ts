import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

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

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const uid = payload.uid as number;

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam
      ? parseInt(companyIdParam, 10)
      : (payload.cids as number);

    const now = new Date();
    const mes =
      mesParam ||
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    // Get weeks
    const semanas = (() => {
      const result: { inicio: Date; fin: Date; diasUtiles: number; label: string }[] = [];
      let inicio = new Date(anio, mesNum - 1, 1);
      const ultimoDiaMes = new Date(anio, mesNum, 0);
      while (inicio <= ultimoDiaMes) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > ultimoDiaMes) fin = new Date(ultimoDiaMes);
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        const label = `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}`;
        const DIAS_LABORALES = [1, 2, 3, 4, 5];
        let du = 0;
        for (let d = new Date(inicio); d <= fin; d.setDate(d.getDate() + 1)) {
          if (DIAS_LABORALES.includes(d.getDay())) du++;
        }
        result.push({ inicio: new Date(inicio), fin: new Date(fin), diasUtiles: du, label });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    const totalDiasUtilesMes = (() => {
      const DIAS_LABORALES = [1, 2, 3, 4, 5];
      let count = 0;
      for (let d = new Date(anio, mesNum - 1, 1); d <= new Date(anio, mesNum, 0); d.setDate(d.getDate() + 1)) {
        if (DIAS_LABORALES.includes(d.getDay())) count++;
      }
      return count;
    })();

    const numSemanas = semanas.length;
    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${s.inicio.toLocaleDateString("es-VE", opts)} - ${s.fin.toLocaleDateString("es-VE", opts)}`;
    });

    // Find the seller record for this user
    const sellerResult = await query(
      `SELECT s.id as seller_id, s.name, s.user_id, c.cuota
       FROM sellers s
       INNER JOIN (
         SELECT seller_id, cuota FROM cuota
         WHERE id IN (SELECT MAX(id) FROM cuota GROUP BY seller_id)
       ) c ON s.id = c.seller_id
       WHERE s.cids = ? AND s.user_id = ?`,
      [companyId, uid]
    );

    const sellers = sellerResult.rows as any[];
    if (sellers.length === 0) {
      return NextResponse.json({ success: true, data: { sellerName: "", semanaGlobal: [], semanaMargen: [], semanaVisitas: [], semanaEfectividad: [], semanaActivacion: [], semanaClientes: [], semanaCobertura: [], avgCumplimiento: 0, avgMargen: 0, avgVisitas: 0, avgEfectividad: 0, avgActivacion: 0, avgClientes: 0, avgCobertura: 0, weekHeaders, numSemanas, metas: {} } });
    }

    const seller = sellers[0];
    const sellerName = seller.name;
    const cuotaNum = Number(seller.cuota || 0);

    // Fetch invoices for this seller only
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
          ["invoice_user_id", "=", uid],
        ],
      ],
      {
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id", "move_type"],
        limit: 10000,
      }
    );

    // Calculate daily facturado
    const dailyMap: Record<string, number> = {};
    let totalFacturado = 0;
    (invoices || []).forEach((inv: any) => {
      const dateStr = inv.invoice_date;
      const amount = Number(inv.amount_untaxed) || 0;
      dailyMap[dateStr] = (dailyMap[dateStr] || 0) + amount;
      totalFacturado += amount;
    });

    // Load metas
    const metasResult = await query(
      "SELECT kpi_key, meta_mensual FROM kpi_targets WHERE company_id = ? AND mes = ?",
      [companyId, mes]
    );
    const metasMap: Record<string, number> = {};
    (metasResult.rows as any[]).forEach((r) => { metasMap[r.kpi_key] = Number(r.meta_mensual); });

    // === CUMPLIMIENTO CUOTA ===
    const semanaCuota = semanas.map((sem) => {
      const esFuturo = sem.inicio > now;
      if (esFuturo) return null;
      let facturadoSemana = 0;
      for (let d = new Date(sem.inicio); d <= sem.fin; d.setDate(d.getDate() + 1)) {
        const dateStr = d.toISOString().split("T")[0];
        facturadoSemana += dailyMap[dateStr] || 0;
      }
      const cuotaSemanal = cuotaNum * (sem.diasUtiles / totalDiasUtilesMes);
      const pct = cuotaSemanal > 0 ? Math.round((facturadoSemana / cuotaSemanal) * 100) : 0;
      return `${pct}%`;
    });

    // === MARGEN ===
    let totalRevenueMes = 0;
    let totalCostoMes = 0;
    const margenPorSemana: { revenue: number; costo: number }[] = semanas.map(() => ({ revenue: 0, costo: 0 }));
    let productCostMap: Record<number, number> = {};

    if ((invoices || []).length > 0) {
      const invoiceIds = (invoices || []).map((inv: any) => inv.id);
      const lines = (await callOdooRPC<any[]>(
        "account.move.line",
        "search_read",
        [
          [
            ["move_id", "in", invoiceIds],
            ["display_type", "=", "product"],
            ["product_id", "!=", false],
          ],
        ],
        { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 50000 }
      )) || [];

      const productIds = [...new Set(lines.map((l: any) => l.product_id?.[0]).filter(Boolean))];

      if (productIds.length > 0) {
        const variants = (await callOdooRPC<any[]>(
          "product.product", "search_read",
          [[["id", "in", productIds], ["active", "=", true]]],
          { fields: ["id", "product_tmpl_id"] }
        )) || [];
        const varToTmpl: Record<number, number> = {};
        variants.forEach((v: any) => { if (v.product_tmpl_id?.[0]) varToTmpl[v.id] = v.product_tmpl_id[0]; });
        const tmplIds = [...new Set(variants.map((v: any) => v.product_tmpl_id?.[0]).filter(Boolean))];
        if (tmplIds.length > 0) {
          const templates = (await callOdooRPC<any[]>(
            "product.template", "search_read",
            [[["id", "in", tmplIds]]],
            { fields: ["id", "standard_price"] }
          )) || [];
          const tmplCost: Record<number, number> = {};
          templates.forEach((t: any) => { tmplCost[t.id] = Number(t.standard_price) || 0; });
          productIds.forEach((pid) => { const tid = varToTmpl[pid]; productCostMap[pid] = tid ? (tmplCost[tid] || 0) : 0; });
        }
      }

      const invDateMap: Record<number, Date> = {};
      const invoiceMap: Record<number, any> = {};
      (invoices || []).forEach((inv: any) => {
        invDateMap[inv.id] = new Date(inv.invoice_date);
        invoiceMap[inv.id] = inv;
      });

      (lines || []).forEach((line: any) => {
        const moveId = line.move_id?.[0];
        const invDate = invDateMap[moveId];
        if (!invDate) return;
        const productId = line.product_id?.[0];
        const qty = Math.abs(Number(line.quantity) || 0);
        const revenue = Math.abs(Number(line.price_subtotal) || 0);
        const unitCost = productId ? (productCostMap[productId] || 0) : 0;
        const costo = qty * unitCost;
        const inv = invoiceMap[moveId];
        const isRefund = inv?.move_type === "out_refund";
        const rFinal = isRefund ? -revenue : revenue;
        const cFinal = isRefund ? -costo : costo;
        totalRevenueMes += rFinal;
        totalCostoMes += cFinal;
        for (let i = 0; i < semanas.length; i++) {
          if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
            margenPorSemana[i].revenue += rFinal;
            margenPorSemana[i].costo += cFinal;
            break;
          }
        }
      });
    }

    const metaMargen = metasMap["margen_bruto"] || 0;
    const semanaMargen = margenPorSemana.map((sem, i) => {
      const esFuturo = semanas[i].inicio > now;
      if (esFuturo) return null;
      if (sem.revenue <= 0) return null;
      const margenActual = ((sem.revenue - sem.costo) / sem.revenue) * 100;
      const pct = metaMargen > 0 ? Math.round((margenActual / metaMargen) * 100) : Math.round(margenActual);
      return `${pct}%`;
    });

    // === VISITAS ===
    let visitasPorSemana: number[] = semanas.map(() => 0);
    try {
      const visitasResult = await query(
        `SELECT visit_date, COUNT(*) as cnt FROM weekly_visits WHERE company_id = ? AND seller_name = ? AND visit_date >= ? AND visit_date <= ? GROUP BY visit_date`,
        [companyId, sellerName, fechaInicio, fechaFin]
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

    const metaVisitasSemanal = metasMap["visitas_semanales"] || 0;
    const semanaVisitas = semanas.map((sem, i) => {
      const esFuturo = sem.inicio > now;
      if (esFuturo) return null;
      const total = visitasPorSemana[i];
      if (metaVisitasSemanal > 0) {
        const pct = Math.round((total / metaVisitasSemanal) * 100);
        return `${pct}%`;
      }
      return total > 0 ? String(total) : null;
    });

    // === EFECTIVIDAD ===
    let efectividadPorSemana: { total: number; facturacion: number }[] = semanas.map(() => ({ total: 0, facturacion: 0 }));
    let totalOrdenesMes = 0;
    let totalFacturadasMes = 0;
    try {
      const saleOrders = await callOdooRPC<any[]>(
        "sale.order", "search_read",
        [
          [
            ["state", "in", ["sale", "done"]],
            ["company_id", "=", companyId],
            ["date_order", ">=", fechaInicio],
            ["date_order", "<=", fechaFin + " 23:59:59"],
            ["user_id", "=", uid],
          ],
        ],
        { fields: ["id", "user_id", "state", "date_order", "amount_total", "invoice_status", "invoice_ids"], limit: 10000 }
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
    } catch (_) {}

    const metaEfectividad = metasMap["efectividad_cierre"] || 0;
    const semanaEfectividad = efectividadPorSemana.map((sem, i) => {
      const esFuturo = semanas[i].inicio > now;
      if (esFuturo) return null;
      if (sem.total <= 0) return null;
      const efectividadActual = (sem.facturacion / sem.total) * 100;
      const pct = metaEfectividad > 0 ? Math.round((efectividadActual / metaEfectividad) * 100) : Math.round(efectividadActual);
      return `${pct}%`;
    });

    // === ACTIVACION DE CARTERA ===
    let semanaActivacionData: { total: number; activos: number }[] = semanas.map(() => ({ total: 0, activos: 0 }));
    let totalClientsActivacion = 0;
    let totalActiveClients = 0;
    try {
      // Get all clients assigned to this seller
      const allClients = (await callOdooRPC<any[]>(
        "res.partner",
        "search_read",
        [
          [
            ["user_id", "=", uid],
            ["customer_rank", ">", 0],
            ["active", "=", true],
          ],
        ],
        { fields: ["id"], limit: 10000 }
      )) || [];

      const clientIds = allClients.map((c: any) => c.id);
      totalClientsActivacion = clientIds.length;

      if (clientIds.length > 0 && (invoices || []).length > 0) {
        // Get unique partners from current invoices
        const invoicePartnerIds = [...new Set(
          (invoices || []).map((inv: any) => inv.partner_id?.[0]).filter(Boolean)
        )];

        // Find intersection: clients that have invoices this month
        const activePartnerIds = invoicePartnerIds.filter((pid: number) => clientIds.includes(pid));
        totalActiveClients = activePartnerIds.length;

        // Distribute by week
        (invoices || []).forEach((inv: any) => {
          const partnerId = inv.partner_id?.[0];
          if (!partnerId || !activePartnerIds.includes(partnerId)) return;
          const invDate = new Date(inv.invoice_date);
          for (let i = 0; i < semanas.length; i++) {
            if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
              semanaActivacionData[i].activos++;
              break;
            }
          }
        });
      }

      semanaActivacionData.forEach(sem => { sem.total = totalClientsActivacion; });
    } catch (e: any) {
      console.error("Error calculating activacion:", e.message);
    }

    const metaActivacion = metasMap["activacion_cartera"] || 0;
    const semanaActivacion = semanaActivacionData.map((sem, i) => {
      const esFuturo = semanas[i].inicio > now;
      if (esFuturo) return null;
      if (sem.total <= 0) return null;
      if (metaActivacion > 0) {
        const pct = Math.round((sem.activos / metaActivacion) * 100);
        return `${pct}%`;
      }
      const pct = Math.round((sem.activos / sem.total) * 100);
      return `${pct}%`;
    });

    // === CLIENTES NUEVOS ===
    let clientesNuevosPorSemana: number[] = semanas.map(() => 0);
    let totalClientesNuevos = 0;
    try {
      const currentMonthPartnerIds = [...new Set(
        (invoices || []).map((inv: any) => inv.partner_id?.[0]).filter(Boolean)
      )];

      if (currentMonthPartnerIds.length > 0) {
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
          { fields: ["partner_id"], limit: 50000 }
        );

        const existingPartnerIds = new Set<number>();
        (historicalInvoices || []).forEach((inv: any) => {
          const pid = inv.partner_id?.[0];
          if (pid) existingPartnerIds.add(pid);
        });

        const partnerAlreadyCounted = new Set<number>();
        (invoices || []).forEach((inv: any) => {
          const partnerId = inv.partner_id?.[0];
          if (!partnerId) return;
          if (existingPartnerIds.has(partnerId)) return;
          if (partnerAlreadyCounted.has(partnerId)) return;
          partnerAlreadyCounted.add(partnerId);
          totalClientesNuevos++;
          const invDate = new Date(inv.invoice_date);
          for (let i = 0; i < semanas.length; i++) {
            if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
              clientesNuevosPorSemana[i]++;
              break;
            }
          }
        });
      }
    } catch (e: any) {
      console.error("Error calculating clientes nuevos:", e.message);
    }

    const metaClientesNuevos = metasMap["clientes_nuevos"] || 0;
    const semanaClientes = semanas.map((semana, i) => {
      const esFuturo = semana.inicio > now;
      if (esFuturo) return null;
      if (metaClientesNuevos <= 0) return null;
      const newClientsThisWeek = clientesNuevosPorSemana[i];
      const goalThisWeek = metaClientesNuevos * (semana.diasUtiles / totalDiasUtilesMes);
      if (goalThisWeek <= 0) return null;
      const pct = Math.round((newClientsThisWeek / goalThisWeek) * 100);
      return `${pct}%`;
    });

    // === COBERTURA DE MARCAS ===
    let semanaCoberturaData: { cantidad: number }[] = semanas.map(() => ({ cantidad: 0 }));
    try {
      if ((invoices || []).length > 0) {
        const allInvoiceIds = (invoices || []).map((inv: any) => inv.id);
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
          { fields: ["move_id", "product_id", "quantity", "price_subtotal"], limit: 50000 }
        )) || [];

        const invDateMap: Record<number, Date> = {};
        (invoices || []).forEach((inv: any) => {
          invDateMap[inv.id] = new Date(inv.invoice_date);
        });

        (brandLines || []).forEach((line: any) => {
          const moveId = line.move_id?.[0];
          const invDate = invDateMap[moveId];
          if (!invDate) return;
          const qty = Math.abs(Number(line.quantity) || 0);
          const inv = (invoices || []).find((i: any) => i.id === moveId);
          const isRefund = inv?.move_type === "out_refund";
          const qtyFinal = isRefund ? -qty : qty;

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

    const metaCantidad = metasMap["cobertura_marcas"] || 0;
    const semanaCobertura = semanaCoberturaData.map((sem, i) => {
      const esFuturo = semanas[i].inicio > now;
      if (esFuturo) return null;
      if (metaCantidad > 0) {
        const pct = Math.round((sem.cantidad / metaCantidad) * 100);
        return `${pct}%`;
      }
      return sem.cantidad > 0 ? String(sem.cantidad) : null;
    });

    // === AVERAGES ===
    const avgFromWeeks = (weeks: (string | null)[]) => {
      const vals = weeks.filter(Boolean).map((w) => parseInt(w!)).filter((n) => !isNaN(n));
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };

    return NextResponse.json({
      success: true,
      data: {
        sellerName,
        metaMensual: metasMap["cumplimiento_cuota_ventas"] || cuotaNum,
        cuotaMensual: cuotaNum,
        totalFacturadoMensual: Math.round(totalFacturado * 100) / 100,
        totalRevenueMes: Math.round(totalRevenueMes * 100) / 100,
        totalCostoMes: Math.round(totalCostoMes * 100) / 100,
        totalOrdenesMes,
        totalFacturadasMes,
        totalClientsActivacion,
        totalActiveClients,
        totalClientesNuevos,
        numSemanas,
        weekHeaders,
        semanaGlobal: semanaCuota,
        semanaMargen,
        semanaVisitas,
        semanaEfectividad,
        semanaActivacion,
        semanaClientes,
        semanaCobertura,
        avgCumplimiento: avgFromWeeks(semanaCuota),
        avgMargen: avgFromWeeks(semanaMargen),
        avgVisitas: avgFromWeeks(semanaVisitas),
        avgEfectividad: avgFromWeeks(semanaEfectividad),
        avgActivacion: avgFromWeeks(semanaActivacion),
        avgClientes: avgFromWeeks(semanaClientes),
        avgCobertura: avgFromWeeks(semanaCobertura),
        metas: metasMap,
      },
    });
  } catch (error: any) {
    console.error("Error en API stoplight-vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
