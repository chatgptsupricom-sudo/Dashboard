import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const services: any = await query(`
      SELECT
        sc.id,
        sc.service_name,
        sc.cost_type,
        sc.monthly_cost,
        sc.currency,
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
      GROUP BY sc.id, sc.service_name, sc.cost_type, sc.monthly_cost, sc.currency, sc.payment_date, sc.is_paid, sc.created_at
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

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const { service_name, cost_type, monthly_cost, currency } = body;

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

    const cur = ["USD", "EUR"].includes(currency) ? currency : "USD";

    await query(
      `INSERT INTO service_costs (service_name, cost_type, monthly_cost, currency)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE cost_type = VALUES(cost_type), monthly_cost = VALUES(monthly_cost), currency = VALUES(currency)`,
      [service_name, cost_type, parseFloat(monthly_cost) || 0, cur],
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

export async function PUT(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();

    // Toggle paid: creates/removes transaction to accumulate monthly total
    if (body.toggle_paid !== undefined && body.id) {
      const svcId = parseInt(body.id);
      const makePaid = body.toggle_paid;

      // Get service info
      const svcResult: any = await query(
        "SELECT id, service_name, monthly_cost, currency FROM service_costs WHERE id = ?",
        [svcId],
      );
      const svc = svcResult.rows?.[0];
      if (!svc) {
        return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
      }

      if (makePaid) {
        // Create transaction for today with the service cost
        const today = new Date().toISOString().slice(0, 10);
        await query(
          "INSERT INTO service_transactions (service_name, amount_usd, transaction_date, notes) VALUES (?, ?, ?, ?)",
          [svc.service_name, parseFloat(svc.monthly_cost) || 0, today, "Pago registrado"],
        );
        await query("UPDATE service_costs SET is_paid = 1 WHERE id = ?", [svcId]);
      } else {
        // Remove today's transaction for this service
        const today = new Date().toISOString().slice(0, 10);
        await query(
          "DELETE FROM service_transactions WHERE service_name = ? AND transaction_date = ? AND notes = ?",
          [svc.service_name, today, "Pago registrado"],
        );
        await query("UPDATE service_costs SET is_paid = 0 WHERE id = ?", [svcId]);
      }

      return NextResponse.json({ ok: true });
    }

    // Standard update
    const { id, monthly_cost, currency, payment_date, is_paid } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (monthly_cost !== undefined) {
      fields.push("monthly_cost = ?");
      params.push(parseFloat(monthly_cost) || 0);
    }
    if (currency !== undefined) {
      fields.push("currency = ?");
      params.push(["USD", "EUR"].includes(currency) ? currency : "USD");
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

export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
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
