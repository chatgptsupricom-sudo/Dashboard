import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/superadmin/auditoria_panel
 *
 * Une dos fuentes:
 * - `audit_logs` (tabla vieja, solo reasignación de leads — `action` siempre
 *   'REASSIGN', `changes` es un JSON `{lead_name, from, to}` armado a mano
 *   por el endpoint de reasignación). Tiene datos reales desde antes de
 *   este trabajo (cientos de filas) y el usuario quiere seguir viéndolos
 *   acá, no perderlos.
 * - `system_audit_log` (nueva, ver lib/audit/logger.ts) — TODA escritura
 *   (INSERT/UPDATE/DELETE) que pasa por lib/db.ts::query(), capturada
 *   automáticamente.
 *
 * Se combinan en JS en vez de un UNION SQL: los filtros por tabla/método no
 * tienen columnas equivalentes 1:1 entre ambas (audit_logs no tiene
 * table_name/method reales, son literales fijos: tabla siempre 'leads',
 * método siempre 'REASSIGN'), y así cada fuente puede fallar de forma
 * independiente (p.ej. si system_audit_log todavía no existe en un
 * ambiente nuevo) sin tumbar la otra.
 */

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

// La tabla vieja solo audita reasignación de leads: "tabla" es siempre
// 'leads' y "método" siempre 'REASSIGN'. Si el filtro pide otra cosa, esta
// fuente no aporta nada — no hace falta ni consultarla.
async function fetchLegacyLogs(f: ReturnType<typeof parseFilters>, fetchLimit: number) {
  if (f.tableName && f.tableName.toLowerCase() !== "leads") return { total: 0, rows: [] };
  if (f.method && f.method.toUpperCase() !== "REASSIGN") return { total: 0, rows: [] };

  const where: string[] = ["1=1"];
  const params: any[] = [];

  if (f.userId) { where.push("user_id = ?"); params.push(f.userId); }
  if (f.dateFrom) { where.push("created_at >= ?"); params.push(`${f.dateFrom} 00:00:00`); }
  if (f.dateTo) { where.push("created_at <= ?"); params.push(`${f.dateTo} 23:59:59`); }
  if (f.search) {
    where.push("(user_name LIKE ? OR ? LIKE ?)");
    const s = `%${f.search}%`;
    params.push(s, "leads", s);
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
      rows: rowsResult.rows.map((r: any) => ({
        // Ids negativos para que nunca choquen con los (positivos) de
        // system_audit_log al combinar ambas listas.
        id: -r.id,
        created_at: r.created_at,
        user_id: r.user_id != null ? String(r.user_id) : null,
        user_name: r.user_name,
        user_role: r.role,
        method: r.action,
        path: null,
        table_name: "leads",
        record_id: r.lead_id != null ? String(r.lead_id) : null,
        sql_text: null,
        sql_params: r.changes,
        before_data: null,
        after_data: null,
        status: "ok",
        source: "legacy" as const,
      })),
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
    const [tablesResult, methodsResult, legacyExists] = await Promise.all([
      query(
        `SELECT DISTINCT table_name FROM system_audit_log WHERE table_name IS NOT NULL ORDER BY table_name`,
      ).catch((e: any) => (e?.code === "ER_NO_SUCH_TABLE" ? { rows: [] } : Promise.reject(e))),
      query(
        `SELECT DISTINCT method FROM system_audit_log WHERE method IS NOT NULL ORDER BY method`,
      ).catch((e: any) => (e?.code === "ER_NO_SUCH_TABLE" ? { rows: [] } : Promise.reject(e))),
      query(`SELECT 1 FROM audit_logs LIMIT 1`)
        .then((r) => r.rows.length > 0)
        .catch((e: any) => (e?.code === "ER_NO_SUCH_TABLE" ? false : Promise.reject(e))),
    ]);
    const tables = new Set<string>(tablesResult.rows.map((r: any) => r.table_name));
    if (legacyExists) tables.add("leads");

    const methods = new Set<string>(methodsResult.rows.map((r: any) => r.method));
    if (legacyExists) methods.add("REASSIGN");

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
