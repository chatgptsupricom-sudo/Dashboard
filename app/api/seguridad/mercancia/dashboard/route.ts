import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { sqlAspecto } from "@/lib/seguridad/calificaciones";
import { sqlFueDevuelto, sqlRechazo } from "@/lib/seguridad/novedades";
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
    // Aspecto de cada nota (issue #302): picking o despacho. Las de antes,
    // con una sola nota, cuentan como despacho.
    const aspecto = await sqlAspecto("c");
    // Un egreso que Seguridad devolvio a Almacen tuvo novedades aunque la
    // ultima verificacion saliera limpia (#301).
    const devuelto = await sqlFueDevuelto("m");
    // Un cancelado (el cliente cancelo) no es una falla del despacho.
    const rechazo = await sqlRechazo("m");
    const cidsParam = cids !== null ? [cids] : [];

    const [hoy, ayer, pendientes, descuadres, calif, recientes, topAlmacenistas, porEtapa] =
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
          // Por etapas: lo que espera a Seguridad en el porton. Los egresos del
          // flujo anterior (sin etapa) siguen contando por su estado.
          `SELECT COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso'
              AND (etapa = 'por_verificar' OR (etapa IS NULL AND estado = 'pendiente'))
              ${cidsWhere}`,
          cidsParam,
        ),
        query(
          `SELECT COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso' AND estado = 'descuadre'
              AND fecha >= CURDATE() - INTERVAL 30 DAY ${cidsWhere}`,
          cidsParam,
        ),
        query(
          `SELECT AVG(c.calificacion) AS promedio, COUNT(*) AS total,
                  AVG(CASE WHEN ${aspecto} = 'picking' THEN c.calificacion END) AS promedio_picking,
                  AVG(CASE WHEN ${aspecto} = 'despacho' THEN c.calificacion END) AS promedio_despacho
             FROM seguridad_calificaciones c
             JOIN seguridad_mercancia m ON m.id = c.relacionado_id
            WHERE c.relacionado_a = 'mercancia' AND m.tipo = 'egreso'
              AND c.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
              ${cids !== null ? "AND m.cids = ?" : ""}`,
          cidsParam,
        ),
        query(
          `SELECT id, fecha, odoo_picking_name, contraparte, almacenista_nombre,
                  almacenistas_json, estado, etapa
             FROM seguridad_mercancia
            WHERE tipo = 'egreso' ${cidsWhere}
            ORDER BY fecha DESC, id DESC
            LIMIT 8`,
          cidsParam,
        ),
        // Ranking del mes (issue #302): por almacenista y por aspecto. Con dos
        // notas por egreso, "egresos" es DISTINCT: antes COUNT(*) contaba
        // notas. Con novedades = Seguridad no aprobo, hubo descuadre o lo devolvio a Almacen.
        query(
          `SELECT c.almacenista_nombre AS nombre,
                  COUNT(DISTINCT c.relacionado_id) AS egresos,
                  AVG(c.calificacion) AS promedio,
                  COUNT(c.id) AS calificaciones,
                  AVG(CASE WHEN ${aspecto} = 'picking' THEN c.calificacion END) AS promedio_picking,
                  SUM(${aspecto} = 'picking') AS n_picking,
                  AVG(CASE WHEN ${aspecto} = 'despacho' THEN c.calificacion END) AS promedio_despacho,
                  SUM(${aspecto} = 'despacho') AS n_despacho,
                  COUNT(DISTINCT CASE WHEN m.estado = 'descuadre' OR ${rechazo} OR ${devuelto}
                                      THEN c.relacionado_id END) AS con_novedades
             FROM seguridad_calificaciones c
             JOIN seguridad_mercancia m ON m.id = c.relacionado_id
            WHERE c.relacionado_a = 'mercancia' AND m.tipo = 'egreso'
              AND c.created_at >= DATE_FORMAT(NOW(), '%Y-%m-01')
              ${cids !== null ? "AND m.cids = ?" : ""}
            GROUP BY c.almacenista_nombre
            ORDER BY promedio DESC, calificaciones DESC
            LIMIT 5`,
          cidsParam,
        ),
        // Cuantos egresos hay en cada etapa abierta: el tablero de "donde
        // esta cada camion" de un vistazo.
        query(
          `SELECT etapa, COUNT(*) AS n FROM seguridad_mercancia
            WHERE tipo = 'egreso' AND etapa IS NOT NULL AND etapa <> 'cerrado'
              ${cidsWhere}
            GROUP BY etapa`,
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
        promedio_picking: numeroONull((calif.rows[0] as any)?.promedio_picking),
        promedio_despacho: numeroONull((calif.rows[0] as any)?.promedio_despacho),
      },
      egresos_recientes: recientes.rows,
      por_etapa: Object.fromEntries(
        (porEtapa.rows as any[]).map((r) => [r.etapa, Number(r.n)]),
      ),
      top_almacenistas: (topAlmacenistas.rows as any[]).map((r) => ({
        nombre: r.nombre,
        egresos: Number(r.egresos),
        promedio: Number(r.promedio),
        calificaciones: Number(r.calificaciones),
        promedio_picking: numeroONull(r.promedio_picking),
        n_picking: Number(r.n_picking || 0),
        promedio_despacho: numeroONull(r.promedio_despacho),
        n_despacho: Number(r.n_despacho || 0),
        con_novedades: Number(r.con_novedades || 0),
      })),
    });
  } catch (error: any) {
    console.error("Error cargando dashboard de mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

function numeroONull(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}
