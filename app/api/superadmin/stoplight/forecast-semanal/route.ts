import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "supricom_jwt_secret_2024");

const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };

const COMPONENTS = [
  { key: "reunion_realizada", label: "Reunión realizada con responsables requeridos", peso: 25 },
  { key: "forecast_actualizado", label: "Forecast actualizado antes de la reunión", peso: 25 },
  { key: "quiebres_revisados", label: "Quiebres, antigüedad, órdenes y diferencias revisados", peso: 25 },
  { key: "decisiones_registradas", label: "Decisiones, responsables y fechas registrados", peso: 25 },
];

async function ensureTable() {
  await query(`CREATE TABLE IF NOT EXISTS forecast_checklist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    company_id INT NOT NULL,
    mes VARCHAR(7) NOT NULL,
    semana_index INT NOT NULL,
    reunion_realizada TINYINT(1) DEFAULT 0,
    forecast_actualizado TINYINT(1) DEFAULT 0,
    quiebres_revisados TINYINT(1) DEFAULT 0,
    decisiones_registradas TINYINT(1) DEFAULT 0,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_forecast_week (company_id, mes, semana_index)
  )`);
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const empresa = searchParams.get("empresa")?.toLowerCase() || "";
    const mes = searchParams.get("mes") || "";
    const semanaIndex = searchParams.get("semana_index");

    const companyId = COMPANY_MAP[empresa] || 9;

    await ensureTable();

    let sql = "SELECT * FROM forecast_checklist WHERE company_id = ? AND mes = ?";
    const params: any[] = [companyId, mes];

    if (semanaIndex !== null && semanaIndex !== undefined) {
      sql += " AND semana_index = ?";
      params.push(parseInt(semanaIndex));
    }
    sql += " ORDER BY semana_index";

    const result = await query(sql, params);
    const rows = result.rows as any[];

    const score = rows.length > 0
      ? Math.round(rows.reduce((sum: number, r: any) => {
          const checked = [r.reunion_realizada, r.forecast_actualizado, r.quiebres_revisados, r.decisiones_registradas].filter(Boolean).length;
          return sum + (checked / 4) * 100;
        }, 0) / rows.length)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        components: COMPONENTS,
        rows: rows.map((r: any) => ({
          semanaIndex: r.semana_index,
          reunionRealizada: !!r.reunion_realizada,
          forecastActualizado: !!r.forecast_actualizado,
          quiebresRevisados: !!r.quiebres_revisados,
          decisionesRegistradas: !!r.decisiones_registradas,
          notas: r.notas || "",
          score: Math.round(
            ([r.reunion_realizada, r.forecast_actualizado, r.quiebres_revisados, r.decisiones_registradas].filter(Boolean).length / 4) * 100
          ),
        })),
        score,
      },
    });
  } catch (error: any) {
    console.error("Error GET forecast:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin" && userRole !== "gerencia de ventas" && userRole !== "compras" && userRole !== "gerente de operaciones") return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });

    await ensureTable();

    const body = await request.json();
    const { empresa, mes, semana_index, reunion_realizada, forecast_actualizado, quiebres_revisados, decisiones_registradas, notas } = body;

    const companyId = COMPANY_MAP[empresa] || 9;

    await query(
      `INSERT INTO forecast_checklist (company_id, mes, semana_index, reunion_realizada, forecast_actualizado, quiebres_revisados, decisiones_registradas, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         reunion_realizada = VALUES(reunion_realizada),
         forecast_actualizado = VALUES(forecast_actualizado),
         quiebres_revisados = VALUES(quiebres_revisados),
         decisiones_registradas = VALUES(decisiones_registradas),
         notas = VALUES(notas)`,
      [companyId, mes, semana_index, reunion_realizada ? 1 : 0, forecast_actualizado ? 1 : 0, quiebres_revisados ? 1 : 0, decisiones_registradas ? 1 : 0, notas || ""]
    );

    const checked = [reunion_realizada, forecast_actualizado, quiebres_revisados, decisiones_registradas].filter(Boolean).length;
    const weekScore = Math.round((checked / 4) * 100);

    await query(
      `INSERT INTO kpi_weekly_data (kpi_key, company_id, mes, semana_index, semana_label, valor, meta)
       VALUES ('forecast_semanal', ?, ?, ?, '', ?, 100)
       ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
      [companyId, mes, semana_index, weekScore]
    );

    return NextResponse.json({ success: true, score: weekScore });
  } catch (error: any) {
    console.error("Error POST forecast:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
