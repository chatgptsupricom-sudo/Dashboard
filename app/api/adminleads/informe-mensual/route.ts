// GET /api/adminleads/informe-mensual
// Arma el informe KPI mensual de redes sociales (Meta Ads + CRM + Instagram).
//
// Cruza tres fuentes:
//  - Meta Ads   -> lib/campanas-meta (misma agregacion que el tab de Campanas)
//  - CRM MySQL  -> leads / sellers, periodo actual contra periodo anterior
//  - Instagram  -> lib/instagram (perfil y publicaciones hoy; Insights cuando
//                  Meta conceda instagram_manage_insights)
//
// POST guarda el cierre del mes en instagram_insights_monthly, que es lo que
// permite la comparacion mes a mes en los informes siguientes.

import { canalNormalizadoSql, CANALES_META } from "@/lib/canales";
import { getCampaignMetrics } from "@/lib/campanas-meta";
import { query } from "@/lib/db";
import {
  buildIgSnapshot,
  fetchIgAccountInsights,
  getIgAccounts,
  IG_INSIGHTS_PERMISSION,
  type IgAccountMetrics,
  type IgSnapshot,
} from "@/lib/instagram";
import { filterByCids, getAdAccounts } from "@/lib/meta";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

async function getUserCids(request: Request): Promise<number | null> {
  const cookieHeader = request.headers.get("cookie");
  const token = cookieHeader
    ?.split(";")
    .find((c) => c.trim().startsWith("token="))
    ?.split("=")[1];
  if (!token) return null;
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  return (payload.cids as number) ?? null;
}

function toDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function etiquetaPeriodo(desde: string, hasta: string): string {
  const d = toDate(desde);
  const h = toDate(hasta);
  const mismoMes =
    d.getUTCFullYear() === h.getUTCFullYear() && d.getUTCMonth() === h.getUTCMonth();
  if (mismoMes) {
    return `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}`.toUpperCase();
  }
  return `${desde} al ${hasta}`;
}

/** Ultimo dia del mes de `d`, en UTC. */
function finDeMes(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/**
 * Periodo de comparacion: si el rango es un mes calendario completo se compara
 * contra el mes anterior completo; si no, contra la ventana previa del mismo
 * largo. Asi "1-30 abril" se compara con marzo entero y no con 30 dias sueltos.
 */
function periodoAnterior(desde: string, hasta: string): { desde: string; hasta: string } {
  const d = toDate(desde);
  const h = toDate(hasta);

  const esMesCompleto =
    d.getUTCDate() === 1 &&
    h.getUTCFullYear() === d.getUTCFullYear() &&
    h.getUTCMonth() === d.getUTCMonth() &&
    h.getUTCDate() === finDeMes(d).getUTCDate();

  if (esMesCompleto) {
    const inicioPrev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    return { desde: toIso(inicioPrev), hasta: toIso(finDeMes(inicioPrev)) };
  }

  const dias = Math.round((h.getTime() - d.getTime()) / 86400000) + 1;
  const finPrev = new Date(d.getTime() - 86400000);
  const inicioPrev = new Date(finPrev.getTime() - (dias - 1) * 86400000);
  return { desde: toIso(inicioPrev), hasta: toIso(finPrev) };
}

function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null;
  return Math.round(((actual - anterior) / anterior) * 1000) / 10;
}

interface CrmStats {
  total_leads: number;
  ventas: number;
  recaudo: number;
  ticket_promedio: number;
  tasa_conversion: number;
  /** Leads que entraron en el periodo y terminaron en venta (cohorte). */
  ventas_del_mes: number;
}

const ENTRADA = "COALESCE(#.fecha_ingreso, #.created_at)";
const ES_VENTA =
  "#.status = 'CERRADO' AND #.motivo_cierre IN ('VENTA', 'GANADO')";

/**
 * Criterio de fechas del informe. Un lead pertenece al periodo por su fecha de
 * ENTRADA; una venta pertenece al periodo por su FECHA_VENTA. Son dos cohortes
 * distintas y no se pueden filtrar con un solo rango: una venta cerrada en
 * agosto sobre un lead que entro en julio es venta de agosto, pero no es lead
 * de agosto.
 *
 * Devuelve las dos expresiones SQL ya resueltas con el alias de tabla, mas los
 * parametros en el orden en que aparecen.
 */
