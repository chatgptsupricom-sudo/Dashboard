import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";
import { jwtSecretBytes } from "@/lib/env";


export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, jwtSecretBytes());
    const uid = payload.uid as number;

    const url = new URL(request.url);
    const companyIdParam = url.searchParams.get("company_id");
    const mesParam = url.searchParams.get("mes");
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;

    const semanas = (() => {
      const result: { inicio: Date; fin: Date; label: string }[] = [];
      let inicio = new Date(anio, mesNum - 1, 1);
      const ultimoDiaMes = new Date(anio, mesNum, 0);
      while (inicio <= ultimoDiaMes) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > ultimoDiaMes) fin = new Date(ultimoDiaMes);
        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        result.push({ inicio: new Date(inicio), fin: new Date(fin), label: `${inicio.toLocaleDateString("es-VE", opts)} - ${fin.toLocaleDateString("es-VE", opts)}` });
        inicio = new Date(fin);
        inicio.setDate(inicio.getDate() + 1);
      }
      return result;
    })();

    const sellerResult = await query(
      `SELECT s.id as seller_id, s.name FROM sellers s WHERE s.cids = ? AND s.user_id = ?`,
      [companyId, uid]
    );
    const sellers = sellerResult.rows as any[];
    if (sellers.length === 0) {
      return NextResponse.json({ success: true, data: { mes, global: { ordenes: 0, facturadas: 0, efectividad: 0 }, sellers: [] } });
    }

    const orders = await callOdooRPC<any[]>(
      "sale.order", "search_read",
      [[
        ["state", "in", ["sale", "done"]],
        ["company_id", "=", companyId],
        ["date_order", ">=", fechaInicio],
        ["date_order", "<=", fechaFin + " 23:59:59"],
        ["user_id", "=", uid],
      ]],
      { fields: ["id", "user_id", "state", "date_order", "amount_total", "partner_id", "invoice_status", "invoice_ids"], limit: 50000 }
    );

    const semanasData = semanas.map(() => ({ ordenes: 0, facturadas: 0, montoOrdenes: 0, montoFacturadas: 0 }));
    let totalOrdenes = 0;
    let totalFacturadas = 0;
    let totalMonto = 0;
    let totalMontoFact = 0;

    (orders || []).forEach((order: any) => {
      const amount = Number(order.amount_total) || 0;
      const hasInvoiceIds = order.invoice_ids && order.invoice_ids.length > 0;
      const isInvoiced = hasInvoiceIds || order.invoice_status === "invoiced";

      totalOrdenes++;
      totalMonto += amount;
      if (isInvoiced) { totalFacturadas++; totalMontoFact += amount; }

      const orderDate = new Date(order.date_order);
      for (let i = 0; i < semanas.length; i++) {
        if (orderDate >= semanas[i].inicio && orderDate <= semanas[i].fin) {
          semanasData[i].ordenes++;
          semanasData[i].montoOrdenes += amount;
          if (isInvoiced) { semanasData[i].facturadas++; semanasData[i].montoFacturadas += amount; }
          break;
        }
      }
    });

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["efectividad_cierre", companyId, mes]
    );
    const metaEfectividad = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    const efectividad = totalOrdenes > 0 ? Math.round((totalFacturadas / totalOrdenes) * 100) : 0;
    const efectividadPct = metaEfectividad > 0 ? Math.round((efectividad / metaEfectividad) * 100) : 0;

    const sellerSemanas = semanasData.map((sem, i) => {
      const esFuturo = semanas[i].inicio > now;
      const efectividadActual = sem.ordenes > 0 ? (sem.facturadas / sem.ordenes) * 100 : null;
      const efectividadSem = efectividadActual !== null && metaEfectividad > 0 ? Math.round((efectividadActual / metaEfectividad) * 100) : null;
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

    return NextResponse.json({
      success: true,
      data: {
        mes,
        global: { ordenes: totalOrdenes, facturadas: totalFacturadas, efectividad: efectividadPct },
        sellers: [{
          nombre: sellers[0].name,
          ordenes: totalOrdenes,
          facturadas: totalFacturadas,
          montoOrdenes: Math.round(totalMonto * 100) / 100,
          montoFacturadas: Math.round(totalMontoFact * 100) / 100,
          efectividad: efectividadPct,
          semanas: sellerSemanas,
        }],
      },
    });
  } catch (error: any) {
    console.error("Error en API efectividad-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
