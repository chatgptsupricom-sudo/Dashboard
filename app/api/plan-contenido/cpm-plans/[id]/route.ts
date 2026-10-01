// ============================================================
// API — Plan específico por ID
// GET    /api/plan-contenido/cpm-plans/[id]
// DELETE /api/plan-contenido/cpm-plans/[id]
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { query } from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const planId = parseInt(id);

    if (!planId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    // Load plan
    const plans = await query("SELECT * FROM cpm_plans WHERE id = ?", [planId]);
    if (plans.length === 0) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    const plan = plans[0];

    // Load CPMS with products
    const cpms = await query(
      "SELECT * FROM plan_cpms WHERE plan_id = ? ORDER BY sort_order",
      [planId],
    );

    for (const cpm of cpms) {
      cpm.products = await query(
        "SELECT * FROM plan_cpm_products WHERE cpm_id = ? AND included = 1",
        [cpm.id],
      );
    }

    // Load saved content
    const savedContent = await query(
      "SELECT * FROM plan_saved_content WHERE plan_id = ? ORDER BY publish_date",
      [planId],
    );

    // Load calendar
    const calendar = await query(
      "SELECT * FROM plan_calendar WHERE plan_id = ? ORDER BY date_key, piece_number",
      [planId],
    );

    return NextResponse.json({
      plan: {
        ...plan,
        cpms,
        savedContent,
        calendar,
      },
    });
  } catch (error) {
    console.error("[plan-contenido/cpm-plans/[id] GET]", error);
    return NextResponse.json(
      { error: "Error al cargar el plan" },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const planId = parseInt(id);

    if (!planId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    await query("DELETE FROM plan_calendar WHERE plan_id = ?", [planId]);
    await query("DELETE FROM plan_saved_content WHERE plan_id = ?", [planId]);
    await query(
      "DELETE FROM plan_cpm_products WHERE cpm_id IN (SELECT id FROM plan_cpms WHERE plan_id = ?)",
      [planId],
    );
    await query("DELETE FROM plan_cpms WHERE plan_id = ?", [planId]);
    await query("DELETE FROM cpm_plans WHERE id = ?", [planId]);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[plan-contenido/cpm-plans/[id] DELETE]", error);
    return NextResponse.json(
      { error: "Error al eliminar el plan" },
      { status: 500 },
    );
  }
}
