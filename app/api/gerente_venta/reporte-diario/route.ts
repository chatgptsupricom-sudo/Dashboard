import { db } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "GzC8WCMdNfmi9qX7Oj01U/FTwaOAOwMh5EYE8VukFM8=",
);

const COMPANY_IDS_ALL = [9, 10, 7];
const COMPANY_NAME_MAP: Record<number, string> = {
  9: "Valencia",
  10: "Caracas",
  7: "Panamá",
};

function isBusinessDay(date: Date): boolean {
  const day = date.getDay();
  return day !== 0 && day !== 6;
}

function getBusinessDaysInMonth(year: number, month: number): number {
  let count = 0;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (isBusinessDay(new Date(year, month, d))) count++;
  }
  return count;
}

function getBusinessDaysElapsed(
  year: number,
  month: number,
  day: number,
): number {
  let count = 0;
  for (let d = 1; d <= day; d++) {
    if (isBusinessDay(new Date(year, month, d))) count++;
  }
  return count;
}

const normalize = (s: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ");

export async function GET(req: Request) {
  try {
    const cookieHeader = req.headers.get("cookie") || "";
    const token = cookieHeader.split("token=")[1]?.split(";")[0];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    const userCids = payload.cids as number;

    const isSuperAdmin =
      userRole === "superadmin" || userRole === "super admin";

    const { searchParams } = new URL(req.url);
    const dateParam =
      searchParams.get("date") || new Date().toISOString().split("T")[0];
    const sedeParam = searchParams.get("sede");

    let companyIds: number[];
    if (isSuperAdmin && sedeParam && sedeParam !== "all") {
      companyIds = [parseInt(sedeParam)];
    } else if (isSuperAdmin) {
      companyIds = COMPANY_IDS_ALL;
    } else {
      companyIds = [userCids];
    }

    const selectedDate = new Date(dateParam + "T12:00:00");
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();

    const diasHabiles = getBusinessDaysInMonth(year, month);
    const diasTranscurridos = getBusinessDaysElapsed(
      year,
      month,
      selectedDate.getDate(),
    );
    const porcentajeDias =
      diasHabiles > 0 ? Math.round((diasTranscurridos / diasHabiles) * 100) : 0;

    const placeholders = companyIds.map(() => "?").join(",");
    const [resultSellers]: any = await db.query(
      `SELECT id, name, user_id, cids FROM sellers WHERE cids IN (${placeholders})`,
      companyIds,
    );
    const sellers = (resultSellers || []).filter(
      (s: any) =>
        s.name?.toUpperCase().trim() !== "MARIA AUXILIADORA TOVAR CARO",
    );

    if (sellers.length === 0) {
      return NextResponse.json({
        fecha: dateParam,
        diasHabiles,
        diasTranscurridos,
        porcentajeDias,
        meta: 0,
        cuotaAlDia: 0,
        ventas: 0,
        pedidos: 0,
        ventaMasPedidos: 0,
        vendedores: [],
        sedes: isSuperAdmin
          ? COMPANY_IDS_ALL.map((id) => ({
              id,
              name: COMPANY_NAME_MAP[id] || `Sede ${id}`,
            }))
          : [],
      });
    }

    const sellerIds = sellers.map((s: any) => s.id);
    const cuotaPlaceholders = sellerIds.map(() => "?").join(",");
    const [resultCuotas]: any = await db.query(
      `
      SELECT c.seller_id, c.cuota FROM cuota c
      INNER JOIN (SELECT seller_id, MAX(created_at) as max_date FROM cuota GROUP BY seller_id) latest
      ON c.seller_id = latest.seller_id AND c.created_at = latest.max_date
      WHERE c.seller_id IN (${cuotaPlaceholders})
    `,
      sellerIds,
    );
    const cuotas = resultCuotas || [];

    const meta = cuotas.reduce(
      (sum: number, c: any) => sum + (parseFloat(c.cuota) || 0),
      0,
    );
    const cuotaDiariaMes = diasHabiles > 0 ? meta / diasHabiles : 0;
    const cuotaAlDiaGlobal = cuotaDiariaMes * diasTranscurridos;

    const dateStr = selectedDate.toISOString().split("T")[0];
    const dayStart = `${dateStr} 00:00:00`;
    const dayEnd = `${dateStr} 23:59:59`;

    const firstDayOfMonth = new Date(year, month, 1)
      .toISOString()
      .split("T")[0];

    // ── VENTAS: facturación acumulada del mes hasta la fecha (patrón cuota route) ──
    const allInvoices =
      (await callOdooRPC<any[]>(
        "account.move",
        "search_read",
        [
          [
            ["move_type", "in", ["out_invoice", "out_refund"]],
            ["state", "=", "posted"],
            ["invoice_date", ">=", firstDayOfMonth],
            ["invoice_date", "<=", dateStr],
          ],
        ],
        {
          fields: ["amount_untaxed", "invoice_user_id", "move_type"],
        },
      )) || [];

    const odooNameMap: Record<string, number> = {};
    const odooUserIdMap: Record<number, number> = {};
    allInvoices.forEach((inv: any) => {
      const userId = inv.invoice_user_id?.[0] || 0;
      const odooName = inv.invoice_user_id?.[1] || "";
      const amount =
        inv.move_type === "out_refund"
          ? -(inv.amount_untaxed || 0)
          : inv.amount_untaxed || 0;
      if (userId) odooUserIdMap[userId] = (odooUserIdMap[userId] || 0) + amount;
      if (odooName) {
        const key = normalize(odooName);
        odooNameMap[key] = (odooNameMap[key] || 0) + amount;
      }
    });

    // ── PEDIDOS: cotizaciones (draft/sent) + órdenes confirmadas NO facturadas ──
    const dateFilters = [
      ["date_order", ">=", `${firstDayOfMonth} 00:00:00`],
      ["date_order", "<=", dayEnd],
      ["partner_id.name", "not ilike", "office solution"],
      ["partner_id.name", "not ilike", "supricom"],
    ];
    const [quotations, confirmedOrders] = await Promise.all([
      callOdooRPC<any[]>(
        "sale.order",
        "search_read",
        [[["state", "in", ["draft", "sent"]], ...dateFilters]],
        { fields: ["amount_untaxed", "user_id"] },
      ),
      callOdooRPC<any[]>(
        "sale.order",
        "search_read",
        [[["state", "in", ["sale", "done"]], ["invoice_ids", "=", false], ...dateFilters]],
        { fields: ["amount_untaxed", "user_id"] },
      ),
    ]);
    const allOrders = [...(quotations || []), ...(confirmedOrders || [])];

    const orderNameMap: Record<string, number> = {};
    const orderUserIdMap: Record<number, number> = {};
    allOrders.forEach((order: any) => {
      const userId = order.user_id?.[0] || 0;
      const odooName = order.user_id?.[1] || "";
      const amount = order.amount_untaxed || 0;
      if (userId)
        orderUserIdMap[userId] = (orderUserIdMap[userId] || 0) + amount;
      if (odooName) {
        const key = normalize(odooName);
        orderNameMap[key] = (orderNameMap[key] || 0) + amount;
      }
    });

    // ── Cruzar datos ──
    const vendedores = sellers
      .map((seller: any) => {
        const cuota = parseFloat(
          (
            cuotas.find((c: any) => c.seller_id === seller.id)?.cuota || 0
          ).toString(),
        );
        const cuotaDiaria = diasHabiles > 0 ? cuota / diasHabiles : 0;
        const cuotaVendedorAlDia = cuotaDiaria * diasTranscurridos;

        const sellerKey = normalize(seller.name);
        const venta = parseFloat(
          (
            odooNameMap[sellerKey] ??
            odooUserIdMap[seller.user_id] ??
            0
          ).toFixed(2),
        );
        const pedido = parseFloat(
          (
            orderNameMap[sellerKey] ??
            orderUserIdMap[seller.user_id] ??
            0
          ).toFixed(2),
        );
        const ventaMasPedidos = venta + pedido;
        const porcentaje =
          cuotaVendedorAlDia > 0
            ? Math.round((venta / cuotaVendedorAlDia) * 100)
            : 0;

        return {
          name: seller.name,
          cuota,
          cuotaDiaria: Math.round(cuotaDiaria),
          cuotaAlDia: Math.round(cuotaVendedorAlDia),
          venta,
          pedidos: pedido,
          ventaMasPedidos: parseFloat(ventaMasPedidos.toFixed(2)),
          porcentaje,
          posicion: 0,
        };
      })
      .sort((a: any, b: any) => b.venta - a.venta)
      .map((v: any, i: number) => ({ ...v, posicion: i + 1 }));

    const totalVentas = vendedores.reduce(
      (sum: number, v: any) => sum + v.venta,
      0,
    );
    const totalPedidos = vendedores.reduce(
      (sum: number, v: any) => sum + v.pedidos,
      0,
    );
    const totalVentaMasPedidos = totalVentas + totalPedidos;

    return NextResponse.json({
      fecha: dateStr,
      diasHabiles,
      diasTranscurridos,
      porcentajeDias,
      meta: Math.round(meta),
      cuotaAlDia: Math.round(cuotaAlDiaGlobal),
      ventas: parseFloat(totalVentas.toFixed(2)),
      pedidos: parseFloat(totalPedidos.toFixed(2)),
      ventaMasPedidos: parseFloat(totalVentaMasPedidos.toFixed(2)),
      vendedores,
      sedes: isSuperAdmin
        ? COMPANY_IDS_ALL.map((id) => ({
            id,
            name: COMPANY_NAME_MAP[id] || `Sede ${id}`,
          }))
        : [],
    });
  } catch (error: any) {
    console.error("Error en reporte-diario:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
