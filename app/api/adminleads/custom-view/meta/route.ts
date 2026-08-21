import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";
import { ensureTables, getViewMeta, VIEW_NAME } from "@/lib/customView/store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ exists: false }, { status: 401 });
    }

    await ensureTables();
    const view = await getViewMeta();
    if (!view) return NextResponse.json({ exists: false });

    const s = await query(
      `SELECT revision, updated_at, updated_by,
              (snapshot_html IS NOT NULL AND CHAR_LENGTH(snapshot_html) > 0) AS has_snapshot
         FROM custom_view_state WHERE view_name = ?`,
      [VIEW_NAME],
    );
    const st = s.rows?.[0];

    return NextResponse.json({
      exists: true,
      filename: view.filename,
      size: view.file_size,
      updatedAt: view.updated_at,
      baseRevision: Number(view.base_revision) || 1,
      revision: Number(st?.revision) || 0,
      savedAt: st?.updated_at || null,
      savedBy: st?.updated_by || null,
      hasSnapshot: !!Number(st?.has_snapshot),
    });
  } catch (error: any) {
    console.error("custom-view meta GET error:", error?.message);
    return NextResponse.json({ exists: false });
  }
}
