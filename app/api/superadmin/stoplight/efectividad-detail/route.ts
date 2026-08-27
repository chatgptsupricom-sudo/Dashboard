import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

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

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const periodoParam = url.searchParams.get("periodo") || "mes"; // mes, trimestre, anio, todo
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    // Calculate date range based on period
    let fechaInicio: string;
    let fechaFin: string;
    let periodoLabel: string;

    if (periodoParam === "trimestre") {
      const trimestre = Math.ceil(mesNum / 3);
      const mesInicioTrimestre = (trimestre - 1) * 3 + 1;
      fechaInicio = `${anio}-${String(mesInicioTrimestre).padStart(2, "0")}-01`;
      const ultimoDiaTrimestre = new Date(anio, mesInicioTrimestre + 2, 0).getDate();
      fechaFin = `${anio}-${String(mesInicioTrimestre + 2).padStart(2, "0")}-${ultimoDiaTrimestre}`;
      periodoLabel = `Trimestre ${trimestre} ${anio}`;
    } else if (periodoParam === "anio") {
      fechaInicio = `${anio}-01-01`;
      fechaFin = `${anio}-12-31`;
      periodoLabel = `Año ${anio}`;
    } else if (periodoParam === "todo") {
      fechaInicio = "2000-01-01";
      fechaFin = "2099-12-31";
      periodoLabel = "Todo el tiempo";
    } else {
      // mes (default)
      fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
      const ultimoDia = new Date(anio, mesNum, 0).getDate();
      fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;
      periodoLabel = `${now.toLocaleString("es-VE", { month: "long" })} ${anio}`;
    }

    // Calculate weeks based on period
    const semanas = (() => {
      const result: { inicio: Date; fin: Date; diasUtiles: number; label: string }[] = [];
      const fechaInicioDate = new Date(fechaInicio);
      const fechaFinDate = new Date(fechaFin);
      let inicio = new Date(fechaInicioDate);

      while (inicio <= fechaFinDate) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > fechaFinDate) fin = new Date(fechaFinDate);
        
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        const label = `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}`;
        
        result.push({
          inicio: new Date(inicio),
          fin: new Date(fin),
          diasUtiles: contarDiasUtiles(inicio, fin),
          label,
        });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    // 1. Fetch sellers
    const cuotaResult = await query(
      `SELECT s.id as seller_id, s.name, s.user_id
       FROM sellers s
       WHERE s.cids = ?`,
      [companyId]
    );
    const sellers = cuotaResult.rows as any[];

    // 2. Fetch sale.order for the period
    const orders = await callOdooRPC<any[]>(
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
        fields: ["id", "user_id", "state", "date_order", "amount_total", "partner_id", "invoice_status", "invoice_ids"],
        limit: 50000,
      }
    );

    // DEBUG
    const totalOrders = (orders || []).length;
    const byInvoiceStatus: Record<string, number> = {};
    (orders || []).forEach((o: any) => {
      byInvoiceStatus[o.invoice_status || "null"] = (byInvoiceStatus[o.invoice_status || "null"] || 0) + 1;
    });
    console.log(`[Efectividad] company=${companyId} periodo=${periodoParam} (${fechaInicio} a ${fechaFin}) totalOrders=${totalOrders}`);
    console.log(`[Efectividad] byInvoiceStatus:`, JSON.stringify(byInvoiceStatus));

    // 3. Normalize seller names
    const normalizedSellerMap: Record<string, string> = {};
    const sellerDataMap: Record<string, {
      nombre: string;
      ordenes: number;
      facturadas: number;
      montoOrdenes: number;
      montoFacturadas: number;
      semanas: { ordenes: number; facturadas: number; montoOrdenes: number; montoFacturadas: number }[];
    }> = {};

    sellers.forEach((s: any) => {
      const norm = normalize(s.name);
      normalizedSellerMap[norm] = s.name;
      sellerDataMap[s.name] = {
        nombre: s.name,
        ordenes: 0,
        facturadas: 0,
        montoOrdenes: 0,
        montoFacturadas: 0,
        semanas: semanas.map(() => ({ ordenes: 0, facturadas: 0, montoOrdenes: 0, montoFacturadas: 0 })),
      };
    });

    // 4. Process orders
    (orders || []).forEach((order: any) => {
      const sellerName = order.user_id?.[1];
      if (!sellerName) return;
      const norm = normalize(sellerName);
      const matchedName = normalizedSellerMap[norm];
      if (!matchedName || !sellerDataMap[matchedName]) return;

      const amount = Number(order.amount_total) || 0;
      const hasInvoiceIds = order.invoice_ids && order.invoice_ids.length > 0;
      const isInvoiced = hasInvoiceIds || order.invoice_status === "invoiced";

      sellerDataMap[matchedName].ordenes++;
      sellerDataMap[matchedName].montoOrdenes += amount;

      if (isInvoiced) {
        sellerDataMap[matchedName].facturadas++;
        sellerDataMap[matchedName].montoFacturadas += amount;
      }

      // Distribute by week
      const orderDate = new Date(order.date_order);
      for (let i = 0; i < semanas.length; i++) {
        if (orderDate >= semanas[i].inicio && orderDate <= semanas[i].fin) {
          sellerDataMap[matchedName].semanas[i].ordenes++;
          sellerDataMap[matchedName].semanas[i].montoOrdenes += amount;
          if (isInvoiced) {
            sellerDataMap[matchedName].semanas[i].facturadas++;
            sellerDataMap[matchedName].semanas[i].montoFacturadas += amount;
          }
          break;
        }
      }
    });

    // 5. Load meta
    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["efectividad_cierre", companyId, mes]
    );
    const metaEfectividad = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    // 6. Build response
    const result = Object.values(sellerDataMap).map((seller) => {
      const efectividad = seller.ordenes > 0
        ? Math.round((seller.facturadas / seller.ordenes) * 100)
        : 0;
      const efectividadPct = metaEfectividad > 0 ? Math.round((efectividad / metaEfectividad) * 100) : 0;

      const semanasCalc = seller.semanas.map((sem, i) => {
        const semanaInicio = semanas[i].inicio;
        const esFuturo = semanaInicio > now;
        const efectividadActual = sem.ordenes > 0
          ? (sem.facturadas / sem.ordenes) * 100
          : null;
        const efectividadSem = efectividadActual !== null && metaEfectividad > 0
          ? Math.round((efectividadActual / metaEfectividad) * 100)
          : null;
        return {
          numero: i + 1,
          label: semanas[i].label,
          ordenes: sem.ordenes,
          facturadas: sem.facturadas,
          montoOrdenes: Math.round(sem.montoOrdenes * 100) / 100,
          montoFacturadas: Math.round(sem.montoFacturadas * 100) / 100,
          efectividad: esFuturo ? null : efectividadSem,
        };
      });

      return {
        nombre: seller.nombre,
        ordenes: seller.ordenes,
        facturadas: seller.facturadas,
        montoOrdenes: Math.round(seller.montoOrdenes * 100) / 100,
        montoFacturadas: Math.round(seller.montoFacturadas * 100) / 100,
        efectividad: efectividadPct,
        semanas: semanasCalc,
      };
    });

    result.sort((a, b) => b.efectividad - a.efectividad);

    // 6. Calculate global totals
    const globalOrdenes = result.reduce((sum, s) => sum + s.ordenes, 0);
    const globalFacturadas = result.reduce((sum, s) => sum + s.facturadas, 0);
    const globalEfectividad = globalOrdenes > 0 ? Math.round((globalFacturadas / globalOrdenes) * 100) : 0;
    const globalEfectividadPct = metaEfectividad > 0 ? Math.round((globalEfectividad / metaEfectividad) * 100) : 0;

    return NextResponse.json({
      success: true,
      data: {
        mes,
        periodo: periodoParam,
        periodoLabel,
        fechaInicio,
        fechaFin,
        global: {
          ordenes: globalOrdenes,
          facturadas: globalFacturadas,
          efectividad: globalEfectividadPct,
        },
        sellers: result,
      },
    });
  } catch (error: any) {
    console.error("Error en API efectividad-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