function criteriosLeads(
  userCids: number,
  sede: string | null,
  desde: string,
  hasta: string,
  alias = "leads",
  soloCanalMeta = true,
) {
  const con = (tpl: string) => tpl.replace(/#/g, alias);
  const d = `${desde} 00:00:00`;
  const h = `${hasta} 23:59:59`;

  const entradaEnPeriodo = `${con(ENTRADA)} BETWEEN ? AND ?`;
  const ventaEnPeriodo = `${con(ES_VENTA)} AND ${alias}.fecha_venta IS NOT NULL AND ${alias}.fecha_venta BETWEEN ? AND ?`;
  const rangoParams = [d, h];

  const filtros: string[] = [];
  const filtroParams: any[] = [];

  if (soloCanalMeta) {
    // Normalizado: un lead cargado como "instagram" o "IG" tambien cuenta.
    filtros.push(
      `${canalNormalizadoSql(`${alias}.canal_origen`)} IN (${CANALES_META.map(() => "?").join(", ")})`,
    );
    filtroParams.push(...CANALES_META);
  }

  if (sede) {
    filtros.push(
      `${alias}.seller_id IN (SELECT id FROM sellers WHERE cids = ?)`,
    );
    filtroParams.push(parseInt(sede));
  } else if (userCids !== 7) {
    // `seller_id IN (...)` es NULL para leads sin vendedor asignado, y NULL no
    // es TRUE: sin el OR explicito esos leads desaparecian del informe.
    filtros.push(
      `(${alias}.seller_id IS NULL OR ${alias}.seller_id IN (SELECT id FROM sellers WHERE cids != 7))`,
    );
  }

  // El WHERE trae todo lo que toca el periodo por cualquiera de los dos lados;
  // el desglose por cohorte se hace despues con SUM(CASE WHEN ...).
  filtros.push(`((${entradaEnPeriodo}) OR (${ventaEnPeriodo}))`);
  const whereParams = [...filtroParams, ...rangoParams, ...rangoParams];
  const where = `WHERE ${filtros.join(" AND ")}`;

  return { entradaEnPeriodo, ventaEnPeriodo, esVenta: con(ES_VENTA), rangoParams, where, whereParams };
}

/**
 * Desglose por canal de origen SIN filtrar canal, con el mismo criterio de
 * fechas del informe. Sirve para conciliar contra el tab General (que cuenta
 * todos los canales) y para detectar valores de canal_origen que no entran en
 * CANALES_META por diferencias de texto.
 */
async function getCanalesBreakdown(
  userCids: number,
  sede: string | null,
  desde: string,
  hasta: string,
) {
  const c = criteriosLeads(userCids, sede, desde, hasta, "leads", false);
  const result: any = await query(
    `
      SELECT
        ${canalNormalizadoSql("leads.canal_origen")} as canal,
        SUM(CASE WHEN ${c.entradaEnPeriodo} THEN 1 ELSE 0 END) as leads,
        SUM(CASE WHEN ${c.ventaEnPeriodo} THEN 1 ELSE 0 END) as ventas,
        IFNULL(SUM(CASE WHEN ${c.ventaEnPeriodo} THEN leads.monto_cerrado_usd ELSE 0 END), 0) as recaudo
      FROM leads
      ${c.where}
      GROUP BY canal
      HAVING leads > 0 OR ventas > 0
      ORDER BY leads DESC, recaudo DESC
    `,
    [...c.rangoParams, ...c.rangoParams, ...c.rangoParams, ...c.whereParams],
  );

  return (result.rows || []).map((r: any) => ({
    canal: r.canal,
    leads: parseInt(r.leads) || 0,
    ventas: parseInt(r.ventas) || 0,
    recaudo: parseFloat(r.recaudo) || 0,
    cuenta_como_meta: CANALES_META.includes(r.canal),
  }));
}

async function getCrmStats(
  userCids: number,
  sede: string | null,
  desde: string,
  hasta: string,
): Promise<CrmStats> {
  const c = criteriosLeads(userCids, sede, desde, hasta, "leads");
  const result: any = await query(
    `
      SELECT
        SUM(CASE WHEN ${c.entradaEnPeriodo} THEN 1 ELSE 0 END) as total_leads,
        SUM(CASE WHEN ${c.ventaEnPeriodo} THEN 1 ELSE 0 END) as ventas,
        SUM(CASE WHEN ${c.entradaEnPeriodo} AND ${c.esVenta} THEN 1 ELSE 0 END) as ventas_del_mes,
        IFNULL(SUM(CASE WHEN ${c.ventaEnPeriodo} THEN leads.monto_cerrado_usd ELSE 0 END), 0) as recaudo
      FROM leads
      ${c.where}
    `,
    [
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.whereParams,
    ],
  );
  const row = result.rows?.[0] || {};
  const total_leads = parseInt(row.total_leads) || 0;
  const ventas = parseInt(row.ventas) || 0;
  const ventas_del_mes = parseInt(row.ventas_del_mes) || 0;
  const recaudo = parseFloat(row.recaudo) || 0;

  return {
    total_leads,
    ventas,
    ventas_del_mes,
    recaudo,
    ticket_promedio: ventas > 0 ? Math.round((recaudo / ventas) * 100) / 100 : 0,
    // Conversion de cohorte: de los leads que entraron, cuantos se vendieron.
    // No se usa `ventas` porque incluye cierres de leads de meses anteriores.
    tasa_conversion:
      total_leads > 0
        ? Math.round((ventas_del_mes / total_leads) * 1000) / 10
        : 0,
  };
}

async function getLeadsPorVendedor(
  userCids: number,
  sede: string | null,
  desde: string,
  hasta: string,
) {
  const c = criteriosLeads(userCids, sede, desde, hasta, "l");
  const result: any = await query(
    `
      SELECT
        COALESCE(NULLIF(s.name, ''), 'Sin asignar') as vendedor,
        SUM(CASE WHEN ${c.entradaEnPeriodo} THEN 1 ELSE 0 END) as total,
        SUM(CASE WHEN ${c.ventaEnPeriodo} THEN 1 ELSE 0 END) as ventas,
        SUM(CASE WHEN ${c.entradaEnPeriodo} AND l.status = 'CERRADO' AND l.motivo_cierre = 'ABANDONO' THEN 1 ELSE 0 END) as perdidos,
        SUM(CASE WHEN ${c.entradaEnPeriodo} AND l.status != 'CERRADO' THEN 1 ELSE 0 END) as activos,
        IFNULL(SUM(CASE WHEN ${c.ventaEnPeriodo} THEN l.monto_cerrado_usd ELSE 0 END), 0) as recaudo
      FROM leads l
      LEFT JOIN sellers s ON s.id = l.seller_id
      ${c.where}
      GROUP BY vendedor
      HAVING total > 0 OR ventas > 0
      ORDER BY recaudo DESC, total DESC
    `,
    [
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.rangoParams,
      ...c.whereParams,
    ],
  );

  return (result.rows || []).map((r: any) => {
    const total = parseInt(r.total) || 0;
    const ventas = parseInt(r.ventas) || 0;
    return {
      vendedor: r.vendedor,
      total,
      ventas,
      perdidos: parseInt(r.perdidos) || 0,
      activos: parseInt(r.activos) || 0,
      recaudo: parseFloat(r.recaudo) || 0,
      tasa_cierre: total > 0 ? Math.round((ventas / total) * 1000) / 10 : 0,
    };
  });
}

async function getTopClientes(
  userCids: number,
  sede: string | null,
  desde: string,
  hasta: string,
) {
  const c = criteriosLeads(userCids, sede, desde, hasta, "l");
  // Solo ventas del periodo: aca la cohorte relevante es fecha_venta.
  const result: any = await query(
    `
      SELECT
        COALESCE(NULLIF(l.name, ''), NULLIF(l.nombre_contacto, ''), 'Sin nombre') as cliente,
        s.name as vendedor,
        IFNULL(SUM(l.monto_cerrado_usd), 0) as monto
      FROM leads l
      LEFT JOIN sellers s ON s.id = l.seller_id
      ${c.where}
        AND (${c.ventaEnPeriodo})
      GROUP BY cliente, s.name
      ORDER BY monto DESC
      LIMIT 10
    `,
    [...c.whereParams, ...c.rangoParams],
  );

  return (result.rows || []).map((r: any) => ({
    cliente: r.cliente,
    vendedor: r.vendedor || "Sin asignar",
    monto: parseFloat(r.monto) || 0,
  }));
}

/** Snapshot guardado del mes indicado (YYYY-MM), si existe. */
async function getSnapshotMes(igUserId: string, periodo: string) {
  try {
    const result: any = await query(
      `SELECT * FROM instagram_insights_monthly WHERE ig_user_id = ? AND periodo = ? LIMIT 1`,
      [igUserId, periodo],
    );
    return result.rows?.[0] || null;
  } catch {
    console.warn("Tabla instagram_insights_monthly no disponible aún");
    return null;
  }
}

function construirDiagnostico(datos: {
  actual: CrmStats;
  anterior: CrmStats;
  inversion: number;
  roas: number;
  topClientes: Array<{ cliente: string; monto: number }>;
  porVendedor: Array<{ vendedor: string; total: number }>;
  contenido: IgSnapshot["contenido"];
  igDisponible: boolean;
}) {
  const logros: string[] = [];
  const atencion: string[] = [];
  const { actual, anterior, inversion, roas, topClientes, porVendedor } = datos;

  const varRecaudo = variacion(actual.recaudo, anterior.recaudo);
  if (actual.recaudo > 0) {
    logros.push(
      varRecaudo !== null
        ? `Facturación de $${actual.recaudo.toLocaleString("es-VE", { minimumFractionDigits: 2 })} (${varRecaudo >= 0 ? "+" : ""}${varRecaudo}% vs. período anterior), con ticket promedio de $${actual.ticket_promedio.toLocaleString("es-VE", { minimumFractionDigits: 2 })}.`
        : `Facturación de $${actual.recaudo.toLocaleString("es-VE", { minimumFractionDigits: 2 })} con ticket promedio de $${actual.ticket_promedio.toLocaleString("es-VE", { minimumFractionDigits: 2 })}.`,
    );
  }
  if (actual.tasa_conversion > 0) {
    logros.push(
      `Tasa de conversión de ${actual.tasa_conversion}% — ${actual.ventas} de ${actual.total_leads} leads concretados.`,
    );
  }
  if (inversion > 0 && roas > 0) {
    logros.push(
      `ROAS de ${roas.toFixed(1)}x: por cada $1 invertido en pauta se generaron $${roas.toFixed(2)} en ventas.`,
    );
  }

  const totalRecaudo = actual.recaudo;
  const top2 = topClientes.slice(0, 2).reduce((s, c) => s + c.monto, 0);
  if (totalRecaudo > 0 && top2 / totalRecaudo > 0.5) {
    atencion.push(
      `Concentración de montos: los 2 clientes principales representan ${Math.round((top2 / totalRecaudo) * 1000) / 10}% de la facturación. Riesgo de dependencia.`,
    );
  }

  const totalLeads = porVendedor.reduce((s, v) => s + v.total, 0);
  const top2Vendedores = porVendedor
    .slice()
    .sort((a, b) => b.total - a.total)
    .slice(0, 2);
  const leadsTop2 = top2Vendedores.reduce((s, v) => s + v.total, 0);
  if (totalLeads > 0 && porVendedor.length > 2 && leadsTop2 / totalLeads > 0.6) {
    atencion.push(
      `${top2Vendedores.map((v) => v.vendedor).join(" + ")} concentran ${Math.round((leadsTop2 / totalLeads) * 1000) / 10}% de los leads. Oportunidad: activar al resto del equipo.`,
    );
  }

  if (varRecaudo !== null && varRecaudo < 0) {
    atencion.push(
      `La facturación cayó ${Math.abs(varRecaudo)}% respecto al período anterior.`,
    );
  }

  if (datos.contenido.available) {
    const c = datos.contenido.data;
    if (c.total_publicaciones > 0) {
      logros.push(
        `${c.total_publicaciones} publicaciones en el período (${c.posts_por_dia}/día), con ${c.interacciones_totales.toLocaleString("es-VE")} interacciones acumuladas.`,
      );
      const feed = c.por_formato.find((f) => f.formato.startsWith("Publicaciones"));
      const reels = c.por_formato.find((f) => f.formato === "Reels");
      if (feed && reels && feed.porcentaje_interacciones > reels.porcentaje_interacciones) {
        logros.push(
          `El Feed concentra ${feed.porcentaje_interacciones}% de las interacciones con ${feed.porcentaje}% de las publicaciones — es el formato motor.`,
        );
      }
    } else {
      atencion.push("No se registraron publicaciones de Instagram en el período.");
    }
  }

  if (!datos.igDisponible) {
    atencion.push(
      `Las métricas de alcance, visualizaciones y demografía no se pudieron traer de Instagram: falta el permiso ${IG_INSIGHTS_PERMISSION} en la app de Meta.`,
    );
  }

  return { logros, atencion };
}

export async function GET(request: Request) {
  try {
    const userCids = await getUserCids(request);
    if (userCids === null) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const sede = searchParams.get("sede");

    const hoy = new Date();
    const inicioMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1));
    const desde = DATE_REGEX.test(searchParams.get("fecha_inicio") || "")
      ? searchParams.get("fecha_inicio")!
      : toIso(inicioMes);
    const hasta = DATE_REGEX.test(searchParams.get("fecha_fin") || "")
      ? searchParams.get("fecha_fin")!
      : toIso(finDeMes(inicioMes));

    if (toDate(desde) > toDate(hasta)) {
      return NextResponse.json(
        { error: "La fecha de inicio es posterior a la fecha final" },
        { status: 400 },
      );
    }

    const prev = periodoAnterior(desde, hasta);
    const dias =
      Math.round((toDate(hasta).getTime() - toDate(desde).getTime()) / 86400000) + 1;

    const adAccounts = filterByCids(getAdAccounts(), userCids);

    const [campanasActual, campanasPrev, crmActual, crmPrev, porVendedor, topClientes] =
      await Promise.all([
        getCampaignMetrics({ userCids, sede, fechaInicio: desde, fechaFin: hasta }),
        getCampaignMetrics({
          userCids,
          sede,
          fechaInicio: prev.desde,
          fechaFin: prev.hasta,
        }),
        getCrmStats(userCids, sede, desde, hasta),
        getCrmStats(userCids, sede, prev.desde, prev.hasta),
        getLeadsPorVendedor(userCids, sede, desde, hasta),
        getTopClientes(userCids, sede, desde, hasta),
      ]);

    const canales = await getCanalesBreakdown(userCids, sede, desde, hasta);
    const totalesTodosCanales = canales.reduce(
      (acc, c) => ({
        leads: acc.leads + c.leads,
        ventas: acc.ventas + c.ventas,
        recaudo: acc.recaudo + c.recaudo,
      }),
      { leads: 0, ventas: 0, recaudo: 0 },
    );

    // Instagram: se toma la cuenta del pais que corresponde al usuario.
    // Los Insights de cuenta si aceptan rangos historicos, asi que el mes de
    // comparacion se pide a la API en vez de depender del snapshot guardado.
    let igSnapshot: IgSnapshot | null = null;
    let igMetricasPrevApi: IgAccountMetrics | null = null;
    let igError: string | null = null;
    try {
      const igAccounts = await getIgAccounts(adAccounts);
      if (igAccounts.length > 0) {
        const cuenta = igAccounts[0];
        const [actual, previo] = await Promise.all([
          buildIgSnapshot(cuenta, desde, hasta),
          fetchIgAccountInsights(cuenta.ig_user_id, prev.desde, prev.hasta),
        ]);
        igSnapshot = actual;
        if (previo.available) igMetricasPrevApi = previo.data;
      } else {
        igError = "No hay cuenta de Instagram Business vinculada a la cuenta publicitaria";
      }
    } catch (err: any) {
      igError = err?.message || "Error consultando Instagram";
    }

    const mesActualKey = desde.slice(0, 7);
    const mesPrevKey = prev.desde.slice(0, 7);
    const snapActual = igSnapshot?.cuenta
      ? await getSnapshotMes(igSnapshot.cuenta.ig_user_id, mesActualKey)
      : null;
    const snapPrev = igSnapshot?.cuenta
      ? await getSnapshotMes(igSnapshot.cuenta.ig_user_id, mesPrevKey)
      : null;

    // Si la API no entrega Insights, se usa el snapshot guardado del mes.
    const igMetricas = igSnapshot?.metricas.available
      ? igSnapshot.metricas.data
      : snapActual
        ? {
            views: parseInt(snapActual.views) || 0,
            reach: parseInt(snapActual.reach) || 0,
            profile_views: parseInt(snapActual.profile_views) || 0,
            website_clicks: parseInt(snapActual.website_clicks) || 0,
            total_interactions: parseInt(snapActual.total_interactions) || 0,
            accounts_engaged: parseInt(snapActual.accounts_engaged) || 0,
          }
        : null;

    // Prioridad: lo que responde la API para el mes anterior; si no, el snapshot.
    const igMetricasPrev =
      igMetricasPrevApi ||
      (snapPrev
        ? {
            views: parseInt(snapPrev.views) || 0,
            reach: parseInt(snapPrev.reach) || 0,
            profile_views: parseInt(snapPrev.profile_views) || 0,
            website_clicks: parseInt(snapPrev.website_clicks) || 0,
            total_interactions: parseInt(snapPrev.total_interactions) || 0,
            accounts_engaged: parseInt(snapPrev.accounts_engaged) || 0,
          }
        : null);

    const seguidoresActual = igSnapshot?.perfil?.followers_count || 0;
    const seguidoresPrev = snapPrev ? parseInt(snapPrev.followers_count) || 0 : 0;

    // Seguidores ganados: `follower_count` solo cubre los ultimos 30 dias, asi
    // que para meses viejos se cae a la diferencia contra el snapshot.
    const ganadosApi = igSnapshot?.seguidores_ganados;
    const seguidoresGanados =
      ganadosApi?.available && ganadosApi.data !== null
        ? ganadosApi.data
        : seguidoresPrev > 0
          ? seguidoresActual - seguidoresPrev
          : null;

    const metricaIg = (
      etiqueta: string,
      key: keyof NonNullable<typeof igMetricas>,
      fuente = "Instagram Insights",
    ) => ({
      metrica: etiqueta,
      anterior: igMetricasPrev ? igMetricasPrev[key] : null,
      actual: igMetricas ? igMetricas[key] : null,
      variacion_pct:
        igMetricas && igMetricasPrev
          ? variacion(igMetricas[key], igMetricasPrev[key])
          : null,
      fuente,
      disponible: igMetricas !== null,
    });

    const general = [
      metricaIg("Visualizaciones totales", "views"),
      metricaIg("Alcance", "reach"),
      metricaIg("Interacciones con el contenido", "total_interactions"),
      metricaIg("Visitas al perfil", "profile_views"),
      metricaIg("Clics en enlace externo", "website_clicks"),
      {
        metrica: "Seguidores totales",
        anterior: seguidoresPrev || null,
        actual: seguidoresActual || null,
        variacion_pct:
          seguidoresPrev > 0 ? variacion(seguidoresActual, seguidoresPrev) : null,
        fuente: "Instagram",
        disponible: seguidoresActual > 0,
      },
      {
        metrica: "Leads CRM (canal Meta)",
        anterior: crmPrev.total_leads,
        actual: crmActual.total_leads,
        variacion_pct: variacion(crmActual.total_leads, crmPrev.total_leads),
        fuente: "CRM Interno",
        disponible: true,
      },
      {
        metrica: "Leads concretados",
        anterior: crmPrev.ventas,
        actual: crmActual.ventas,
        variacion_pct: variacion(crmActual.ventas, crmPrev.ventas),
        fuente: "CRM Interno",
        disponible: true,
      },
      {
        metrica: "Ventas cerradas ($)",
        anterior: crmPrev.recaudo,
        actual: crmActual.recaudo,
        variacion_pct: variacion(crmActual.recaudo, crmPrev.recaudo),
        fuente: "CRM Interno",
        disponible: true,
        moneda: true,
      },
    ];

    const inversion = campanasActual.summary.total_spend;
    const inversionPrev = campanasPrev.summary.total_spend;
    const roas = inversion > 0 ? crmActual.recaudo / inversion : 0;
    const totalCalificados = campanasActual.summary.total_calificados;
    const totalNoCalificados = campanasActual.summary.total_no_calificados;
    const totalConversaciones = totalCalificados + totalNoCalificados;

    // Campanas destacadas: solo se consideran las que efectivamente gastaron.
    const conGasto = campanasActual.campaigns.filter((c) => c.spend_usd > 0);
    const destacadas = {
      mayor_recaudo:
        conGasto.filter((c) => c.recaudo_usd > 0).sort((a, b) => b.recaudo_usd - a.recaudo_usd)[0] || null,
      mejor_calificacion:
        conGasto
          .filter((c) => c.calificados + c.no_calificados > 0)
          .sort((a, b) => {
            const ta = a.calificados / (a.calificados + a.no_calificados);
            const tb = b.calificados / (b.calificados + b.no_calificados);
            return tb - ta;
          })[0] || null,
      mejor_cpl:
        conGasto
          .filter((c) => c.costo_por_lead_calificado > 0)
          .sort((a, b) => a.costo_por_lead_calificado - b.costo_por_lead_calificado)[0] ||
        null,
    };

    const recaudoTotal = crmActual.recaudo;
    const top2 = topClientes.slice(0, 2).reduce((s, c) => s + c.monto, 0);

    const diagnostico = construirDiagnostico({
      actual: crmActual,
      anterior: crmPrev,
      inversion,
      roas,
      topClientes,
      porVendedor,
      contenido:
        igSnapshot?.contenido ||
        ({ available: false, reason: igError, data: { total_publicaciones: 0, posts_por_dia: 0, por_formato: [], interacciones_totales: 0 } } as IgSnapshot["contenido"]),
      igDisponible: igMetricas !== null,
    });

    return NextResponse.json({
      periodo: {
        desde,
        hasta,
        dias,
        etiqueta: etiquetaPeriodo(desde, hasta),
        mes_key: mesActualKey,
      },
      comparativo: {
        desde: prev.desde,
        hasta: prev.hasta,
        etiqueta: etiquetaPeriodo(prev.desde, prev.hasta),
        mes_key: mesPrevKey,
        con_datos: snapPrev !== null || crmPrev.total_leads > 0,
      },
      canal: {
        username: igSnapshot?.cuenta?.username || null,
        pais: igSnapshot?.cuenta?.pais || (userCids === 7 ? "Panama" : "Venezuela"),
        seguidores: seguidoresActual || null,
        seguidores_anterior: seguidoresPrev || null,
        seguidores_ganados: seguidoresGanados,
        seguidores_ganados_origen: ganadosApi?.available
          ? "api"
          : seguidoresPrev > 0
            ? "snapshot"
            : null,
        seguidores_ganados_motivo: ganadosApi?.available
          ? null
          : ganadosApi?.reason || null,
        publicaciones_totales: igSnapshot?.perfil?.media_count || null,
      },
      general,
      instagram: {
        insights_disponibles: igSnapshot?.metricas.available ?? false,
        motivo: igSnapshot?.metricas.reason || igError,
        permiso_requerido: IG_INSIGHTS_PERMISSION,
        origen_metricas: igSnapshot?.metricas.available
          ? "api"
          : snapActual
            ? "snapshot"
            : null,
        metricas: igMetricas,
        demografia: igSnapshot?.demografia.available
          ? igSnapshot.demografia.data
          : snapActual?.demografia
            ? typeof snapActual.demografia === "string"
              ? JSON.parse(snapActual.demografia)
              : snapActual.demografia
            : null,
        demografia_motivo: igSnapshot?.demografia.reason || null,
        contenido: igSnapshot?.contenido.data || null,
        contenido_disponible: igSnapshot?.contenido.available ?? false,
        contenido_motivo: igSnapshot?.contenido.reason || igError,
      },
      leads: {
        total: crmActual.total_leads,
        ventas: crmActual.ventas,
        recaudo: crmActual.recaudo,
        ticket_promedio: crmActual.ticket_promedio,
        tasa_conversion: crmActual.tasa_conversion,
        ventas_del_mes: crmActual.ventas_del_mes,
        calificados: totalCalificados,
        no_calificados: totalNoCalificados,
        tasa_calificacion:
          totalConversaciones > 0
            ? Math.round((totalCalificados / totalConversaciones) * 1000) / 10
            : null,
        por_vendedor: porVendedor,
        // Conciliacion contra el tab General, que no filtra por canal.
        por_canal: canales,
        todos_los_canales: {
          leads: totalesTodosCanales.leads,
          ventas: totalesTodosCanales.ventas,
          recaudo: Math.round(totalesTodosCanales.recaudo * 100) / 100,
        },
        canales_meta: CANALES_META,
      },
      inversion: {
        total: Math.round(inversion * 100) / 100,
        anterior: Math.round(inversionPrev * 100) / 100,
        variacion_pct: variacion(inversion, inversionPrev),
        costo_por_lead:
          crmActual.total_leads > 0
            ? Math.round((inversion / crmActual.total_leads) * 100) / 100
            : 0,
        costo_por_lead_calificado: campanasActual.summary.costo_por_lead_calificado,
        costo_por_venta:
          crmActual.ventas > 0
            ? Math.round((inversion / crmActual.ventas) * 100) / 100
            : 0,
        roas: Math.round(roas * 100) / 100,
        roi_pct: campanasActual.summary.roi_global,
      },
      campanas: campanasActual.campaigns,
      destacadas,
      pipeline: {
        top_clientes: topClientes,
        concentracion_top2_pct:
          recaudoTotal > 0 ? Math.round((top2 / recaudoTotal) * 1000) / 10 : 0,
        total_ventas: crmActual.ventas,
        total_recaudo: recaudoTotal,
        vendedores_activos: porVendedor.length,
      },
      diagnostico,
      fuentes: [
        "Meta Marketing API (campañas y pauta)",
        igSnapshot?.metricas.available
          ? "Instagram Insights API"
          : "Instagram Graph API (perfil y publicaciones)",
        "CRM interno — tabla leads",
      ],
    });
  } catch (error: any) {
    console.error("Error generando informe mensual:", error);
    return NextResponse.json(
      { error: "Error generando el informe", detail: error?.message || String(error) },
      { status: 500 },
    );
  }
}

