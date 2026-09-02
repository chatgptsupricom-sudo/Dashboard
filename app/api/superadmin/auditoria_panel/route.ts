import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/superadmin/auditoria_panel
 *
 * Une dos fuentes:
 * - `audit_logs` (tabla vieja): NO es solo reasignación de leads — 5 rutas
 *   distintas insertan ahí a mano, cada una con su propio `action` y su
 *   propio shape de `changes` (ver ACTION_TABLE abajo: REASSIGN de
 *   adminleads/reasignar, pero también EDIT_CUOTA de las 3 rutas de cuota,
 *   CREATE_ACTIVITY/ASSIGN_TASK de activities, y UPDATE_MASSIVE_MOQ_COST de
 *   compras/moq). Tiene datos reales desde antes de este trabajo (cientos
 *   de filas) y el usuario quiere seguir viéndolos acá, no perderlos.
 * - `system_audit_log` (nueva, ver lib/audit/logger.ts) — TODA escritura
 *   (INSERT/UPDATE/DELETE) que pasa por lib/db.ts::query(), capturada
 *   automáticamente.
 *
 * Se combinan en JS en vez de un UNION SQL: los filtros por tabla/método no
 * tienen columnas equivalentes 1:1 entre ambas (audit_logs no tiene
 * table_name real — se deriva de `action` vía ACTION_TABLE), y así cada
 * fuente puede fallar de forma independiente (p.ej. si system_audit_log
 * todavía no existe en un ambiente nuevo) sin tumbar la otra.
 */

// A qué tabla de negocio corresponde cada `action` histórico de audit_logs,
// y cómo sacar su record_id del JSON `changes` (distinto por acción — no
// hay una columna genérica). `recordId` recibe también la columna real
// `lead_id` porque es la única acción que la usa. Una acción que no está
// acá (código viejo ya borrado, o algo insertado a mano fuera de las rutas
// conocidas) cae al default: sin tabla ni record_id asumidos — mejor "no
// se sabe" que un dato incorrecto.
const ACTION_TABLE: Record<string, { table: string; recordId: (changes: any, leadId: any) => string | null }> = {
  REASSIGN: { table: "leads", recordId: (_c, leadId) => (leadId != null ? String(leadId) : null) },
  EDIT_CUOTA: { table: "cuota", recordId: (c) => (c?.seller_id != null ? String(c.seller_id) : null) },
  CREATE_ACTIVITY: { table: "activities", recordId: () => null },
  ASSIGN_TASK: { table: "activities", recordId: (c) => (c?.target_user != null ? String(c.target_user) : null) },
  UPDATE_MASSIVE_MOQ_COST: { table: "moqs", recordId: () => null },
};

function tablasParaAcciones(acciones: string[]): string[] {
  const tablas = new Set<string>();
  for (const a of acciones) {
    const t = ACTION_TABLE[a]?.table;
    if (t) tablas.add(t);
  }
  return Array.from(tablas);
}

const MAX_FETCH = 2000;

function parseFilters(searchParams: URLSearchParams) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
  return {
    page,
    limit,
    offset: (page - 1) * limit,
    userId: searchParams.get("user_id") || "",
    tableName: searchParams.get("table") || "",
    method: searchParams.get("method") || "",
    dateFrom: searchParams.get("date_from") || "",
    dateTo: searchParams.get("date_to") || "",
    search: searchParams.get("search") || "",
  };
}

