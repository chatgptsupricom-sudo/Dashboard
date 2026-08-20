import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";

const VIEW_NAME = "adminleads";

async function ensureTable() {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS custom_views (
        id INT AUTO_INCREMENT PRIMARY KEY,
        view_name VARCHAR(100) NOT NULL UNIQUE,
        html_content LONGTEXT NOT NULL,
        filename VARCHAR(255),
        file_size INT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (e: any) {
    console.error("ensureTable failed:", e.message);
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ exists: false }, { status: 401 });
    }

    await ensureTable();

    const result = await query(
      `SELECT filename, file_size, updated_at FROM custom_views WHERE view_name = ?`,
      [VIEW_NAME]
    );
    const row = result.rows?.[0];

    if (!row) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      filename: row.filename,
      size: row.file_size,
      updatedAt: row.updated_at,
    });
  } catch (error: any) {
    console.error("GET meta error:", error.message);
    return NextResponse.json({ exists: false });
  }
}
