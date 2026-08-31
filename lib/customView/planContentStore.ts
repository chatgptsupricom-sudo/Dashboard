import { query } from "@/lib/db";
import { VIEW_NAME, SANDBOX_VIEW_NAME } from "@/lib/customView/store";

/**
 * Estado del Plan de Contenido cuando el panel es la SPA de React
 * (`<meta name="supricom-plan" content="react-v1">` en el HTML subido).
 *
 * A diferencia del runtime de overlay (custom_view_state), aqui el estado
 * compartido es un unico objeto plano que la propia app ya maneja:
 *
 *   { pieces: { [pieceId]: { checked, moved, colId } } }
 *
 * Es lo mismo que la app guardaba en localStorage["supricom_plan_state"], solo
 * que ahora vive en la base y se sincroniza por socket entre los tres roles.
 */

export interface PlanContentState {
  pieces: Record<string, { checked?: boolean; moved?: boolean; colId?: string | null }>;
  [k: string]: unknown;
}

export const EMPTY_PLAN_STATE: PlanContentState = { pieces: {} };

/** Misma lista blanca que el runtime viejo: nunca un nombre arbitrario. */
const VISTAS_PERMITIDAS = new Set([VIEW_NAME, SANDBOX_VIEW_NAME]);
export function resolvePlanView(raw?: string | null): string {
  const v = String(raw || "").trim();
  return VISTAS_PERMITIDAS.has(v) ? v : VIEW_NAME;
}

let tablesReady = false;

export async function ensurePlanTables(force = false) {
  if (tablesReady && !force) return;

  await query(`
    CREATE TABLE IF NOT EXISTS plan_content_state (
      view_name VARCHAR(64) NOT NULL PRIMARY KEY,
      pieces_json LONGTEXT NULL,
      revision INT NOT NULL DEFAULT 0,
      updated_by VARCHAR(120) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS plan_content_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      view_name VARCHAR(64) NOT NULL,
      revision INT NOT NULL DEFAULT 0,
      pieces_json LONGTEXT NULL,
      label VARCHAR(255) NULL,
      created_by VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_view_id (view_name, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  tablesReady = true;
}

export interface PlanStateRow {
  pieces: PlanContentState;
  revision: number;
  updatedBy: string | null;
  updatedAt: string | null;
}

function parsePieces(raw: unknown): PlanContentState {
  if (typeof raw !== "string" || !raw) return { pieces: {} };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") {
      if (!parsed.pieces || typeof parsed.pieces !== "object") parsed.pieces = {};
      return parsed as PlanContentState;
    }
  } catch {
    /* fall through */
  }
  return { pieces: {} };
}

export async function getPlanState(view: string = VIEW_NAME): Promise<PlanStateRow> {
  const r = await query(
    `SELECT pieces_json, revision, updated_by, updated_at
       FROM plan_content_state WHERE view_name = ?`,
    [view],
  );
  const row = r.rows?.[0];
  return {
    pieces: parsePieces(row?.pieces_json),
    revision: Number(row?.revision) || 0,
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/**
 * Guarda un estado nuevo. `expectedRevision` implementa concurrencia optimista:
 * si otra persona guardo primero, se rechaza y el cliente recibe el estado
 * vigente para fusionar (mismo contrato que el runtime viejo: { conflict }).
 */
export async function savePlanState(opts: {
  view: string;
  pieces: PlanContentState;
  expectedRevision: number;
  updatedBy: string | null;
}): Promise<
  | { ok: true; revision: number }
  | { ok: false; conflict: true; revision: number; pieces: PlanContentState }
> {
  const cur = await getPlanState(opts.view);
  if (Number.isFinite(opts.expectedRevision) && opts.expectedRevision !== cur.revision) {
    return { ok: false, conflict: true, revision: cur.revision, pieces: cur.pieces };
  }

  const next = cur.revision + 1;
  const json = JSON.stringify(opts.pieces);

  await query(
    `INSERT INTO plan_content_state (view_name, pieces_json, revision, updated_by)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       pieces_json = VALUES(pieces_json),
       revision = VALUES(revision),
       updated_by = VALUES(updated_by),
       updated_at = NOW()`,
    [opts.view, json, next, opts.updatedBy],
  );

  await addPlanHistory({
    view: opts.view,
    revision: next,
    piecesJson: json,
    label: null,
    createdBy: opts.updatedBy,
  });

  return { ok: true, revision: next };
}

export interface PlanHistoryEntry {
  id: number;
  revision: number;
  label: string | null;
  createdBy: string | null;
  createdAt: string;
  hasState: boolean;
}

/** Conserva las ultimas ~80 versiones por vista. */
const HISTORY_KEEP = 80;

export async function addPlanHistory(entry: {
  view: string;
  revision: number;
  piecesJson: string | null;
  label: string | null;
  createdBy: string | null;
}) {
  try {
    await query(
      `INSERT INTO plan_content_history (view_name, revision, pieces_json, label, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [entry.view, entry.revision, entry.piecesJson, entry.label, entry.createdBy],
    );
    await query(
      `DELETE FROM plan_content_history
        WHERE view_name = ?
          AND id < (
            SELECT min_id FROM (
              SELECT MIN(id) AS min_id FROM (
                SELECT id FROM plan_content_history
                 WHERE view_name = ? ORDER BY id DESC LIMIT ?
              ) keep
            ) k
          )`,
      [entry.view, entry.view, HISTORY_KEEP],
    );
  } catch (e: any) {
    console.error("addPlanHistory fallo:", e?.message);
  }
}

export async function listPlanHistory(view: string = VIEW_NAME): Promise<PlanHistoryEntry[]> {
  const r = await query(
    `SELECT id, revision, label, created_by, created_at,
            (pieces_json IS NOT NULL AND CHAR_LENGTH(pieces_json) > 0) AS has_state
       FROM plan_content_history
      WHERE view_name = ?
      ORDER BY id DESC
      LIMIT ${HISTORY_KEEP}`,
    [view],
  );
  return (r.rows || []).map((row: any) => ({
    id: Number(row.id),
    revision: Number(row.revision) || 0,
    label: row.label ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
    hasState: !!Number(row.has_state),
  }));
}

export async function getPlanHistoryState(
  view: string,
  id: number,
): Promise<PlanContentState | null> {
  const r = await query(
    `SELECT pieces_json FROM plan_content_history WHERE view_name = ? AND id = ?`,
    [view, id],
  );
  const raw = r.rows?.[0]?.pieces_json;
  if (!raw) return null;
  return parsePieces(raw);
}
