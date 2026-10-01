import { query } from "@/lib/db";

/**
 * Todo el Plan de Contenido vive bajo un unico "view_name": los tres paneles
 * (superadmin, adminleads, disenador) comparten el mismo documento.
 */
export const VIEW_NAME = "adminleads";

/**
 * Vista de pruebas. Comparte el mismo esquema pero vive en filas aparte, asi
 * se puede ensayar concurrencia o cambios del runtime sin tocar el plan real
 * del equipo. El ambiente de test apunta a la misma base que produccion, asi
 * que sin esto cualquier prueba que escriba datos afecta el plan de verdad.
 */
export const SANDBOX_VIEW_NAME = "adminleads__sandbox";

const VISTAS_PERMITIDAS = new Set([VIEW_NAME, SANDBOX_VIEW_NAME]);

/** Lista blanca: nunca se acepta un nombre arbitrario desde la URL. */
export function resolveView(raw?: string | null): string {
  const v = String(raw || "").trim();
  return VISTAS_PERMITIDAS.has(v) ? v : VIEW_NAME;
}

export interface ViewRow {
  html_content: string | null;
  filename: string | null;
  file_size: number | null;
  base_revision: number;
  updated_at: string | null;
}

export interface StateRow {
  state_json: string | null;
  snapshot_html: string | null;
  base_revision: number;
  revision: number;
  snapshot_revision: number;
  updated_by: string | null;
  updated_at: string | null;
}

let tablesReady = false;

async function columnExists(table: string, column: string): Promise<boolean> {
  const r = await query(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return Number(r.rows?.[0]?.c || 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  try {
    if (await columnExists(table, column)) return;
    await query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  } catch (e: any) {
    // Otro proceso pudo agregarla en paralelo: solo es error si no es duplicado.
    if (!/duplicate column/i.test(e?.message || "")) {
      console.error(`addColumn ${table}.${column} fallo:`, e?.message);
    }
  }
}

/**
 * Crea/actualiza el esquema. Nota: en MySQL las columnas LONGTEXT/MEDIUMTEXT
 * no admiten DEFAULT, por eso van NULL.
 */
export async function ensureTables(force = false) {
  if (tablesReady && !force) return;

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
  await addColumn("custom_views", "base_revision", "base_revision INT NOT NULL DEFAULT 1");

  await query(`
    CREATE TABLE IF NOT EXISTS custom_view_state (
      view_name VARCHAR(100) NOT NULL PRIMARY KEY,
      state_json LONGTEXT NULL,
      snapshot_html LONGTEXT NULL,
      base_revision INT NOT NULL DEFAULT 0,
      revision INT NOT NULL DEFAULT 0,
      snapshot_revision INT NOT NULL DEFAULT 0,
      updated_by VARCHAR(120) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumn("custom_view_state", "snapshot_revision", "snapshot_revision INT NOT NULL DEFAULT 0");

  await query(`
    CREATE TABLE IF NOT EXISTS custom_view_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      view_name VARCHAR(100) NOT NULL,
      kind VARCHAR(20) NOT NULL,
      label VARCHAR(255) NULL,
      state_json LONGTEXT NULL,
      snapshot_html LONGTEXT NULL,
      base_revision INT NOT NULL DEFAULT 0,
      revision INT NOT NULL DEFAULT 0,
      created_by VARCHAR(120) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_view_id (view_name, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  tablesReady = true;
}

export async function getView(view: string = VIEW_NAME): Promise<ViewRow | null> {
  const r = await query(
    `SELECT html_content, filename, file_size, base_revision, updated_at
       FROM custom_views WHERE view_name = ?`,
    [view],
  );
  return (r.rows?.[0] as ViewRow) || null;
}

export async function getViewMeta(view: string = VIEW_NAME): Promise<Omit<ViewRow, "html_content"> | null> {
  const r = await query(
    `SELECT filename, file_size, base_revision, updated_at
       FROM custom_views WHERE view_name = ?`,
    [view],
  );
  return (r.rows?.[0] as any) || null;
}

export async function getState(view: string = VIEW_NAME): Promise<StateRow | null> {
  const r = await query(
    `SELECT state_json, snapshot_html, base_revision, revision, snapshot_revision, updated_by, updated_at
       FROM custom_view_state WHERE view_name = ?`,
    [view],
  );
  return (r.rows?.[0] as StateRow) || null;
}

export async function getStateNoSnapshot(view: string = VIEW_NAME): Promise<Omit<StateRow, "snapshot_html"> | null> {
  const r = await query(
    `SELECT state_json, base_revision, revision, snapshot_revision, updated_by, updated_at
       FROM custom_view_state WHERE view_name = ?`,
    [view],
  );
  return (r.rows?.[0] as any) || null;
}

/** Checks del formato viejo (pre-overlay). Se migran en el primer guardado. */
export async function getLegacyChecks(view: string = VIEW_NAME): Promise<Record<string, any> | null> {
  try {
    const r = await query(`SELECT checks_json FROM custom_view_checks WHERE role = ?`, [view]);
    const raw = r.rows?.[0]?.checks_json;
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
}

export async function addHistory(entry: {
  view?: string;
  kind: "upload" | "state" | "restore";
  label?: string | null;
  stateJson?: string | null;
  snapshotHtml?: string | null;
  baseRevision: number;
  revision: number;
  createdBy?: string | null;
}) {
  try {
    await query(
      `INSERT INTO custom_view_history
         (view_name, kind, label, state_json, snapshot_html, base_revision, revision, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.view || VIEW_NAME,
        entry.kind,
        entry.label ?? null,
        entry.stateJson ?? null,
        entry.snapshotHtml ?? null,
        entry.baseRevision,
        entry.revision,
        entry.createdBy ?? null,
      ],
    );
    await pruneHistory(entry.view || VIEW_NAME);
  } catch (e: any) {
    console.error("addHistory fallo:", e?.message);
  }
}

/**
 * Conserva las ultimas 80 versiones. A partir de la 12 mas reciente se libera
 * el HTML completo (el overlay basta para reconstruir); asi el historial no
 * crece sin control pero nunca se pierde el registro de un cambio.
 */
async function pruneHistory(view: string = VIEW_NAME) {
  try {
    await query(
      `UPDATE custom_view_history h
         JOIN (
           SELECT id FROM (
             SELECT id FROM custom_view_history
              WHERE view_name = ? AND snapshot_html IS NOT NULL AND kind = 'state'
              ORDER BY id DESC LIMIT 100 OFFSET 12
           ) t
         ) old ON old.id = h.id
          SET h.snapshot_html = NULL`,
      [view],
    );
    await query(
      `DELETE FROM custom_view_history
        WHERE view_name = ?
          AND kind = 'state'
          AND id < (
            SELECT min_id FROM (
              SELECT MIN(id) AS min_id FROM (
                SELECT id FROM custom_view_history
                 WHERE view_name = ? AND kind = 'state'
                 ORDER BY id DESC LIMIT 80
              ) keep
            ) k
          )`,
      [view, view],
    );
  } catch (e: any) {
    console.error("pruneHistory fallo:", e?.message);
  }
}
