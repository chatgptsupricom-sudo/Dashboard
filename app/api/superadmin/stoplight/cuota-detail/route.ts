import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

function getMonthRange(year: number, month: number) {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  return {
    firstDay: first.toISOString().split("T")[0],
    lastDay: last.toISOString().split("T")[0],
    totalDays: last.getDate(),
  };
}

function getEasterDate(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const monthNum = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, monthNum - 1, day);
}

function isVenezuelanHoliday(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const fixedHolidays: Record<string, boolean> = {
    "01-01": true, "01-06": true, "05-01": true, "06-24": true,
    "07-05": true, "07-24": true, "10-12": true, "12-24": true,
    "12-25": true, "12-31": true,
  };
  const key = `${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (fixedHolidays[key]) return true;
  const year = d.getFullYear();
  const easter = getEasterDate(year);
  const movingDates = [
    new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 2),
    new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 48),
    new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() - 47),
    new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 39),
    new Date(easter.getFullYear(), easter.getMonth(), easter.getDate() + 60),
  ];
  return movingDates.some(
    (mh) => mh.getFullYear() === year && mh.getMonth() + 1 === m && mh.getDate() === day,
  );
}

function getDaysInMonth(year: number, month: number) {
  const days: { date: string; esHabil: boolean; dow: number }[] = [];
  const { totalDays } = getMonthRange(year, month);
  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const esHabil = dow !== 0 && dow !== 6 && !isVenezuelanHoliday(dateStr);
    days.push({ date: dateStr, esHabil, dow });
  }
  return days;
}

function getWeekNumber(dateStr: string, firstDay: string): number {
  const d = new Date(dateStr + "T00:00:00");
  const first = new Date(firstDay + "T00:00:00");
  const diffDays = Math.floor((d.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
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

    const { searchParams } = new URL(request.url);
    const companyId = parseInt(searchParams.get("company_id") || "9");
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));

    const { firstDay, lastDay } = getMonthRange(year, month);
    const daysInMonth = getDaysInMonth(year, month);
    const businessDays = daysInMonth.filter((d) => d.esHabil).length;

    const [sellerResult]: any = await db.query(
      "SELECT id, name, user_id FROM sellers WHERE cids = ?",
      [companyId]
    );
    const sellers = sellerResult || [];

    const [cuotaResult]: any = await db.query(
      "SELECT c.seller_id, c.cuota FROM cuota c INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date"
    );
    const cuotaMap: Record<number, number> = {};
    (cuotaResult || []).forEach((c: any) => {
      cuotaMap[c.seller_id] = Number(c.cuota);
    });

    const invoicesDomain: any[] = [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["invoice_date", ">=", firstDay],
      ["invoice_date", "<=", lastDay],
      ["company_id", "=", companyId],
    ];
    const allInvoices = (await callOdooRPC<any[]>("account.move", "search_read", [invoicesDomain], {
      fields: ["amount_untaxed", "invoice_user_id", "invoice_date", "move_type"],
      limit: 5000,
    })) || [];

    const normalize = (s: string) =>
      (s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/\./g, "")
        .trim()
        .replace(/\s+/g, " ");

    const facturadoByUser: Record<number, number> = {};
    const facturadoByDate: Record<number, Record<string, number>> = {};
    allInvoices.forEach((inv: any) => {
      const userId = inv.invoice_user_id?.[0];
      const amount = inv.move_type === "out_refund" ? -(inv.amount_untaxed || 0) : (inv.amount_untaxed || 0);
      const dateStr = (inv.invoice_date || "").split("T")[0];
      if (userId) {
        facturadoByUser[userId] = (facturadoByUser[userId] || 0) + amount;
        if (!facturadoByDate[userId]) facturadoByDate[userId] = {};
        facturadoByDate[userId][dateStr] = (facturadoByDate[userId][dateStr] || 0) + amount;
      }
    });

    const result = sellers
      .filter((s: any) => {
        const cuotaVal = cuotaMap[s.id] || 0;
        return cuotaVal > 0;
      })
      .map((seller: any) => {
        const cuotaMensual = cuotaMap[seller.id] || 0;
        const cuotaDiaria = businessDays > 0 ? cuotaMensual / businessDays : 0;
        const totalWeeks = Math.ceil(daysInMonth.length / 7);
        const cuotaSemanal = totalWeeks > 0 ? cuotaMensual / totalWeeks : 0;
        const facturadoMes = facturadoByUser[seller.user_id] || 0;
        const facturadoByDate = facturadoByDate[seller.user_id] || {};

        const diasDetalle = daysInMonth.map((day) => ({
          date: day.date,
          esHabil: day.esHabil,
          facturado: day.esHabil ? (facturadoByDate[day.date] || 0) : 0,
          cuotaDiaria: day.esHabil ? cuotaDiaria : 0,
          cumple: day.esHabil ? (facturadoByDate[day.date] || 0) >= cuotaDiaria : true,
        }));

        const semanas: Record<number, { facturado: number; cuotaSemanal: number }> = {};
        daysInMonth.forEach((day) => {
          if (!day.esHabil) return;
          const weekNum = getWeekNumber(day.date, firstDay);
          if (!semanas[weekNum]) semanas[weekNum] = { facturado: 0, cuotaSemanal };
          semanas[weekNum].facturado += facturadoByDate[day.date] || 0;
        });
        const semanasDetalle = Object.entries(semanas).map(([num, data]) => ({
          semana: `Sem ${num}`,
          facturado: data.facturado,
          cuotaSemanal: data.cuotaSemanal,
          cumple: data.facturado >= data.cuotaSemanal,
        }));

        return {
          seller_id: seller.id,
          name: seller.name,
          cuota_mensual: cuotaMensual,
          facturado_mes: facturadoMes,
          dias_habiles: businessDays,
          cuota_diaria: Math.round(cuotaDiaria * 100) / 100,
          cuota_semanal: Math.round(cuotaSemanal * 100) / 100,
          dias_detalle: diasDetalle,
          semanas_detalle: semanasDetalle,
        };
      })
      .sort((a: any, b: any) => {
        const pctA = a.cuota_mensual > 0 ? a.facturado_mes / a.cuota_mensual : 0;
        const pctB = b.cuota_mensual > 0 ? b.facturado_mes / b.cuota_mensual : 0;
        return pctB - pctA;
      });

    return NextResponse.json({ sellers: result });
  } catch (error: any) {
    console.error("Error en cuota-detail:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
