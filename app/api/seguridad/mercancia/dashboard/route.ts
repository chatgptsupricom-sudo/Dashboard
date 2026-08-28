import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /api/seguridad/mercancia/dashboard
 *
 * KPIs del egreso de mercancia, scopeados a la sucursal de la sesion.
 * Deliberadamente solo `tipo = 'egreso'`: es lo unico que le toca a Almacen
 * (issue #42/#43) — el ingreso sigue siendo de Seguridad, con su propio
 * dashboard en /api/seguridad/dashboard.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const cidsWhere = cids !== null ? "AND cids = ?" : "";
    const cidsParam = cids !== null ? [cids] : [];

    const [hoy, ayer, pendientes, descuadres, calif, recientes, topAlmacenistas] =
      await Promise.all([
        query(
          `SELECT COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso' AND fecha = CURDATE() ${cidsWhere}`,
          cidsParam,
        ),
        query(
          `SELECT COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso' AND fecha = CURDATE() - INTERVAL 1 DAY ${cidsWhere}`,
          cidsParam,
        ),
        query(
          `SELECT COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso' AND estado = 'pendiente' ${cidsWhere}`,
          cidsParam,
        ),
        query(
          `SELECT COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso' AND estado = 'descuadre'
              AND fecha >= CURDATE() - INTERVAL 30 DAY ${cidsWhere}`,
          cidsParam,
        ),
        query(
          `SELECT AVG(c.calificacion) AS promedio, COUNT(*) AS total
             FROM seguridad_calificaciones c
             JOIN seguridad_mercancia m ON m.id = c.relacionado_id
            WHERE c.relacionado_a = 'mercancia' AND m.tipo = 'egreso'
              AND c.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
              ${cids !== null ? "AND m.cids = ?" : ""}`,
          cidsParam,
        ),
        query(
          `SELECT id, fecha, odoo_picking_name, contraparte, almacenista_nombre,
                  almacenistas_json, estado
             FROM seguridad_mercancia
            WHERE tipo = 'egreso' ${cidsWhere}
            ORDER BY fecha DESC, id DESC
            LIMIT 8`,
          cidsParam,
        ),
        query(
          `SELECT c.almacenista_nombre AS nombre,
                  COUNT(*) AS egresos,
                  AVG(c.calificacion) AS promedio,
                  COUNT(c.id) AS calificaciones
             FROM seguridad_calificaciones c
             JOIN seguridad_mercancia m ON m.id = c.relacionado_id
            WHERE c.relacionado_a = 'mercancia' AND m.tipo = 'egreso'
              ${cids !== null ? "AND m.cids = ?" : ""}
            GROUP BY c.almacenista_nombre
            ORDER BY promedio DESC
            LIMIT 5`,
          cidsParam,
        ),
      ]);

    const hoyN = Number((hoy.rows[0] as any)?.n || 0);
    const ayerN = Number((ayer.rows[0] as any)?.n || 0);

    return NextResponse.json({
      success: true,
      kpis: {
        egresos_hoy: hoyN,
        egresos_hoy_delta: hoyN - ayerN,
        pendientes_verificar: Number((pendientes.rows[0] as any)?.n || 0),
        descuadres_30d: Number((descuadres.rows[0] as any)?.n || 0),
        promedio_calificacion: (calif.rows[0] as any)?.promedio
          ? Number((calif.rows[0] as any).promedio)
          : null,
        total_calificaciones_mes: Number((calif.rows[0] as any)?.total || 0),
      },
      egresos_recientes: recientes.rows,
      top_almacenistas: (topAlmacenistas.rows as any[]).map((r) => ({
        nombre: r.nombre,
        egresos: Number(r.egresos),
        promedio: Number(r.promedio),
        calificaciones: Number(r.calificaciones),
      })),
    });
  } catch (error: any) {
    console.error("Error cargando dashboard de mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
