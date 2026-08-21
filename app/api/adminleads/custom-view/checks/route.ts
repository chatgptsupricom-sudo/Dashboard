import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";

/**
 * Endpoint HEREDADO. El guardado del Plan de Contenido vive ahora en
 * /api/adminleads/custom-view/state (overlay de cambios + HTML completo).
 * Esto solo queda para que una pestana vieja que aun no recargo no reviente,
 * y para que /state pueda migrar los checks que quedaron en la tabla antigua.
 */

const ROLE = "adminleads";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS custom_view_checks (
      role VARCHAR(50) PRIMARY KEY,
      checks_json MEDIUMTEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await ensureTable();
    const result = await query(
      "SELECT checks_json FROM custom_view_checks WHERE role = ?",
      [ROLE]
    );
    if (result.rows.length === 0) return NextResponse.json({ checks: {} });
    return NextResponse.json({ checks: JSON.parse(result.rows[0].checks_json || "{}") });
  } catch {
    return NextResponse.json({ checks: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensureTable();
    const checks = await request.json();
    await query(
      "INSERT INTO custom_view_checks (role, checks_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE checks_json = ?, updated_at = NOW()",
      [ROLE, JSON.stringify(checks), JSON.stringify(checks)]
    );
    // Ya no se difunde por socket: el sistema nuevo emite "vista-state-updated".
    return NextResponse.json({ success: true, legacy: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