async function fetchSystemLogs(f: ReturnType<typeof parseFilters>, fetchLimit: number) {
  const where: string[] = ["1=1"];
  const params: any[] = [];

  if (f.userId) { where.push("user_id = ?"); params.push(f.userId); }
  if (f.tableName) { where.push("table_name = ?"); params.push(f.tableName); }
  if (f.method) { where.push("method = ?"); params.push(f.method.toUpperCase()); }
  if (f.dateFrom) { where.push("created_at >= ?"); params.push(`${f.dateFrom} 00:00:00`); }
  if (f.dateTo) { where.push("created_at <= ?"); params.push(`${f.dateTo} 23:59:59`); }
  if (f.search) {
    where.push("(user_name LIKE ? OR table_name LIKE ?)");
    const s = `%${f.search}%`;
    params.push(s, s);
  }
  const whereSql = where.join(" AND ");

  try {
    const [countResult, rowsResult] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM system_audit_log WHERE ${whereSql}`, params),
      query(
        `SELECT id, created_at, user_id, user_name, user_role, method, path,
                table_name, record_id, sql_text, sql_params, before_data, after_data, status
         FROM system_audit_log
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${fetchLimit}`,
        params,
      ),
    ]);
    return {
      total: countResult.rows[0]?.total || 0,
      rows: rowsResult.rows.map((r: any) => ({ ...r, source: "system" as const })),
    };
  } catch (error: any) {
    if (error?.code === "ER_NO_SUCH_TABLE") return { total: 0, rows: [] };
    throw error;
  }
}

async function fetchLegacyLogs(f: ReturnType<typeof parseFilters>, fetchLimit: number) {
  const where: string[] = ["1=1"];
  const params: any[] = [];

  if (f.userId) { where.push("user_id = ?"); params.push(f.userId); }
  if (f.dateFrom) { where.push("created_at >= ?"); params.push(`${f.dateFrom} 00:00:00`); }
  if (f.dateTo) { where.push("created_at <= ?"); params.push(`${f.dateTo} 23:59:59`); }
  if (f.method) { where.push("action = ?"); params.push(f.method.toUpperCase()); }
  if (f.tableName) {
    // No hay columna table_name real — se traduce el filtro a la lista de
    // `action`s que mapean a esa tabla (ver ACTION_TABLE). Si ninguna
    // acción conocida cae en esa tabla, esta fuente no aporta nada.
    const acciones = Object.entries(ACTION_TABLE)
      .filter(([, v]) => v.table === f.tableName)
      .map(([k]) => k);
    if (acciones.length === 0) return { total: 0, rows: [] };
    where.push(`action IN (${acciones.map(() => "?").join(",")})`);
    params.push(...acciones);
  }
  if (f.search) {
    where.push("(user_name LIKE ? OR action LIKE ?)");
    const s = `%${f.search}%`;
    params.push(s, s);
  }
  const whereSql = where.join(" AND ");

  try {
    const [countResult, rowsResult] = await Promise.all([
      query(`SELECT COUNT(*) as total FROM audit_logs WHERE ${whereSql}`, params),
      query(
        `SELECT id, created_at, user_id, user_name, role, action, lead_id, changes
         FROM audit_logs
         WHERE ${whereSql}
         ORDER BY created_at DESC
         LIMIT ${fetchLimit}`,
        params,
      ),
    ]);
    return {
      total: countResult.rows[0]?.total || 0,
      rows: rowsResult.rows.map((r: any, i: number) => {
        let changes: any = null;
        try {
          changes = typeof r.changes === "string" ? JSON.parse(r.changes) : r.changes ?? null;
        } catch {
          // `changes` no es JSON válido en esta fila vieja — se sigue
          // mostrando la fila (usuario, acción, fecha), solo sin poder
          // derivar record_id ni el diff de campos.
        }
        const mapping = ACTION_TABLE[r.action];
        return {
          // Id sintético (posición dentro de este fetch, no el `id` crudo
          // de audit_logs): compras/moq/route.ts inserta audit_logs.id a
          // mano como Math.floor(Date.now()/1000) en vez de dejarlo
          // autoincremental, así que dos filas reales pueden compartir el
          // mismo id si caen en el mismo segundo — `-r.id` colisionaba y
          // rompía las keys de React. Negativo para no chocar nunca con los
          // ids (positivos) de system_audit_log al combinar ambas listas.
          id: -(i + 1),
          created_at: r.created_at,
          user_id: r.user_id != null ? String(r.user_id) : null,
          user_name: r.user_name,
          user_role: r.role,
          method: r.action,
          path: null,
          table_name: mapping?.table ?? null,
          record_id: mapping ? mapping.recordId(changes, r.lead_id) : null,
          sql_text: null,
          sql_params: r.changes,
          before_data: null,
          after_data: null,
          status: "ok",
          source: "legacy" as const,
        };
      }),
    };
  } catch (error: any) {
    if (error?.code === "ER_NO_SUCH_TABLE") return { total: 0, rows: [] };
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const f = parseFilters(searchParams);
    const fetchLimit = Math.min(MAX_FETCH, f.offset + f.limit);

    const [system, legacy] = await Promise.all([
      fetchSystemLogs(f, fetchLimit),
      fetchLegacyLogs(f, fetchLimit),
    ]);

    const combined = [...system.rows, ...legacy.rows].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    const pageRows = combined.slice(f.offset, f.offset + f.limit);
    const total = system.total + legacy.total;

    // Listas de opciones para los filtros: SIEMPRE sin aplicar los filtros
    // activos, para que el usuario pueda ver y elegir cualquier valor
    // válido aunque ya tenga otro filtro puesto (si no, filtrar por
    // method=UPDATE hacía desaparecer "leads"/"REASSIGN" de las listas,
    // porque fetchLegacyLogs corta en seco cuando el filtro activo no es
    // el suyo).
    const [tablesResult, methodsResult, legacyActionsResult] = await Promise.all([
      query(
        `SELECT DISTINCT table_name FROM system_audit_log WHERE table_name IS NOT NULL ORDER BY table_name`,
      ).catch((e: any) => (e?.code === "ER_NO_SUCH_TABLE" ? { rows: [] } : Promise.reject(e))),
      query(
        `SELECT DISTINCT method FROM system_audit_log WHERE method IS NOT NULL ORDER BY method`,
      ).catch((e: any) => (e?.code === "ER_NO_SUCH_TABLE" ? { rows: [] } : Promise.reject(e))),
      query(`SELECT DISTINCT action FROM audit_logs WHERE action IS NOT NULL`)
        .catch((e: any) => (e?.code === "ER_NO_SUCH_TABLE" ? { rows: [] } : Promise.reject(e))),
    ]);
    const legacyActions: string[] = legacyActionsResult.rows.map((r: any) => r.action);

    const tables = new Set<string>(tablesResult.rows.map((r: any) => r.table_name));
    for (const t of tablasParaAcciones(legacyActions)) tables.add(t);

    const methods = new Set<string>(methodsResult.rows.map((r: any) => r.method));
    for (const a of legacyActions) methods.add(a);

    return NextResponse.json({
      success: true,
      logs: pageRows,
      total,
      page: f.page,
      totalPages: Math.ceil(total / f.limit),
      tables: Array.from(tables).sort(),
      methods: Array.from(methods).sort(),
    });
  } catch (error: any) {
    console.error("Error GET auditoria_panel:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
