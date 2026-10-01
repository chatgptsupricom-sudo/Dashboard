// ============================================================
// API — Exportar calendario a Excel
// POST /api/plan-contenido/export/calendar
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { query } from "@/lib/db";
import { exportCalendarExcel } from "@/lib/plan-contenido/excel";

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["marketing", "superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { planId } = await request.json();

    if (!planId) {
      return NextResponse.json({ error: "planId es requerido" }, { status: 400 });
    }

    // Load plan with calendar and CPMS
    const plans = await query("SELECT * FROM cpm_plans WHERE id = ?", [planId]);
    if (plans.length === 0) {
      return NextResponse.json({ error: "Plan no encontrado" }, { status: 404 });
    }

    const plan = plans[0];

    plan.cpms = await query(
      "SELECT * FROM plan_cpms WHERE plan_id = ? ORDER BY sort_order",
      [planId],
    );

    plan.calendar = await query(
      "SELECT * FROM plan_calendar WHERE plan_id = ? ORDER BY date_key, piece_number",
      [planId],
    );

    const buffer = await exportCalendarExcel(plan);

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=calendario_${plan.month}_${plan.year}.xlsx`,
      },
    });
  } catch (error) {
    console.error("[plan-contenido/export/calendar]", error);
    return NextResponse.json(
      { error: "Error al exportar calendario" },
      { status: 500 },
    );
  }
}
