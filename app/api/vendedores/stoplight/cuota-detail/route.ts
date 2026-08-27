import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { esDiaUtil, contarDiasUtiles, esFeriado } from "@/lib/feriados";
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

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const ultimoDia = new Date(anio, mesNum, 0).getDate();
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${ultimoDia}`;

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
      return NextResponse.json({ success: true, data: { mes, totalDiasUtiles: 0, sellers: [] } });
    }

    const seller = sellers[0];
    const cuotaNum = Number(seller.cuota || 0);
    const totalDiasUtiles = contarDiasUtiles(new Date(anio, mesNum - 1, 1), new Date(anio, mesNum, 0));

    const invoices = await callOdooRPC<any[]>(
      "account.move", "search_read",
      [[
        ["move_type", "=", "out_invoice"],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
        ["invoice_date", ">=", fechaInicio],
        ["invoice_date", "<=", fechaFin],
        ["invoice_user_id", "=", uid],
      ]],
      { fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "move_type"], limit: 10000 }
    );

    const dailyMap: Record<string, number> = {};
    let totalFacturado = 0;
    (invoices || []).forEach((inv: any) => {
      const amount = Number(inv.amount_untaxed) || 0;
      dailyMap[inv.invoice_date] = (dailyMap[inv.invoice_date] || 0) + amount;
      totalFacturado += amount;
    });

    const cuotaDiaria = totalDiasUtiles > 0 ? cuotaNum / totalDiasUtiles : 0;

    const dias = [];
    for (let d = 1; d <= ultimoDia; d++) {
      const date = new Date(anio, mesNum - 1, d);
      const dateStr = `${anio}-${String(mesNum).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const esFeriadoDia = esFeriado(date);
      const esDiaUtilDia = esDiaUtil(date);
      const facturado = dailyMap[dateStr] || 0;
      dias.push({
        fecha: dateStr,
        diaSemana: ["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"][date.getDay()],
        esFeriado: esFeriadoDia,
        esDiaUtil: esDiaUtilDia,
        facturado,
        cuotaDiaria: esDiaUtilDia ? cuotaDiaria : 0,
        cumple: esDiaUtilDia ? facturado >= cuotaDiaria : true,
      });
    }

    const semanas: any[] = [];
    let semanaInicio = new Date(anio, mesNum - 1, 1);
    let numSemana = 1;
    while (semanaInicio <= new Date(anio, mesNum, 0)) {
      let semanaFin = new Date(semanaInicio);
      semanaFin.setDate(semanaFin.getDate() + 6);
      if (semanaFin > new Date(anio, mesNum, 0)) semanaFin = new Date(anio, mesNum, 0);
      const diasUtilesSemana = contarDiasUtiles(semanaInicio, semanaFin);
      const cuotaSemanal = cuotaNum * (diasUtilesSemana / totalDiasUtiles);
      let facturadoSemana = 0;
      for (let d = new Date(semanaInicio); d <= semanaFin; d.setDate(d.getDate() + 1)) {
        facturadoSemana += dailyMap[d.toISOString().split("T")[0]] || 0;
      }
      const esFuturo = semanaInicio > now;
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      semanas.push({
        numero: numSemana,
        inicio: semanaInicio.toLocaleDateString("es-VE", opts),
        fin: semanaFin.toLocaleDateString("es-VE", opts),
        facturado: Math.round(facturadoSemana * 100) / 100,
        cuotaSemanal: Math.round(cuotaSemanal * 100) / 100,
        diasUtiles: diasUtilesSemana,
        porcentaje: esFuturo ? null : (cuotaSemanal > 0 ? Math.round((facturadoSemana / cuotaSemanal) * 100) : 0),
      });
      semanaInicio = new Date(semanaFin);
      semanaInicio.setDate(semanaInicio.getDate() + 1);
      numSemana++;
    }

    return NextResponse.json({
      success: true,
      data: {
        mes,
        totalDiasUtiles,
        sellers: [{
          sellerId: seller.seller_id,
          nombre: seller.name,
          cuotaMensual: cuotaNum,
          cuotaDiaria: Math.round(cuotaDiaria * 100) / 100,
          totalFacturado: Math.round(totalFacturado * 100) / 100,
          porcentajeMensual: cuotaNum > 0 ? Math.round((totalFacturado / cuotaNum) * 100) : 0,
          cumple: totalFacturado >= cuotaNum,
          dias,
          semanas,
        }],
      },
    });
  } catch (error: any) {
    console.error("Error en API cuota-detalle vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
