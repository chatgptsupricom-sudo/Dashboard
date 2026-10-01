import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * Persistencia del HTML de Frecuencia CPM (vista `frecuencia_cpm` de
 * custom_views). El HTML llama directo a esta ruta desde el iframe, con la
 * cookie de sesion: un plan por año+mes, guardado tal cual lo manda la app.
 */
const ROLES = ["adminleads", "diseñador"];
const MAX_BYTES = 5 * 1024 * 1024;

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await query(`
    CREATE TABLE IF NOT EXISTS plan_frecuencia_cpm (
      anio SMALLINT NOT NULL,
      mes TINYINT NOT NULL,
      plan_json LONGTEXT NOT NULL,
      updated_by VARCHAR(120) NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (anio, mes)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

function periodo(year: unknown, month: unknown) {
  const anio = Number(year);
  const mes = Number(month);
  if (!Number.isInteger(anio) || anio < 2000 || anio > 2100) return null;
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) return null;
  return { anio, mes };
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;

  const p = periodo(request.nextUrl.searchParams.get("year"), request.nextUrl.searchParams.get("month"));
  if (!p) return NextResponse.json({ error: "Año o mes invalido" }, { status: 400 });

  try {
    await ensureTabla();
    const r = await query(
      `SELECT plan_json, updated_by, updated_at FROM plan_frecuencia_cpm WHERE anio = ? AND mes = ?`,
      [p.anio, p.mes],
    );
    const row = r.rows?.[0];
    return NextResponse.json({
      plan: row ? JSON.parse(row.plan_json) : null,
      updatedBy: row?.updated_by ?? null,
      updatedAt: row?.updated_at ?? null,
    });
  } catch (error: any) {
    console.error("frecuencia GET error:", error?.message);
    return NextResponse.json({ error: "No se pudo leer el plan" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;

  try {
    const texto = await request.text();
    if (texto.length > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Plan demasiado grande" }, { status: 413 });
    }
    const body = JSON.parse(texto);
    const p = periodo(body?.year, body?.month);
    if (!p || !Array.isArray(body?.cpms)) {
      return NextResponse.json({ success: false, error: "Plan invalido" }, { status: 400 });
    }

    await ensureTabla();
    await query(
      `INSERT INTO plan_frecuencia_cpm (anio, mes, plan_json, updated_by)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE plan_json = VALUES(plan_json), updated_by = VALUES(updated_by)`,
      [p.anio, p.mes, texto, String(auth.payload?.email || auth.payload?.role || "")],
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("frecuencia POST error:", error?.message);
    return NextResponse.json({ success: false, error: "No se pudo guardar el plan" }, { status: 500 });
  }
}
