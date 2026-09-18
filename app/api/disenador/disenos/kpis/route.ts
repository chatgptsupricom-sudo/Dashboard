import { query } from "@/lib/db";
import { ensureDesignerDesignsTable } from "@/lib/designerDesigns";
import { requireRoles } from "@/lib/auth/roles";
import { CATEGORIAS_DISENO } from "@/lib/disenos/categorias";
import { NextRequest, NextResponse } from "next/server";

const ROLES = ["diseñador"]; // superadmin siempre pasa via requireRoles

/**
 * KPIs de diseños: cuántos se subieron por día, por semana y en el mes.
 *
 * Todas las cuentas salen de `created_at` (cuándo se subió el diseño) y se
 * agrupan en MySQL, no en JS: el catálogo guarda las imágenes en la misma
 * tabla, así que traer filas para contarlas movería los LONGBLOB.
 *
 * Los diseños en la papelera (deleted_at) no cuentan.
 *
 * `?mes=YYYY-MM` elige el mes del calendario (default: el mes en curso).
 * `?creador=` lo acota a un diseñador; sin él cuenta a todos.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;

  try {
    await ensureDesignerDesignsTable();

    const url = new URL(request.url);
    const mesParam = url.searchParams.get("mes") || "";
    const creador = url.searchParams.get("creador") || "";

    const hoy = new Date();
    const m = /^(\d{4})-(\d{2})$/.exec(mesParam);
    const anio = m ? Number(m[1]) : hoy.getFullYear();
    const mes = m ? Number(m[2]) : hoy.getMonth() + 1;
    const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const hastaDate = new Date(anio, mes, 0); // día 0 del mes siguiente = último del mes
    const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(hastaDate.getDate()).padStart(2, "0")}`;

    const filtroCreador = creador ? " AND created_by = ?" : "";
    const pCreador = creador ? [creador] : [];

    const [porDia, porCategoria, totales] = await Promise.all([
      // Un renglón por día con diseños: el calendario rellena los días vacíos.
      query(
        `SELECT DATE(created_at) AS dia, COUNT(*) AS n
         FROM designer_designs
         WHERE deleted_at IS NULL AND DATE(created_at) BETWEEN ? AND ?${filtroCreador}
         GROUP BY dia ORDER BY dia ASC`,
        [desde, hasta, ...pCreador]
      ),
      query(
        `SELECT COALESCE(NULLIF(category, ''), 'sin_categoria') AS categoria, COUNT(*) AS n
         FROM designer_designs
         WHERE deleted_at IS NULL AND DATE(created_at) BETWEEN ? AND ?${filtroCreador}
         GROUP BY categoria`,
        [desde, hasta, ...pCreador]
      ),
      // Hoy / semana en curso (lunes a domingo) / mes en curso: son los tres
      // números de arriba y NO dependen del mes que se esté viendo.
      query(
        `SELECT
           SUM(DATE(created_at) = CURDATE()) AS hoy,
           SUM(YEARWEEK(created_at, 1) = YEARWEEK(CURDATE(), 1)) AS semana,
           SUM(YEAR(created_at) = YEAR(CURDATE()) AND MONTH(created_at) = MONTH(CURDATE())) AS mesEnCurso,
           COUNT(*) AS total
         FROM designer_designs
         WHERE deleted_at IS NULL${filtroCreador}`,
        pCreador
      ),
    ]);

    const dias: Record<string, number> = {};
    for (const r of porDia.rows || []) {
      // DATE() vuelve como Date o string según el driver.
      const d = r.dia instanceof Date
        ? `${r.dia.getFullYear()}-${String(r.dia.getMonth() + 1).padStart(2, "0")}-${String(r.dia.getDate()).padStart(2, "0")}`
        : String(r.dia).slice(0, 10);
      dias[d] = Number(r.n) || 0;
    }

    // Semanas del mes, de lunes a domingo, recortadas al mes que se ve.
    const semanas: { inicio: string; fin: string; total: number }[] = [];
    const ultimo = hastaDate.getDate();
    let cursor = 1;
    while (cursor <= ultimo) {
      const fecha = new Date(anio, mes - 1, cursor);
      const diaSemana = (fecha.getDay() + 6) % 7; // 0 = lunes
      const finDia = Math.min(cursor + (6 - diaSemana), ultimo);
      const iso = (d: number) => `${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      let total = 0;
      for (let d = cursor; d <= finDia; d++) total += dias[iso(d)] || 0;
      semanas.push({ inicio: iso(cursor), fin: iso(finDia), total });
      cursor = finDia + 1;
    }

    const categorias: Record<string, number> = {};
    for (const r of porCategoria.rows || []) categorias[r.categoria] = Number(r.n) || 0;

    const t = totales.rows?.[0] || {};
    return NextResponse.json({
      success: true,
      mes: `${anio}-${String(mes).padStart(2, "0")}`,
      hoy: Number(t.hoy) || 0,
      semana: Number(t.semana) || 0,
      mesEnCurso: Number(t.mesEnCurso) || 0,
      total: Number(t.total) || 0,
      delMes: Object.values(dias).reduce((s, n) => s + n, 0),
      dias,
      semanas,
      categorias,
      catalogoCategorias: CATEGORIAS_DISENO,
    });
  } catch (error: any) {
    console.error("GET /api/disenador/disenos/kpis:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
