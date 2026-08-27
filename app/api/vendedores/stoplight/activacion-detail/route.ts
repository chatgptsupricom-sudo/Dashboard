import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { contarDiasUtiles } from "@/lib/feriados";
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

    const semanas = (() => {
      const result: { inicio: Date; fin: Date }[] = [];
      let inicio = new Date(anio, mesNum - 1, 1);
      const ultimoDiaMes = new Date(anio, mesNum, 0);
      while (inicio <= ultimoDiaMes) {
        let fin = new Date(inicio);
        fin.setDate(fin.getDate() + 6);
        if (fin > ultimoDiaMes) fin = new Date(ultimoDiaMes);
        result.push({ inicio: new Date(inicio), fin: new Date(fin) });
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
      return NextResponse.json({ success: true, data: { mes, sellers: [] } });
    }

    const allClients = (await callOdooRPC<any[]>(
      "res.partner", "search_read",
      [[["user_id", "=", uid], ["customer_rank", ">", 0], ["active", "=", true]]],
      { fields: ["id"], limit: 10000 }
    )) || [];
    const clientIds = allClients.map((c: any) => c.id);
    const total = clientIds.length;

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
      { fields: ["id", "partner_id", "invoice_date"], limit: 10000 }
    );

    const invoicePartnerIds = [...new Set((invoices || []).map((inv: any) => inv.partner_id?.[0]).filter(Boolean))];
    const activePartnerIds = invoicePartnerIds.filter((pid: number) => clientIds.includes(pid));
    const activos = activePartnerIds.length;

    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["activacion_cartera", companyId, mes]
    );
    const metaActivacion = (metaResult.rows as any[])[0]?.meta_mensual || 0;

    const semanaActivacion = semanas.map((sem) => {
      const esFuturo = sem.inicio > now;
      if (esFuturo) return null;
      if (total <= 0) return null;
      if (metaActivacion > 0) {
        const count = (invoices || []).filter((inv: any) => {
          const pid = inv.partner_id?.[0];
          const d = new Date(inv.invoice_date);
          return pid && activePartnerIds.includes(pid) && d >= sem.inicio && d <= sem.fin;
        }).length;
        return `${Math.round((count / metaActivacion) * 100)}%`;
      }
      return null;
    });

    return NextResponse.json({
      success: true,
      data: {
        mes,
        sellers: [{
          nombre: sellers[0].name,
          sellerId: sellers[0].seller_id,
          total,
          activos,
          metaActivacion,
          pctMeta: metaActivacion > 0 ? Math.round((activos / metaActivacion) * 100) : (total > 0 ? Math.round((activos / total) * 100) : 0),
          semanas: semanaActivacion,
        }],
      },
    });
  } catch (error: any) {
    console.error("Error en API activacion-detail vendedor:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
