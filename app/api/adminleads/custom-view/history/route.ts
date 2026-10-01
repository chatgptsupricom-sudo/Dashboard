import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canUploadCustomPlan, canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";
import { ensureTables, getViewMeta, resolveView } from "@/lib/customView/store";

declare global { var io: any; }

export const dynamic = "force-dynamic";

/**
 * GET             — lista de versiones guardadas.
 * GET ?id=N       — descarga el HTML completo de esa version (si se conserva).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await ensureTables();
    const viewName = resolveView(request.nextUrl.searchParams.get("view"));
    const id = request.nextUrl.searchParams.get("id");

    if (id) {
      const r = await query(
        `SELECT snapshot_html, created_at FROM custom_view_history WHERE id = ? AND view_name = ?`,
        [Number(id), viewName],
      );
      const html = r.rows?.[0]?.snapshot_html;
      if (!html) {
        return NextResponse.json({ error: "Esa version ya no conserva el HTML completo" }, { status: 404 });
      }
      return new Response(html, {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Disposition": `attachment; filename="plan-de-contenido-v${id}.html"`,
        },
      });
    }

    const r = await query(
      `SELECT id, kind, label, base_revision, revision, created_by, created_at,
              (snapshot_html IS NOT NULL AND CHAR_LENGTH(snapshot_html) > 0) AS has_snapshot,
              (state_json IS NOT NULL) AS has_state
         FROM custom_view_history
        WHERE view_name = ?
        ORDER BY id DESC
        LIMIT 60`,
      [viewName],
    );

    return NextResponse.json({
      versions: (r.rows || []).map((v: any) => ({
        id: v.id,
        kind: v.kind,
        label: v.label,
        baseRevision: v.base_revision,
        revision: v.revision,
        createdBy: v.created_by,
        createdAt: v.created_at,
        hasSnapshot: !!Number(v.has_snapshot),
        hasState: !!Number(v.has_state),
      })),
    });
  } catch (error: any) {
    console.error("custom-view history GET error:", error?.message);
    return NextResponse.json({ versions: [] });
  }
}

/** POST { id } — vuelve el panel a esa version. */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canUploadCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensureTables();
    const viewName = resolveView(request.nextUrl.searchParams.get("view"));
    const { id } = await request.json();
    if (!id) return NextResponse.json({ success: false, error: "Falta id" }, { status: 400 });

    const r = await query(
      `SELECT state_json FROM custom_view_history WHERE id = ? AND view_name = ?`,
      [Number(id), viewName],
    );
    if (!r.rows?.length) {
      return NextResponse.json({ success: false, error: "Version no encontrada" }, { status: 404 });
    }

    const stateJson: string | null = r.rows[0].state_json ?? null;
    let state: any = null;
    if (stateJson) {
      try { state = JSON.parse(stateJson); } catch { state = null; }
    }

    const view = await getViewMeta(viewName);
    const viewBaseRevision = Number(view?.base_revision) || 1;
    const cur = await query(`SELECT revision FROM custom_view_state WHERE view_name = ?`, [viewName]);
    const nextRevision = (Number(cur.rows?.[0]?.revision) || 0) + 1;

    // El snapshot queda invalidado a proposito: el primer panel que cargue
    // reaplica el overlay restaurado sobre la base actual y lo regraba.
    await query(
      `INSERT INTO custom_view_state
         (view_name, state_json, base_revision, revision, snapshot_revision, updated_by)
       VALUES (?, ?, ?, ?, -1, ?)
       ON DUPLICATE KEY UPDATE
         state_json = VALUES(state_json),
         base_revision = VALUES(base_revision),
         revision = VALUES(revision),
         snapshot_revision = -1,
         updated_by = VALUES(updated_by),
         updated_at = NOW()`,
      [viewName, stateJson, viewBaseRevision, nextRevision, user?.role || null],
    );

    await query(
      `INSERT INTO custom_view_history
         (view_name, kind, label, state_json, base_revision, revision, created_by)
       VALUES (?, 'restore', ?, ?, ?, ?, ?)`,
      [viewName, `Restaurada version #${id}`, stateJson, viewBaseRevision, nextRevision, user?.role || null],
    );

    if (global.io) {
      global.io.emit("vista-state-updated", {
        view: viewName,
        clientId: null,
        state: state || { v: 2, nodes: {} },
        revision: nextRevision,
        baseRevision: viewBaseRevision,
        by: user?.role || null,
      });
    }

    return NextResponse.json({ success: true, revision: nextRevision });
  } catch (error: any) {
    console.error("custom-view history POST error:", error?.message);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
