import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";
import { ensureTables, getViewMeta, resolveView } from "@/lib/customView/store";
import { ensurePlanTables, getPlanState } from "@/lib/customView/planContentStore";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ exists: false }, { status: 401 });
    }

    await ensureTables();
    const viewName = resolveView(new URL(request.url).searchParams.get("view"));
    const view = await getViewMeta(viewName);
    if (!view) return NextResponse.json({ exists: false });

    // ¿El HTML subido es la SPA de React? (marca en un <meta>)
    const rk = await query(
      `SELECT (LOCATE('supricom-plan', html_content) > 0) AS is_react
         FROM custom_views WHERE view_name = ?`,
      [viewName],
    );
    const isReact = !!Number(rk.rows?.[0]?.is_react);

    if (isReact) {
      await ensurePlanTables();
      const plan = await getPlanState(viewName);
      return NextResponse.json({
        exists: true,
        mode: "react",
        filename: view.filename,
        size: view.file_size,
        updatedAt: view.updated_at,
        baseRevision: Number(view.base_revision) || 1,
        revision: plan.revision,
        savedAt: plan.updatedAt,
        savedBy: plan.updatedBy,
        hasSnapshot: false,
      });
    }

    const s = await query(
      `SELECT revision, updated_at, updated_by,
              (snapshot_html IS NOT NULL AND CHAR_LENGTH(snapshot_html) > 0) AS has_snapshot
         FROM custom_view_state WHERE view_name = ?`,
      [viewName],
    );
    const st = s.rows?.[0];

    return NextResponse.json({
      exists: true,
      mode: "overlay",
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
