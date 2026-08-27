import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
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

    const semanas = obtenerSemanasDelMes(anio, mesNum);
    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    const sellerResult = await query(
      `SELECT s.id as seller_id, s.name, s.user_id FROM sellers s WHERE s.cids = ? AND s.user_id = ?`,
      [companyId, uid]
    );
    const sellers = sellerResult.rows as any[];
    if (sellers.length === 0) {
      return NextResponse.json({ success: true, data: { mes, metaPerSeller: 0, totalNuevos: 0, numSellers: 0, numWeeks: semanas.length, weekHeaders: [], sellers: [] } });
    }

    const sellerName = sellers[0].name;

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["clientes_nuevos", companyId, mes]
    );
    const metaPerSeller = (metaResult.rows as any[]).length > 0 ? Number((metaResult.rows as any[])[0].meta_mensual) : 0;

    const invoices = await callOdooRPC<any[]>(
      "account.move", "search_read",
      [[
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
        ["invoice_date", ">=", fechaInicio],
        ["invoice_date", "<=", fechaFin],
        ["invoice_user_id", "=", uid],
      ]],
      { fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id", "move_type"], limit: 10000 }
    );

    const currentMonthPartnerIds = [...new Set((invoices || []).map((inv: any) => inv.partner_id?.[0]).filter(Boolean))];

    let totalNuevos = 0;
    const sellerSemanas = semanas.map(() => ({ nuevos: 0, meta: 0, porcentaje: 0 }));

    if (currentMonthPartnerIds.length > 0) {
      const historicalInvoices = await callOdooRPC<any[]>(
        "account.move", "search_read",
        [[
          ["partner_id", "in", currentMonthPartnerIds],
          ["invoice_date", "<", fechaInicio],
          ["move_type", "in", ["out_invoice", "out_refund"]],
          ["state", "=", "posted"],
          ["company_id", "=", companyId],
        ]],
        { fields: ["partner_id"], limit: 50000 }
      );

      const existingPartnerIds = new Set<number>();
      (historicalInvoices || []).forEach((inv: any) => { const pid = inv.partner_id?.[0]; if (pid) existingPartnerIds.add(pid); });

      const partnerAlreadyCounted = new Set<number>();
      (invoices || []).forEach((inv: any) => {
        const partnerId = inv.partner_id?.[0];
        if (!partnerId || existingPartnerIds.has(partnerId) || partnerAlreadyCounted.has(partnerId)) return;
        partnerAlreadyCounted.add(partnerId);
        totalNuevos++;
        const invDate = new Date(inv.invoice_date);
        for (let i = 0; i < semanas.length; i++) {
          if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) { sellerSemanas[i].nuevos++; break; }
        }
      });
    }

    if (metaPerSeller > 0) {
      const totalDiasUtilesMes = semanas.reduce((sum, s) => sum + s.diasUtiles, 0);
      semanas.forEach((semana, i) => {
        sellerSemanas[i].meta = Math.round((metaPerSeller * semana.diasUtiles / totalDiasUtilesMes) * 100) / 100;
        sellerSemanas[i].porcentaje = sellerSemanas[i].meta > 0 ? Math.round((sellerSemanas[i].nuevos / sellerSemanas[i].meta) * 100) : 0;
      });
    }

    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${s.inicio.toLocaleDateString("es-VE", opts)} - ${s.fin.toLocaleDateString("es-VE", opts)}`;
    });

    return NextResponse.json({
      success: true,
      data: {
        mes, metaPerSeller, totalNuevos, numSellers: 1, numWeeks: semanas.length, weekHeaders,
        sellers: [{ sellerId: sellers[0].seller_id, nombre: sellerName, nuevosMes: totalNuevos, semanas: sellerSemanas }],
      },
    });
  } catch (error: any) {
    console.error("Error en API clientes-nuevos-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
