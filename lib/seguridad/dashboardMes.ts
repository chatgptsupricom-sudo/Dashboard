import { query } from "@/lib/db";
import { sqlAspecto } from "@/lib/seguridad/calificaciones";

/**
 * Métricas del Dashboard de Seguridad (/seguridad), del mes en curso y de la
 * sucursal de quien lo mira (`cids`; null = superadmin, todas):
 *
 *  - egresos_mes:        despachos de mercancía (egresos) del mes.
 *  - rma_ingresos_mes:   equipos de RMA que Seguridad recibió este mes.
 *  - rma_despachos_mes:  equipos de RMA que Seguridad devolvió este mes.
 *  - calificacion:       nota de los almacenistas en el despacho de mercancía
 *                        (picking y salida en portón, #302), promedio y ranking.
 *  - rma_mas_7d:         RMA recibidos hace más de 7 días y sin despachar.
 *  - rma_por_despachar:  RMA que el taller ya terminó y falta devolver.
 *  - rma_por_llegar:     tickets del portal (30 días) que todavía no llegaron.
 *
 * Deliberadamente sin estadísticas del taller de RMA (eso es de RMA).
 */

const INICIO_MES = "DATE_FORMAT(CURDATE(), '%Y-%m-01')";
/** Estados en los que RMA ya terminó el caso: el equipo está listo para devolverse. */
const TERMINADOS = "('reparado','nota_credito','no_procesado')";

