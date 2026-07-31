import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { esDiaUtil, contarDiasUtiles, esFeriado } from "@/lib/feriados";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);

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

    // 1. Fetch sellers and cuotas
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
    const sellers = cuotaResult.rows as any[];

    // 2. Fetch invoices
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
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date"],
        limit: 10000,
      }
    );

    // 3. Business days calculation
    const totalDiasUtiles = contarDiasUtiles(
      new Date(anio, mesNum - 1, 1),
      new Date(anio, mesNum, 0)
    );

    // Helper to normalize names for matching
    function normalize(str: string): string {
      return str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\./g, "")
        .toUpperCase()
        .trim()
        .replace(/\s+/g, " ");
    }

    // Build normalized name map from invoices
    const invoiceNameMap: Record<string, any[]> = {};
    (invoices || []).forEach((inv: any) => {
      const rawName = inv.invoice_user_id?.[1] || "";
      const norm = normalize(rawName);
      if (!invoiceNameMap[norm]) invoiceNameMap[norm] = [];
      invoiceNameMap[norm].push(inv);
    });

    // 4. Build per-seller detail with daily breakdown
    const result = sellers.map((seller) => {
      const cuotaNum = Number(seller.cuota || 0);
      const cuotaDiaria = totalDiasUtiles > 0 ? cuotaNum / totalDiasUtiles : 0;

      const sellerNorm = normalize(seller.name);
      const sellerInvoices = invoiceNameMap[sellerNorm] || [];

      const totalFacturado = sellerInvoices.reduce(
        (sum: number, inv: any) => sum + (Number(inv.amount_untaxed) || 0), 0
      );

      // Daily map: date -> facturado
      const dailyMap: Record<string, number> = {};
      sellerInvoices.forEach((inv: any) => {
        const dateStr = inv.invoice_date.split("T")[0];
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + (Number(inv.amount_untaxed) || 0);
      });

      // Build calendar days
      const dias: { fecha: string; diaSemana: string; esFeriado: boolean; esDiaUtil: boolean; facturado: number; cuotaDiaria: number; cumple: boolean }[] = [];
      for (let d = 1; d <= ultimoDia; d++) {
        const date = new Date(anio, mesNum - 1, d);
        const dateStr = `${anio}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const dayOfWeek = date.getDay();
        const diaSemana = ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][dayOfWeek];
        const esFeriadoDia = esFeriado(date);
        const esDiaUtilDia = esDiaUtil(date);
        const facturado = dailyMap[dateStr] || 0;

        dias.push({
          fecha: dateStr,
          diaSemana,
          esFeriado: esFeriadoDia,
          esDiaUtil: esDiaUtilDia,
          facturado,
          cuotaDiaria: esDiaUtilDia ? cuotaDiaria : 0,
          cumple: esDiaUtilDia ? facturado >= cuotaDiaria : true,
        });
      }

      // Weekly summary
      const semanas: { numero: number; inicio: string; fin: string; facturado: number; cuotaSemanal: number; diasUtiles: number; porcentaje: number }[] = [];
      const primerDiaMes = new Date(anio, mesNum - 1, 1);
      let semanaInicio = new Date(primerDiaMes);

      let numSemana = 1;
      while (semanaInicio <= new Date(anio, mesNum, 0)) {
        let semanaFin = new Date(semanaInicio);
        semanaFin.setDate(semanaFin.getDate() + 6);
        if (semanaFin > new Date(anio, mesNum, 0)) {
          semanaFin = new Date(anio, mesNum, 0);
        }

        const diasUtilesSemana = contarDiasUtiles(semanaInicio, semanaFin);
        const cuotaSemanal = cuotaNum * (diasUtilesSemana / totalDiasUtiles);

        let facturadoSemana = 0;
        for (let d = new Date(semanaInicio); d <= semanaFin; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split("T")[0];
          facturadoSemana += dailyMap[dateStr] || 0;
        }

        const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
        semanas.push({
          numero: numSemana,
          inicio: semanaInicio.toLocaleDateString("es-VE", opts),
          fin: semanaFin.toLocaleDateString("es-VE", opts),
          facturado: Math.round(facturadoSemana * 100) / 100,
          cuotaSemanal: Math.round(cuotaSemanal * 100) / 100,
          diasUtiles: diasUtilesSemana,
          porcentaje: cuotaSemanal > 0 ? Math.round((facturadoSemana / cuotaSemanal) * 100) : 0,
        });

        semanaInicio = new Date(semanaFin);
        semanaInicio.setDate(semanaInicio.getDate() + 1);
        numSemana++;
      }

      return {
        sellerId: seller.seller_id,
        nombre: seller.name,
        cuotaMensual: cuotaNum,
        cuotaDiaria: Math.round(cuotaDiaria * 100) / 100,
        totalFacturado: Math.round(totalFacturado * 100) / 100,
        porcentajeMensual: cuotaNum > 0 ? Math.round((totalFacturado / cuotaNum) * 100) : 0,
        cumple: totalFacturado >= cuotaNum,
        dias,
        semanas,
      };
    });

    // Sort: who met quota first
    result.sort((a, b) => b.porcentajeMensual - a.porcentajeMensual);

    return NextResponse.json({
      success: true,
      data: {
        mes,
        totalDiasUtiles,
        sellers: result,
      },
    });
  } catch (error: any) {
    console.error("Error en API cuota-detalle:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
