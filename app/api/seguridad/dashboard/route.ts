import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    // El mostrador (#39) solo muestra los 3 contadores del dia y se abre desde
    // el telefono en el almacen. Pedirle las 14 consultas del dashboard para
    // pintar 3 numeros es lo que hace que tarde en 4G, asi que ese modo corta
    // por aqui. Vive en esta ruta y no en una nueva a proposito: cada ruta
    // nueva es un sitio mas donde olvidar el guard, que fue justo lo que paso
    // con /api/seguridad/almacenistas.
    if (new URL(request.url).searchParams.get("resumen") === "1") {
      const [ingresosHoyRes, despachosHoyRes, pendientesRes] = await Promise.all([
        query(
          "SELECT COUNT(*) AS total FROM seguridad_ingresos WHERE fecha_entrega = CURDATE()",
        ),
        query(
          "SELECT COUNT(*) AS total FROM seguridad_despachos WHERE fecha_despacho = CURDATE()",
        ),
        query(
          `SELECT COUNT(*) AS total
           FROM seguridad_ingresos i
           LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
           WHERE d.id IS NULL`,
        ),
      ]);

      const resumen = NextResponse.json({
        success: true,
        ingresos_hoy: Number(ingresosHoyRes.rows[0]?.total || 0),
        despachos_hoy: Number(despachosHoyRes.rows[0]?.total || 0),
        pendientes: Number(pendientesRes.rows[0]?.total || 0),
      });
      resumen.headers.set("Cache-Control", "private, max-age=60");
      return resumen;
    }

    const [
      ingresosHoyRes,
      ingresosAyerRes,
      despachosHoyRes,
      despachosAyerRes,
      enTallerRes,
      promedioCalRes,
      totalCalRes,
      ingresosPendientesCountRes,
      ingresosRecientesRes,
      despachosRecientesRes,
      ingresosPendientesRes,
      topAlmacenistasRes,
      ingresosSinDespachoRes,
      garantiasDenegadasRes,
    ] = await Promise.all([
      query(
        "SELECT COUNT(*) AS total FROM seguridad_ingresos WHERE fecha_entrega = CURDATE()",
      ),
      query(
        "SELECT COUNT(*) AS total FROM seguridad_ingresos WHERE fecha_entrega = CURDATE() - INTERVAL 1 DAY",
      ),
      query(
        "SELECT COUNT(*) AS total FROM seguridad_despachos WHERE fecha_despacho = CURDATE()",
      ),
      query(
        "SELECT COUNT(*) AS total FROM seguridad_despachos WHERE fecha_despacho = CURDATE() - INTERVAL 1 DAY",
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM seguridad_ingresos i
         LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
         WHERE d.id IS NULL AND i.fecha_entrega < CURDATE() - INTERVAL 7 DAY`,
      ),
      query(
        `SELECT AVG(calificacion) AS promedio
         FROM seguridad_calificaciones
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM seguridad_calificaciones
         WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM seguridad_ingresos i
         LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
         WHERE d.id IS NULL`,
      ),
      query(
        `SELECT * FROM seguridad_ingresos
         ORDER BY created_at DESC
         LIMIT 10`,
      ),
      query(
        `SELECT d.*, i.cliente_nombre AS cliente_nombre
         FROM seguridad_despachos d
         LEFT JOIN seguridad_ingresos i ON i.id = d.ingreso_id
         ORDER BY d.created_at DESC
         LIMIT 10`,
      ),
      query(
        // DATEDIFF explicito: el front pinta el badge "N dias en taller" y con
        // `SELECT i.*` ese campo no existia, asi que el badge salia vacio.
        `SELECT i.*, DATEDIFF(CURDATE(), i.fecha_entrega) AS dias_en_taller
         FROM seguridad_ingresos i
         LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
         WHERE d.id IS NULL
         ORDER BY i.fecha_entrega DESC
         LIMIT 10`,
      ),
      query(
        `SELECT
            c.almacenista_nombre AS nombre,
            AVG(c.calificacion) AS promedio,
            COUNT(*) AS calificaciones,
            (SELECT COUNT(*) FROM seguridad_ingresos
             WHERE recibido_por = c.almacenista_nombre
               AND fecha_entrega >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS ingresos_mes,
            (SELECT COUNT(*) FROM seguridad_despachos
             WHERE almacenista_nombre = c.almacenista_nombre
               AND fecha_despacho >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS despachos_mes
         FROM seguridad_calificaciones c
         WHERE c.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
         GROUP BY c.almacenista_nombre
         ORDER BY promedio DESC, calificaciones DESC
         LIMIT 10`,
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM seguridad_ingresos i
         LEFT JOIN seguridad_despachos d ON d.ingreso_id = i.id
         WHERE d.id IS NULL AND i.fecha_entrega < DATE_SUB(CURDATE(), INTERVAL 7 DAY)`,
      ),
      query(
        `SELECT COUNT(*) AS total
         FROM seguridad_ingresos
         WHERE falla_cubierta_garantia = 0
           AND fecha_entrega >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      ),
    ]);

    const ingresosHoy = Number(ingresosHoyRes.rows[0]?.total || 0);
    const ingresosAyer = Number(ingresosAyerRes.rows[0]?.total || 0);
    const despachosHoy = Number(despachosHoyRes.rows[0]?.total || 0);
    const despachosAyer = Number(despachosAyerRes.rows[0]?.total || 0);

    const promedioRaw = promedioCalRes.rows[0]?.promedio;
    const promedioCalificacion =
      promedioRaw === null || promedioRaw === undefined
        ? null
        : Math.round(Number(promedioRaw) * 10) / 10;

    const alertas: any[] = [];

    const ingresosSinDespacho = Number(ingresosSinDespachoRes.rows[0]?.total || 0);
    if (ingresosSinDespacho > 0) {
      alertas.push({
        tipo: "ingresos_sin_despacho",
        cantidad: ingresosSinDespacho,
        dias: 7,
        severidad: "warning",
        mensaje: `${ingresosSinDespacho} ingresos sin despacho por más de 7 días`,
      });
    }

    const garantiasDenegadas = Number(garantiasDenegadasRes.rows[0]?.total || 0);
    if (garantiasDenegadas > 5) {
      alertas.push({
        tipo: "garantias_denegadas",
        cantidad: garantiasDenegadas,
        dias: 30,
        severidad: "info",
        mensaje: `${garantiasDenegadas} ingresos con garantía denegada en los últimos 30 días`,
      });
    }

    const response = NextResponse.json({
      success: true,
      kpis: {
        ingresos_hoy: ingresosHoy,
        ingresos_hoy_delta: ingresosHoy - ingresosAyer,
        despachos_hoy: despachosHoy,
        despachos_hoy_delta: despachosHoy - despachosAyer,
        en_taller_mas_7d: Number(enTallerRes.rows[0]?.total || 0),
        promedio_calificacion: promedioCalificacion,
        total_calificaciones_mes: Number(totalCalRes.rows[0]?.total || 0),
        ingresos_pendientes_despacho: Number(
          ingresosPendientesCountRes.rows[0]?.total || 0,
        ),
      },
      ingresos_recientes: ingresosRecientesRes.rows,
      despachos_recientes: despachosRecientesRes.rows,
      ingresos_pendientes: ingresosPendientesRes.rows,
      top_almacenistas: topAlmacenistasRes.rows.map((r: any) => ({
        nombre: r.nombre,
        ingresos_mes: Number(r.ingresos_mes || 0),
        despachos_mes: Number(r.despachos_mes || 0),
        promedio:
          r.promedio === null || r.promedio === undefined
            ? null
            : Math.round(Number(r.promedio) * 10) / 10,
        calificaciones: Number(r.calificaciones || 0),
      })),
      alertas,
    });

    response.headers.set("Cache-Control", "private, max-age=300");
    return response;
  } catch (error: any) {
    console.error("Error cargando dashboard de seguridad:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
