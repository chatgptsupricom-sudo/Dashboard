import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";
import {
  addHistory,
  ensureTables,
  getLegacyChecks,
  getViewMeta,
  resolveView,
} from "@/lib/customView/store";

declare global { var io: any; }

export const dynamic = "force-dynamic";

/** Estado compartido del panel: overlay de cambios + HTML completo. */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    await ensureTables();

    const viewName = resolveView(new URL(request.url).searchParams.get("view"));
    const view = await getViewMeta(viewName);
    const r = await query(
      `SELECT state_json, base_revision, revision, snapshot_revision, updated_by, updated_at,
              (snapshot_html IS NOT NULL AND CHAR_LENGTH(snapshot_html) > 0) AS has_snapshot
         FROM custom_view_state WHERE view_name = ?`,
      [viewName],
    );
    const row = r.rows?.[0];

    let state: any = null;
    if (row?.state_json) {
      try { state = JSON.parse(row.state_json); } catch { state = null; }
    }

    const viewBaseRevision = Number(view?.base_revision) || 1;
    const snapshotFresh =
      !!Number(row?.has_snapshot) &&
      Number(row?.snapshot_revision) === Number(row?.revision) &&
      Number(row?.base_revision) === viewBaseRevision;

    // Solo se ofrece el formato viejo cuando todavia no hay overlay nuevo.
    const legacy = state && state.nodes ? null : await getLegacyChecks(viewName);

    return NextResponse.json({
      state,
      legacy,
      revision: Number(row?.revision) || 0,
      baseRevision: Number(row?.base_revision) || 0,
      viewBaseRevision,
      snapshotFresh,
      updatedBy: row?.updated_by || null,
      updatedAt: row?.updated_at || null,
    });
  } catch (error: any) {
    console.error("custom-view state GET error:", error?.message);
    return NextResponse.json({ state: null, revision: 0, baseRevision: 0, snapshotFresh: false });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensureTables();

    const body = await request.json();
    const state = body?.state;
    if (!state || typeof state !== "object" || typeof state.nodes !== "object") {
      return NextResponse.json({ success: false, error: "Estado invalido" }, { status: 400 });
    }

    const viewName = resolveView(new URL(request.url).searchParams.get("view"));
    const view = await getViewMeta(viewName);
    const viewBaseRevision = Number(view?.base_revision) || 1;
    // El cliente venia trabajando sobre otra base: que recargue en vez de
    // pisar el HTML nuevo con el estado de un documento viejo.
    if (Number(body?.baseRevision) !== viewBaseRevision) {
      return NextResponse.json({ success: false, stale: true, baseRevision: viewBaseRevision });
    }

    const stateJson = JSON.stringify(state);
    const snapshot: string | null =
      typeof body?.snapshot === "string" && body.snapshot.length > 0 ? body.snapshot : null;

    const cur = await query(
      `SELECT state_json, revision FROM custom_view_state WHERE view_name = ?`,
      [viewName],
    );
    const curRevision = Number(cur.rows?.[0]?.revision) || 0;

    // Control de concurrencia: si otra persona guardo desde que este panel
    // leyo el estado, se le devuelve la version actual para que fusione en vez
    // de sobrescribirla. Sin esto, el ultimo en guardar borra lo del otro.
    if (body?.revision !== undefined && Number(body.revision) !== curRevision) {
      let current: any = null;
      try { current = JSON.parse(cur.rows?.[0]?.state_json || "null"); } catch { current = null; }
      return NextResponse.json({
        success: false,
        conflict: true,
        revision: curRevision,
        state: current || { v: 2, nodes: {} },
      });
    }

    const nextRevision = curRevision + 1;

    if (snapshot) {
      await query(
        `INSERT INTO custom_view_state
           (view_name, state_json, snapshot_html, base_revision, revision, snapshot_revision, updated_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           state_json = VALUES(state_json),
           snapshot_html = VALUES(snapshot_html),
           base_revision = VALUES(base_revision),
           revision = VALUES(revision),
           snapshot_revision = VALUES(snapshot_revision),
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [viewName, stateJson, snapshot, viewBaseRevision, nextRevision, nextRevision, user?.role || null],
      );
    } else {
      // Envio liviano (al cerrar la pestana): se conserva el snapshot previo
      // pero queda marcado como no vigente para que se regenere.
      await query(
        `INSERT INTO custom_view_state
           (view_name, state_json, base_revision, revision, snapshot_revision, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           state_json = VALUES(state_json),
           base_revision = VALUES(base_revision),
           revision = VALUES(revision),
           snapshot_revision = -1,
           updated_by = VALUES(updated_by),
           updated_at = NOW()`,
        [viewName, stateJson, viewBaseRevision, nextRevision, -1, user?.role || null],
      );
    }

    await addHistory({
      view: viewName,
      kind: "state",
      label: null,
      stateJson,
      snapshotHtml: snapshot,
      baseRevision: viewBaseRevision,
      revision: nextRevision,
      createdBy: user?.role || null,
    });

    if (global.io) {
      global.io.emit("vista-state-updated", {
        // Sin la vista, un guardado de la sandbox llega a los paneles del plan
        // real (y al reves): recargan o intentan aplicar estado ajeno.
        view: viewName,
        clientId: body?.clientId || null,
        state,
        revision: nextRevision,
        baseRevision: viewBaseRevision,
        by: user?.role || null,
      });
    }

    return NextResponse.json({ success: true, revision: nextRevision, baseRevision: viewBaseRevision });
  } catch (error: any) {
    console.error("custom-view state POST error:", error?.message);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
