import { query } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
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
