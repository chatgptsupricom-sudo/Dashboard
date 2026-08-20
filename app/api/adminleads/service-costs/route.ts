import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);

    const services: any = await query(`
      SELECT
        sc.id,
        sc.service_name,
        sc.cost_type,
        sc.monthly_cost,
        sc.payment_date,
        sc.is_paid,
        sc.created_at,
        IFNULL(SUM(st.amount_usd), 0) AS total_transactions,
        COUNT(st.id) AS transaction_count
      FROM service_costs sc
      LEFT JOIN service_transactions st
        ON st.service_name = sc.service_name
        AND st.transaction_date >= DATE_FORMAT(NOW(), '%Y-%m-01')
        AND st.transaction_date <= LAST_DAY(NOW())
      GROUP BY sc.id, sc.service_name, sc.cost_type, sc.monthly_cost, sc.payment_date, sc.is_paid, sc.created_at
      ORDER BY sc.service_name
    `);

    const totalCost = (services.rows || []).reduce((sum: number, s: any) => {
      if (s.cost_type === "subscription") {
        return sum + (parseFloat(s.monthly_cost) || 0);
      }
      return sum + (parseFloat(s.total_transactions) || 0);
    }, 0);

    return NextResponse.json({
      services: services.rows || [],
      total_monthly: Math.round(totalCost * 100) / 100,
    });
  } catch (error: any) {
    console.error("Error en GET service-costs:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);

    const body = await request.json();
    const { service_name, cost_type, monthly_cost } = body;

    if (!service_name || !cost_type) {
      return NextResponse.json(
        { error: "service_name y cost_type son requeridos" },
        { status: 400 },
      );
    }

    if (!["subscription", "topup"].includes(cost_type)) {
      return NextResponse.json(
        { error: "cost_type debe ser 'subscription' o 'topup'" },
        { status: 400 },
      );
    }

    await query(
      `INSERT INTO service_costs (service_name, cost_type, monthly_cost)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE cost_type = VALUES(cost_type), monthly_cost = VALUES(monthly_cost)`,
      [service_name, cost_type, parseFloat(monthly_cost) || 0],
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error en POST service-costs:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}

export async function PUT(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);

    const body = await request.json();
    const { id, monthly_cost, payment_date, is_paid } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (monthly_cost !== undefined) {
      fields.push("monthly_cost = ?");
      params.push(parseFloat(monthly_cost) || 0);
    }
    if (payment_date !== undefined) {
      fields.push("payment_date = ?");
      params.push(payment_date || null);
    }
    if (is_paid !== undefined) {
      fields.push("is_paid = ?");
      params.push(is_paid ? 1 : 0);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    params.push(parseInt(id));
    await query(`UPDATE service_costs SET ${fields.join(", ")} WHERE id = ?`, params);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error en PUT service-costs:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    await query("DELETE FROM service_costs WHERE id = ?", [parseInt(id)]);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error en DELETE service-costs:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}