/**
 * Guarda el cierre del mes en instagram_insights_monthly.
 * Sin cuerpo: sincroniza lo que entregue la API. Con cuerpo: carga manual de las
 * metricas que hoy la app de Meta no puede leer (origen = 'manual').
 */
export async function POST(request: Request) {
  try {
    const userCids = await getUserCids(request);
    if (userCids === null) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const periodo: string = body.periodo || new Date().toISOString().slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(periodo)) {
      return NextResponse.json(
        { error: "periodo debe tener formato YYYY-MM" },
        { status: 400 },
      );
    }

    const [anio, mes] = periodo.split("-").map(Number);
    const desde = toIso(new Date(Date.UTC(anio, mes - 1, 1)));
    const hasta = toIso(new Date(Date.UTC(anio, mes, 0)));

    const adAccounts = filterByCids(getAdAccounts(), userCids);
    const igAccounts = await getIgAccounts(adAccounts);
    if (igAccounts.length === 0) {
      return NextResponse.json(
        { error: "No hay cuenta de Instagram vinculada" },
        { status: 400 },
      );
    }

    const cuenta = igAccounts[0];
    const snapshot = await buildIgSnapshot(cuenta, desde, hasta);

    const manual = body.metricas || null;
    const api = snapshot.metricas.available ? snapshot.metricas.data : null;
    const fuente = manual || api;

    if (!fuente) {
      return NextResponse.json(
        {
          error: `Sin métricas que guardar: la API requiere el permiso ${IG_INSIGHTS_PERMISSION} y no se enviaron valores manuales`,
        },
        { status: 422 },
      );
    }

    const prevMes = toIso(new Date(Date.UTC(anio, mes - 2, 1))).slice(0, 7);
    const snapPrev = await getSnapshotMes(cuenta.ig_user_id, prevMes);
    const seguidores = snapshot.perfil?.followers_count || 0;
    const ganados = snapPrev
      ? seguidores - (parseInt(snapPrev.followers_count) || 0)
      : 0;

    await query(
      `
      INSERT INTO instagram_insights_monthly
        (ig_user_id, username, pais, periodo, views, reach, profile_views,
         website_clicks, total_interactions, accounts_engaged, followers_count,
         followers_gained, publicaciones, demografia, origen)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        views = VALUES(views), reach = VALUES(reach),
        profile_views = VALUES(profile_views), website_clicks = VALUES(website_clicks),
        total_interactions = VALUES(total_interactions),
        accounts_engaged = VALUES(accounts_engaged),
        followers_count = VALUES(followers_count),
        followers_gained = VALUES(followers_gained),
        publicaciones = VALUES(publicaciones),
        demografia = VALUES(demografia),
        origen = VALUES(origen)
      `,
      [
        cuenta.ig_user_id,
        cuenta.username || snapshot.perfil?.username || null,
        cuenta.pais,
        periodo,
        parseInt(fuente.views) || 0,
        parseInt(fuente.reach) || 0,
        parseInt(fuente.profile_views) || 0,
        parseInt(fuente.website_clicks) || 0,
        parseInt(fuente.total_interactions) || 0,
        parseInt(fuente.accounts_engaged) || 0,
        seguidores,
        ganados,
        snapshot.contenido.data.total_publicaciones,
        snapshot.demografia.available
          ? JSON.stringify(snapshot.demografia.data)
          : body.demografia
            ? JSON.stringify(body.demografia)
            : null,
        manual ? "manual" : "api",
      ],
    );

    return NextResponse.json({
      ok: true,
      periodo,
      origen: manual ? "manual" : "api",
      cuenta: cuenta.username,
    });
  } catch (error: any) {
    console.error("Error guardando snapshot de Instagram:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}
