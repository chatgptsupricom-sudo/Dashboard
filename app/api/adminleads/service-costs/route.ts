import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

let hayPeriodo = false;

/**
 * Agrega service_costs.billing_period si falta (DDL de referencia en
 * sql/alter_service_costs_add_billing_period.sql). Solo se recuerda el sí: si
 * el ALTER falla, se vuelve a intentar en la próxima llamada.
 */
async function asegurarPeriodo(): Promise<boolean> {
  if (hayPeriodo) return true;
  try {
    const r: any = await query("SHOW COLUMNS FROM service_costs LIKE 'billing_period'");
    if (!(r.rows as any[]).length) {
      await query(
        "ALTER TABLE service_costs ADD COLUMN billing_period ENUM('monthly','annual') NOT NULL DEFAULT 'monthly' AFTER monthly_cost",
      );
    }
    hayPeriodo = true;
  } catch (e) {
    console.error("service_costs.billing_period:", e);
  }
  return hayPeriodo;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    // Sin la columna, todo se trata como mensual.
    const periodo = (await asegurarPeriodo()) ? "sc.billing_period" : "'monthly'";
    const services: any = await query(`
      SELECT
        sc.id,
        sc.service_name,
        sc.cost_type,
        sc.monthly_cost,
        ${periodo} AS billing_period,
        sc.currency,
        -- Como texto YYYY-MM-DD: el driver devuelve DATE como objeto Date, que
        -- en JSON sale "2027-10-09T04:00:00.000Z" y las pantallas le pegan
        -- "T00:00:00" detrás ("Invalid Date").
        DATE_FORMAT(sc.payment_date, '%Y-%m-%d') AS payment_date,
        sc.is_paid,
        sc.created_at,
        IFNULL(SUM(st.amount_usd), 0) AS total_transactions,
        COUNT(st.id) AS transaction_count
      FROM service_costs sc
      LEFT JOIN service_transactions st
        ON st.service_name = sc.service_name
        AND st.transaction_date >= DATE_FORMAT(NOW(), '%Y-%m-01')
        AND st.transaction_date <= LAST_DAY(NOW())
      GROUP BY sc.id, sc.service_name, sc.cost_type, sc.monthly_cost, billing_period, sc.currency, sc.payment_date, sc.is_paid, sc.created_at
      ORDER BY sc.service_name
    `);

    const totalCost = (services.rows || []).reduce((sum: number, s: any) => {
      if (s.cost_type === "subscription") {
        // Una suscripción anual pesa 1/12 de su monto en el costo del mes.
        const monto = parseFloat(s.monthly_cost) || 0;
        return sum + (s.billing_period === "annual" ? monto / 12 : monto);
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
    const { service_name, cost_type, monthly_cost, currency, billing_period } = body;

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
    // Aparte del INSERT: sin la columna el servicio igual se crea, como mensual.
    if (cost_type === "subscription" && billing_period === "annual" && (await asegurarPeriodo())) {
      await query("UPDATE service_costs SET billing_period = 'annual' WHERE service_name = ?", [service_name]);
    }

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
    const { id, service_name, cost_type, monthly_cost, billing_period, currency, payment_date, is_paid } = body;

    if (!id) {
      return NextResponse.json({ error: "id es requerido" }, { status: 400 });
    }

    const fields: string[] = [];
    const params: any[] = [];

    // Cambio de nombre. Las recargas (service_transactions) se enlazan por
    // nombre, así que se renombran junto con el servicio más abajo.
    let renombrar: { de: string; a: string } | null = null;
    if (service_name !== undefined) {
      const nombre = String(service_name).trim();
      if (!nombre || nombre.length > 100) {
        return NextResponse.json(
          { error: "El nombre es obligatorio (máximo 100 caracteres)" },
          { status: 400 },
        );
      }
      const actual: any = await query("SELECT service_name FROM service_costs WHERE id = ?", [parseInt(id)]);
      const anterior = actual.rows?.[0]?.service_name;
      if (anterior === undefined) {
        return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
      }
      if (nombre !== anterior) {
        const otro: any = await query(
          "SELECT id FROM service_costs WHERE service_name = ? AND id <> ?",
          [nombre, parseInt(id)],
        );
        if (otro.rows?.length) {
          return NextResponse.json(
            { error: `Ya existe un servicio llamado "${nombre}"` },
            { status: 409 },
          );
        }
        fields.push("service_name = ?");
        params.push(nombre);
        renombrar = { de: anterior, a: nombre };
      }
    }

    if (cost_type !== undefined) {
      if (!["subscription", "topup"].includes(cost_type)) {
        return NextResponse.json(
          { error: "cost_type debe ser 'subscription' o 'topup'" },
          { status: 400 },
        );
      }
      fields.push("cost_type = ?");
      params.push(cost_type);
    }
    if (monthly_cost !== undefined) {
      fields.push("monthly_cost = ?");
      params.push(parseFloat(monthly_cost) || 0);
    }
    if (billing_period !== undefined) {
      if (!["monthly", "annual"].includes(billing_period)) {
        return NextResponse.json(
          { error: "billing_period debe ser 'monthly' o 'annual'" },
          { status: 400 },
        );
      }
      if (!(await asegurarPeriodo())) {
        return NextResponse.json(
          { error: "Falta la columna billing_period: correr sql/alter_service_costs_add_billing_period.sql" },
          { status: 500 },
        );
      }
      fields.push("billing_period = ?");
      params.push(billing_period);
    }
    if (currency !== undefined) {
      fields.push("currency = ?");
      params.push(["USD", "EUR"].includes(currency) ? currency : "USD");
    }
    if (cost_type === "topup") {
      // Un servicio por recargas no tiene vencimiento.
      fields.push("payment_date = NULL");
    } else if (payment_date !== undefined) {
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
    if (renombrar) {
      await query("UPDATE service_transactions SET service_name = ? WHERE service_name = ?", [
        renombrar.a,
        renombrar.de,
      ]);
    }

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
