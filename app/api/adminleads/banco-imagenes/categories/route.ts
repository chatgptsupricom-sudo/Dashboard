import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, [
    "adminleads",
    "gerente de operaciones",
    "vendedor",
    "seller",
  ]);
  if (auth.error) return auth.error;

  try {
    const result = await query(
      `SELECT DISTINCT category FROM product_images WHERE category IS NOT NULL AND category != '' ORDER BY category ASC`
    );
    const categories = (result.rows || []).map((r: any) => r.category);
    return NextResponse.json({ success: true, categories });
  } catch (error: any) {
    console.error("Error fetching gallery categories:", error.message);
    return NextResponse.json({ success: false, categories: [] }, { status: 500 });
  }
}
