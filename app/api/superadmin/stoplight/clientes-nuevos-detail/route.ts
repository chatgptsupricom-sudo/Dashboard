import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { obtenerSemanasDelMes } from "@/lib/feriados";
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
    const companyId = companyIdParam ? parseInt(companyIdParam, 10) : (payload.cids as number);

    const now = new Date();
    const mes = mesParam || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [anioStr, mesStr] = mes.split("-");
    const anio = parseInt(anioStr, 10);
    const mesNum = parseInt(mesStr, 10);

    const semanas = obtenerSemanasDelMes(anio, mesNum);

    const fechaInicio = `${anio}-${String(mesNum).padStart(2, "0")}-01`;
    const fechaFin = `${anio}-${String(mesNum).padStart(2, "0")}-${new Date(anio, mesNum, 0).getDate()}`;

    // 1. Fetch sellers
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

    // 2. Load goal per seller from kpi_targets
    const metaResult = await query(
      "SELECT meta_mensual FROM kpi_targets WHERE kpi_key = ? AND company_id = ? AND mes = ?",
      ["clientes_nuevos", companyId, mes]
    );
    const metaPerSeller = (metaResult.rows as any[]).length > 0
      ? Number((metaResult.rows as any[])[0].meta_mensual)
      : 0;

    // 3. Fetch current month invoices
    const invoices = await callOdooRPC<any[]>(
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
        fields: ["id", "invoice_user_id", "amount_untaxed", "invoice_date", "partner_id"],
        limit: 10000,
      }
    );

    // 4. Build normalized seller map
    const normalizedSellerMap: Record<string, string> = {};
    const sellerMap: Record<string, {
      sellerId: number;
      nombre: string;
      cuotaMensual: number;
      totalFacturado: number;
      nuevosMes: number;
      semanas: { nuevos: number; meta: number; porcentaje: number }[];
    }> = {};

    sellers.forEach((s) => {
      const norm = normalize(s.name);
      normalizedSellerMap[norm] = s.name;
      sellerMap[s.name] = {
        sellerId: s.seller_id,
        nombre: s.name,
        cuotaMensual: Number(s.cuota || 0),
        totalFacturado: 0,
        nuevosMes: 0,
        semanas: semanas.map(() => ({ nuevos: 0, meta: 0, porcentaje: 0 })),
      };
    });

    // 5. Track facturado per seller
    (invoices || []).forEach((inv: any) => {
      const sellerName = inv.invoice_user_id?.[1];
      if (!sellerName) return;
      const norm = normalize(sellerName);
      const matchedName = normalizedSellerMap[norm];
      if (!matchedName || !sellerMap[matchedName]) return;

      const amount = Number(inv.amount_untaxed) || 0;
      const realAmount = inv.move_type === "out_refund" ? -amount : amount;
      sellerMap[matchedName].totalFacturado += realAmount;

      const invDate = new Date(inv.invoice_date);
      for (let i = 0; i < semanas.length; i++) {
        if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
          break;
        }
      }
    });

    // 6. Determine new clients (partners whose FIRST invoice in Odoo is in this month)
    const currentMonthPartnerIds = [...new Set(
      (invoices || [])
        .map((inv: any) => inv.partner_id?.[0])
        .filter(Boolean)
    )];

    let clientesNuevosPorSellerPorSemana: Record<string, Record<number, number>> = {};
    let totalNuevos = 0;

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
        {
          fields: ["partner_id"],
          limit: 50000,
        }
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

        const sellerName = inv.invoice_user_id?.[1];
        if (!sellerName) return;
        const norm = normalize(sellerName);
        const matchedName = normalizedSellerMap[norm];
        if (!matchedName || !sellerMap[matchedName]) return;

        sellerMap[matchedName].nuevosMes += 1;
        totalNuevos += 1;

        const invDate = new Date(inv.invoice_date);
        for (let i = 0; i < semanas.length; i++) {
          if (invDate >= semanas[i].inicio && invDate <= semanas[i].fin) {
            if (!clientesNuevosPorSellerPorSemana[matchedName]) {
              clientesNuevosPorSellerPorSemana[matchedName] = {};
            }
            clientesNuevosPorSellerPorSemana[matchedName][i] =
              (clientesNuevosPorSellerPorSemana[matchedName][i] || 0) + 1;
            sellerMap[matchedName].semanas[i].nuevos += 1;
            break;
          }
        }
      });
    }

    // 7. Calculate weekly meta per seller and percentage
    if (metaPerSeller > 0) {
      const totalDiasUtilesMes = semanas.reduce((sum, s) => sum + s.diasUtiles, 0);
      Object.values(sellerMap).forEach((seller) => {
        semanas.forEach((semana, i) => {
          seller.semanas[i].meta = Math.round(
            (metaPerSeller * semana.diasUtiles / totalDiasUtilesMes) * 100
          ) / 100;
          seller.semanas[i].porcentaje =
            seller.semanas[i].meta > 0
              ? Math.round((seller.semanas[i].nuevos / seller.semanas[i].meta) * 100)
              : 0;
        });
      });
    }

    // 8. Sort by nuevosMes descending
    const sellerArray = Object.values(sellerMap).sort((a, b) => b.nuevosMes - a.nuevosMes);

    const weekHeaders = semanas.map((s) => {
      const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
      return `${s.inicio.toLocaleDateString("es-VE", opts)} - ${s.fin.toLocaleDateString("es-VE", opts)}`;
    });

    return NextResponse.json({
      success: true,
      data: {
        mes,
        metaPerSeller,
        totalNuevos,
        numSellers: sellers.length,
        numWeeks: semanas.length,
        weekHeaders,
        sellers: sellerArray,
      },
    });
  } catch (error: any) {
    console.error("Error en API clientes-nuevos-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
