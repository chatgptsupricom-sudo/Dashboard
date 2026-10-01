// ============================================================
// API — Exportar inventario a Excel
// POST /api/plan-contenido/export/inventory
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { query } from "@/lib/db";
import { exportInventoryExcel } from "@/lib/plan-contenido/excel";

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { planId } = await request.json();

    if (!planId) {
      return NextResponse.json({ error: "planId es requerido" }, { status: 400 });
    }

    // Load plan with CPMS and products
    const plans = await query("SELECT * FROM cpm_plans WHERE id = ?", [planId]);
    if (plans.length === 0) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    const plan = plans[0];
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

    plan.cpms = cpms;

    const buffer = await exportInventoryExcel(plan);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=inventario_CPM_${plan.month}_${plan.year}.xlsx`,
      },
    });
  } catch (error) {
    console.error("[plan-contenido/export/inventory]", error);
    return NextResponse.json(
      { error: "Error al exportar inventario" },
      { status: 500 },
    );
  }
}
