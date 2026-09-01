import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/superadmin/system-audit
 *
 * Lee system_audit_log (ver lib/audit/logger.ts) — el registro genérico de
 * TODA escritura (INSERT/UPDATE/DELETE) que pasa por lib/db.ts::query(),
 * capturado automáticamente vía AsyncLocalStorage, no por llamadas
 * manuales. Distinto de /api/superadmin/auditoria_panel (tabla audit_logs,
 * atada a reasignación de leads) — ese se deja intacto, este es nuevo.
 *
 * Paginación y filtros en SQL, no en el cliente: a diferencia de
 * auditoria_panel (que trae todo con un SELECT * sin límite), esta tabla
 * puede crecer mucho más rápido al cubrir todo el panel.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin", "gerente de operaciones"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "25", 10)));
    const offset = (page - 1) * limit;

    const userId = searchParams.get("user_id") || "";
    const tableName = searchParams.get("table") || "";
    const method = searchParams.get("method") || "";
    const dateFrom = searchParams.get("date_from") || "";
    const dateTo = searchParams.get("date_to") || "";
    const search = searchParams.get("search") || "";

    const where: string[] = ["1=1"];
    const params: any[] = [];

    if (userId) {
      where.push("user_id = ?");
      params.push(userId);
    }
    if (tableName) {
      where.push("table_name = ?");
      params.push(tableName);
    }
    if (method) {
      where.push("method = ?");
      params.push(method.toUpperCase());
    }
    if (dateFrom) {
      where.push("created_at >= ?");
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      where.push("created_at <= ?");
      params.push(`${dateTo} 23:59:59`);
    }
    if (search) {
      where.push("(user_name LIKE ? OR path LIKE ? OR table_name LIKE ?)");
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    const whereSql = where.join(" AND ");

    const countResult = await query(
      `SELECT COUNT(*) as total FROM system_audit_log WHERE ${whereSql}`,
      params,
    );
    const total = countResult.rows[0]?.total || 0;

    const rowsResult = await query(
      `SELECT id, created_at, user_id, user_name, user_role, method, path,
              table_name, record_id, sql_text, sql_params, before_data, after_data, status
       FROM system_audit_log
       WHERE ${whereSql}
       ORDER BY created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    // Tablas distintas presentes en el log — para poblar el filtro sin un
    // segundo viaje de ida y vuelta del cliente.
    const tablesResult = await query(
      `SELECT DISTINCT table_name FROM system_audit_log WHERE table_name IS NOT NULL ORDER BY table_name`,
    );

    return NextResponse.json({
      success: true,
      logs: rowsResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      tables: tablesResult.rows.map((r: any) => r.table_name),
    });
  } catch (error: any) {
    // Si system_audit_log todavía no existe (nadie ha hecho ninguna
    // escritura desde que se agregó esto), se devuelve una lista vacía en
    // vez de un 500 — la tabla se crea sola en la primera mutación real
    // (ver lib/db.ts::asegurarTablaAuditoria).
    if (error?.code === "ER_NO_SUCH_TABLE") {
      return NextResponse.json({
        success: true,
        logs: [],
        total: 0,
        page: 1,
        totalPages: 0,
        tables: [],
      });
    }
    console.error("Error GET system-audit:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
