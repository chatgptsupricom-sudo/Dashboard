import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { hayTablaProductos } from "@/lib/rma/items";
import { hayColumnaExterno } from "@/lib/rma/procedencia";
import { hayColumnasAprobacion } from "@/lib/rma/notaCredito";

/**
 * Métricas del Dashboard de RMA, en total y separadas por procedencia
 * (vendidos por Supricom / no vendidos por Supricom).
 *
 *  - delMes: casos que entraron este mes.
 *  - completadosMes: casos resueltos (reparado, nota de crédito, no procede)
 *    que llegaron a ese estado este mes, según su historial.
 *  - pendientesMes: los que entraron este mes y siguen sin resolver.
 *  - pendientes: todos los que siguen sin resolver, de cualquier mes.
 *  - noProcede: casos "no procesado" (el técnico dice que no se repara).
 *  - ncSolicitadas: solicitudes de nota de crédito enviadas al Super Admin
 *    (lib/rma/notaCredito.ts; el caso no cambia de estado al pedirla).
 *  - topProductos: los productos que más entran a RMA.
 */
const PENDIENTES = "('recibido','reingresado','nc_revision')";
const RESUELTOS = "('reparado','nota_credito','no_procesado')";
const INICIO_MES = "DATE_FORMAT(CURDATE(), '%Y-%m-01')";

type Metricas = {
  total: number;
  delMes: number;
  completadosMes: number;
  pendientesMes: number;
  pendientes: number;
  noProcede: number;
  ncSolicitadas: number;
  notaCredito: number;
  reparado: number;
};

const vacio = (): Metricas => ({
  total: 0,
  delMes: 0,
  completadosMes: 0,
  pendientesMes: 0,
  pendientes: 0,
  noProcede: 0,
  ncSolicitadas: 0,
  notaCredito: 0,
  reparado: 0,
});

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = parseInt(searchParams.get("company_id") || "", 10) || null;
    const filtroSede = companyId ? "AND c.company_id = ?" : "";
    const params = companyId ? [companyId] : [];

    // Sin la columna, todos los casos son de Supricom.
    const externo = (await hayColumnaExterno()) ? "c.producto_externo" : "0";

    const r = await query(
      `SELECT ${externo} AS externo,
              COUNT(*) AS total,
              SUM(c.created_at >= ${INICIO_MES}) AS delMes,
              SUM(c.status IN ${RESUELTOS} AND EXISTS (
                    SELECT 1 FROM rma_history h
                     WHERE h.case_id = c.id AND h.to_status = c.status AND h.created_at >= ${INICIO_MES}
                  )) AS completadosMes,
              SUM(c.status IN ${PENDIENTES} AND c.created_at >= ${INICIO_MES}) AS pendientesMes,
              SUM(c.status IN ${PENDIENTES}) AS pendientes,
              SUM(c.status = 'no_procesado') AS noProcede,
              SUM(c.status = 'nota_credito') AS notaCredito,
              SUM(c.status = 'reparado') AS reparado
         FROM rma_cases c
        WHERE 1=1 ${filtroSede}
        ${externo === "0" ? "" : `GROUP BY ${externo}`}`,
      params,
    );

    const porProcedencia = { supricom: vacio(), externo: vacio() };
    for (const fila of r.rows as any[]) {
      const destino = Number(fila.externo) === 1 ? porProcedencia.externo : porProcedencia.supricom;
      for (const k of Object.keys(destino) as (keyof Metricas)[]) destino[k] = Number(fila[k]) || 0;
    }
    // Solicitudes de nota de crédito pendientes (solo equipos de Supricom).
    try {
      if (await hayColumnasAprobacion()) {
        const nc = await query(
          `SELECT COUNT(*) AS n FROM rma_notas_credito nc JOIN rma_cases c ON c.id = nc.case_id
            WHERE nc.estado = 'pendiente' ${filtroSede}`,
          params,
        );
        porProcedencia.supricom.ncSolicitadas = Number((nc.rows as any[])[0]?.n) || 0;
      }
    } catch (e: any) {
      console.warn("rma_notas_credito no disponible:", e?.message);
    }

    const stats = vacio();
    for (const k of Object.keys(stats) as (keyof Metricas)[]) {
      stats[k] = porProcedencia.supricom[k] + porProcedencia.externo[k];
    }

    // Productos que más entran a RMA. Con envíos de varios productos se
    // cuenta cada producto; sin la tabla, el del caso.
    const conProductos = await hayTablaProductos();
    const nombre = conProductos
      ? "COALESCE(NULLIF(TRIM(i.model), ''), NULLIF(TRIM(i.hardware), ''), 'Sin modelo')"
      : "COALESCE(NULLIF(TRIM(c.model), ''), NULLIF(TRIM(c.hardware), ''), 'Sin modelo')";
    const top = await query(
      `SELECT ${nombre} AS producto,
              ${conProductos ? "MAX(i.brand)" : "MAX(c.brand)"} AS marca,
              COUNT(*) AS total,
              SUM(c.created_at >= ${INICIO_MES}) AS delMes,
              SUM(${externo} = 1) AS externos
         FROM ${conProductos ? "rma_case_items i JOIN rma_cases c ON c.id = i.case_id" : "rma_cases c"}
        WHERE 1=1 ${filtroSede}
        GROUP BY ${nombre}
        ORDER BY total DESC, delMes DESC
        LIMIT 10`,
      params,
    );

    return NextResponse.json({
      success: true,
      stats,
      porProcedencia,
      topProductos: (top.rows as any[]).map((t) => ({
        producto: t.producto,
        marca: t.marca || null,
        total: Number(t.total) || 0,
        delMes: Number(t.delMes) || 0,
        externos: Number(t.externos) || 0,
      })),
    });
  } catch (error: any) {
    console.error("Error fetching RMA stats:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
