import { query } from "@/lib/db";
import { verifyToken } from "@/lib/jwt";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Unica fuente de verdad: el JWT de la cookie — antes esta ruta confiaba
    // directo en ?userId= de la URL sin pedir ninguna sesion.
    const token = request.cookies.get("token")?.value;
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const userId = (payload as any).sub;

    if (!userId) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { rows } = await query(
      "SELECT cids FROM users_config WHERE id = ? LIMIT 1",
      [userId],
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { error: "Usuario no configurado" },
        { status: 404 },
      );
    }

    const userCids = rows[0].cids;
    const odooDomain: any[] = [["state", "in", ["sale", "done"]]];

    if (userCids !== null && userCids !== "null" && userCids !== "") {
      const companyIds = userCids
        .split(",")
        .map((id: string) => parseInt(id.trim(), 10));
      odooDomain.push(["company_id", "in", companyIds]);
    }

    // Traemos las órdenes comerciales para auditar vendedores
    const orders = await callOdooRPC<any[]>(
      "sale.order",
      "search_read",
      [odooDomain],
      {
        fields: ["user_id", "amount_total", "date_order"],
        order: "date_order desc",
      },
    );

    if (!orders || orders.length === 0) {
      return NextResponse.json({
        metrics: null,
        msg: "Sin información de ventas.",
      });
    }

    const sellerStats: Record<number, any> = {};

    orders.forEach((order) => {
      if (!order.user_id) return;
      const sId = order.user_id[0];
      const sName = order.user_id[1];
      const amount = order.amount_total || 0;
      const date = new Date(order.date_order);

      if (!sellerStats[sId]) {
        sellerStats[sId] = {
          id: sId,
          name: sName,
          total_sales: 0,
          order_count: 0,
          last_sale_date: date,
        };
      }

      sellerStats[sId].total_sales += amount;
      sellerStats[sId].order_count += 1;
      if (date > sellerStats[sId].last_sale_date) {
        sellerStats[sId].last_sale_date = date;
      }
    });

    const today = new Date();
    const allSellers = Object.values(sellerStats).map((s: any) => {
      const daysInactive = Math.floor(
        (today.getTime() - s.last_sale_date.getTime()) / (1000 * 60 * 60 * 24),
      );
      return {
        id: s.id,
        name: s.name,
        total_sales: s.total_sales,
        order_count: s.order_count,
        average_ticket: s.total_sales / s.order_count,
        days_inactive: daysInactive,
      };
    });

    const topSellers = [...allSellers]
      .sort((a, b) => b.total_sales - a.total_sales)
      .slice(0, 8);
    const topTransactions = [...allSellers]
      .sort((a, b) => b.order_count - a.order_count)
      .slice(0, 8);
    const inactiveSellers = [...allSellers]
      .sort((a, b) => b.days_inactive - a.days_inactive)
      .slice(0, 8);

    return NextResponse.json({ topSellers, topTransactions, inactiveSellers });
  } catch (error: any) {
    console.error("❌ Error BI Sellers Engine:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
