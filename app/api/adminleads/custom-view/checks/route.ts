import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

declare global { var io: any; }

const ROLE = "adminleads";

async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS custom_view_checks (
      role VARCHAR(50) PRIMARY KEY,
      checks_json MEDIUMTEXT NOT NULL DEFAULT '{}',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
}

export async function GET() {
  try {
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
    await ensureTable();
    const checks = await request.json();
    await query(
      "INSERT INTO custom_view_checks (role, checks_json) VALUES (?, ?) ON DUPLICATE KEY UPDATE checks_json = ?, updated_at = NOW()",
      [ROLE, JSON.stringify(checks), JSON.stringify(checks)]
    );
    if (global.io) {
      global.io.emit("vista-checks-updated", { checks });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
