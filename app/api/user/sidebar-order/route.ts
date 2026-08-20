import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS user_sidebar_order (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    section_id VARCHAR(100) NOT NULL,
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_user_section (user_id, section_id),
    INDEX idx_user_id (user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;

async function ensureTable() {
  await query(CREATE_TABLE);
}

export async function GET(request: NextRequest) {
  try {
    await ensureTable();
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    const result = await query(
      "SELECT section_id, position FROM user_sidebar_order WHERE user_id = ? ORDER BY position ASC",
      [parseInt(userId)]
    );

    const order = (result.rows || []).map((r: any) => r.section_id);

    return NextResponse.json({ success: true, data: { order } });
  } catch (error: any) {
    console.error("Error GET sidebar-order:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    await ensureTable();
    const body = await request.json();
    const { userId, order } = body as { userId: number; order: string[] };

    if (!userId || !Array.isArray(order)) {
      return NextResponse.json({ error: "userId y order[] requeridos" }, { status: 400 });
    }

    await query("DELETE FROM user_sidebar_order WHERE user_id = ?", [userId]);

    if (order.length > 0) {
      const values = order.map((sectionId, index) => [userId, sectionId, index]);
      const placeholders = values.map(() => "(?, ?, ?)").join(", ");
      const flatValues = values.flat();
      await query(
        `INSERT INTO user_sidebar_order (user_id, section_id, position) VALUES ${placeholders}`,
        flatValues
      );
    }

    if (global.io) {
      global.io.to(`user_${userId}`).emit("sidebar_order_updated", { order });
    }

    return NextResponse.json({ success: true, data: { order } });
  } catch (error: any) {
    console.error("Error PUT sidebar-order:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