export async function metricasDelMes(cids: number | null) {
  const p = cids !== null ? [cids] : [];
  const porSede = (col: string) => (cids !== null ? ` AND ${col} = ?` : "");
  const aspecto = await sqlAspecto("c");

  // Pendiente de despacho = ingreso sin despacho (mismo criterio que el resto
  // del tablero).
  const sinDespacho = `FROM seguridad_ingresos i
    LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
    LEFT JOIN rma_cases rc ON rc.id = i.rma_case_id
    WHERE d.id IS NULL${porSede("i.cids")}`;

  const [
    egresos,
    ingresos,
    despachos,
    califTotal,
    ranking,
    mas7Count,
    mas7,
    listosCount,
    listos,
    porLlegarCount,
    porLlegar,
  ] = await Promise.all([
    query(
      `SELECT COUNT(*) AS n FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND fecha >= ${INICIO_MES}${porSede("cids")}`,
      p,
    ),
    query(
      `SELECT COUNT(*) AS n FROM seguridad_ingresos
        WHERE fecha_entrega >= ${INICIO_MES}${porSede("cids")}`,
      p,
    ),
    query(
      `SELECT COUNT(*) AS n FROM seguridad_despachos
        WHERE fecha_despacho >= ${INICIO_MES}${porSede("cids")}`,
      p,
    ),
    query(
      `SELECT AVG(c.calificacion) AS promedio, COUNT(*) AS total,
              AVG(CASE WHEN ${aspecto} = 'picking' THEN c.calificacion END) AS promedio_picking,
              SUM(${aspecto} = 'picking') AS total_picking,
              AVG(CASE WHEN ${aspecto} = 'despacho' THEN c.calificacion END) AS promedio_despacho,
              SUM(${aspecto} = 'despacho') AS total_despacho
         FROM seguridad_calificaciones c
         JOIN seguridad_mercancia m ON m.id = c.relacionado_id
        WHERE c.relacionado_a = 'mercancia' AND m.tipo = 'egreso'
          AND c.created_at >= ${INICIO_MES}${porSede("m.cids")}`,
      p,
    ),
    query(
      `SELECT c.almacenista_nombre AS nombre,
              AVG(c.calificacion) AS promedio,
              COUNT(*) AS calificaciones,
              COUNT(DISTINCT c.relacionado_id) AS egresos,
              AVG(CASE WHEN ${aspecto} = 'picking' THEN c.calificacion END) AS promedio_picking,
              AVG(CASE WHEN ${aspecto} = 'despacho' THEN c.calificacion END) AS promedio_despacho
         FROM seguridad_calificaciones c
         JOIN seguridad_mercancia m ON m.id = c.relacionado_id
        WHERE c.relacionado_a = 'mercancia' AND m.tipo = 'egreso'
          AND c.created_at >= ${INICIO_MES}${porSede("m.cids")}
        GROUP BY c.almacenista_nombre
        ORDER BY promedio DESC, calificaciones DESC
        LIMIT 10`,
      p,
    ),
    query(`SELECT COUNT(*) AS n ${sinDespacho} AND i.fecha_entrega < CURDATE() - INTERVAL 7 DAY`, p),
    query(
      `SELECT i.id, i.fecha_entrega, i.cliente_nombre, i.hardware, i.serial,
              DATEDIFF(CURDATE(), i.fecha_entrega) AS dias_en_taller,
              rc.case_number, rc.status AS rma_status
         ${sinDespacho} AND i.fecha_entrega < CURDATE() - INTERVAL 7 DAY
        ORDER BY i.fecha_entrega ASC
        LIMIT 10`,
      p,
    ),
    query(`SELECT COUNT(*) AS n ${sinDespacho} AND rc.status IN ${TERMINADOS}`, p),
    query(
      `SELECT i.id, i.fecha_entrega, i.cliente_nombre, i.hardware, i.serial,
              DATEDIFF(CURDATE(), i.fecha_entrega) AS dias_en_taller,
              rc.case_number, rc.status AS rma_status
         ${sinDespacho} AND rc.status IN ${TERMINADOS}
        ORDER BY i.fecha_entrega ASC
        LIMIT 10`,
      p,
    ),
    // `rma_cases` no tiene `cids`: usa `company_id`, mismo espacio (9/10/7).
    query(
      `SELECT COUNT(*) AS n
         FROM rma_cases c
    LEFT JOIN seguridad_ingresos i ON i.rma_case_id = c.id
        WHERE c.origen = 'portal' AND i.id IS NULL
          AND c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${porSede("c.company_id")}`,
      p,
    ),
    query(
      `SELECT c.id, c.case_number, c.client_name, c.model, c.hardware, c.created_at,
              DATEDIFF(CURDATE(), DATE(c.created_at)) AS dias
         FROM rma_cases c
    LEFT JOIN seguridad_ingresos i ON i.rma_case_id = c.id
        WHERE c.origen = 'portal' AND i.id IS NULL
          AND c.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)${porSede("c.company_id")}
        ORDER BY c.created_at DESC
        LIMIT 5`,
      p,
    ),
  ]);

  const n = (r: any) => Number((r.rows as any[])[0]?.n) || 0;
  const nota = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10);
  const cal = (califTotal.rows as any[])[0] || {};

  return {
    egresos_mes: n(egresos),
    rma_ingresos_mes: n(ingresos),
    rma_despachos_mes: n(despachos),
    calificacion: {
      promedio: nota(cal.promedio),
      total: Number(cal.total) || 0,
      picking: { promedio: nota(cal.promedio_picking), total: Number(cal.total_picking) || 0 },
      despacho: { promedio: nota(cal.promedio_despacho), total: Number(cal.total_despacho) || 0 },
    },
    ranking_mercancia: (ranking.rows as any[]).map((r) => ({
      nombre: r.nombre,
      promedio: nota(r.promedio),
      calificaciones: Number(r.calificaciones) || 0,
      egresos: Number(r.egresos) || 0,
      picking: nota(r.promedio_picking),
      despacho: nota(r.promedio_despacho),
    })),
    rma_mas_7d: { total: n(mas7Count), items: mas7.rows as any[] },
    rma_por_despachar: { total: n(listosCount), items: listos.rows as any[] },
    rma_por_llegar: { total: n(porLlegarCount), items: porLlegar.rows as any[] },
  };
}
