import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

declare global { var io: any; }

// Ensure table exists
async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS custom_view_checks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        view_name VARCHAR(100) NOT NULL UNIQUE,
        checks_json JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e: any) {
    console.error("ensureTable failed:", e.message);
  }
}

export async function GET() {
  try {
    await ensureTable();
    const result = await query(
      `SELECT checks_json FROM custom_view_checks WHERE view_name = 'adminleads'`
    );
    const row = result.rows?.[0];
    const checks = row?.checks_json ? (typeof row.checks_json === 'string' ? JSON.parse(row.checks_json) : row.checks_json) : {};
    return NextResponse.json({ checks });
  } catch (error: any) {
    console.error("GET checks error:", error.message);
    return NextResponse.json({ checks: {} });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTable();
    const checks = await request.json();
    await query(
      `INSERT INTO custom_view_checks (view_name, checks_json, updated_at)
       VALUES ('adminleads', ?, NOW())
       ON DUPLICATE KEY UPDATE checks_json = VALUES(checks_json), updated_at = NOW()`,
      [JSON.stringify(checks)]
    );
    if (global.io) {
      global.io.emit("vista-checks-updated", { checks });
    }
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST checks error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
