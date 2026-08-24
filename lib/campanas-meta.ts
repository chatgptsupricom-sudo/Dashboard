// lib/campanas-meta.ts
// Agregacion de campanas de Meta Ads cruzada con leads del CRM y calificacion
// de conversaciones. Extraido de app/api/adminleads/meta-campaigns para que el
// tab de Campanas Meta y el informe mensual compartan exactamente los mismos
// numeros (inversion, CPL, ROI) en vez de recalcularlos por separado.

import { query } from "@/lib/db";
import {
  filterByCids,
  getAdAccounts,
  syncAllCampaigns,
  type MetaAdAccount,
  type NormalizedCampaign,
} from "@/lib/meta";

export interface CampaignAggregate {
  campaign_name: string;
  pais: string;
  spend_usd: number;
  impressions: number;
  clicks: number;
  leads_from_ads: number;
  total_leads: number;
  ventas_cerradas: number;
  recaudo_usd: number;
  calificados: number;
  no_calificados: number;
  costo_por_lead: number;
  costo_por_lead_calificado: number;
  roi: number;
}

export interface CampaignSummary {
  total_spend: number;
  total_leads: number;
  total_calificados: number;
  total_no_calificados: number;
  total_ventas: number;
  recaudo_total: number;
  costo_por_lead_calificado: number;
  roi_global: number;
}

export interface CampaignMetricsParams {
  userCids: number;
  sede?: string | null;
  fechaInicio?: string | null;
  fechaFin?: string | null;
}

export interface CampaignMetricsResult {
  campaigns: CampaignAggregate[];
  summary: CampaignSummary;
  accounts: MetaAdAccount[];
}

export async function getCampaignMetrics({
  userCids,
  sede,
  fechaInicio,
  fechaFin,
}: CampaignMetricsParams): Promise<CampaignMetricsResult> {
  const accounts = filterByCids(getAdAccounts(), userCids);

  let metaCampaigns: NormalizedCampaign[] = [];
  try {
    const metaFechaInicio = fechaInicio || "2026-01-01";
    const metaFechaFin = fechaFin || new Date().toISOString().slice(0, 10);
    metaCampaigns = await syncAllCampaigns(
      metaFechaInicio,
      metaFechaFin,
      accounts.length > 0 ? accounts : undefined,
    );
  } catch (err) {
    console.error("Error fetching Meta campaigns:", err);
  }

  // Criterio de fechas: un lead cuenta como "lead del periodo" por su fecha de
  // entrada, y como "venta del periodo" por su fecha_venta. Son dos cohortes
  // distintas: una venta cerrada en agosto de un lead que entro en julio suma
  // a las ventas de agosto, no a los leads de agosto. Antes se filtraba todo
  // con COALESCE(fecha_venta, fecha_ingreso, created_at), que mezclaba ambas.
  const leadConditions: string[] = [];
  const leadParams: any[] = [];

  leadConditions.push(
    "canal_origen IN ('Facebook Ads', 'Instagram', 'Meta Ads')",
  );
  leadConditions.push("campana IS NOT NULL AND campana != ''");

  if (sede) {
    leadConditions.push("seller_id IN (SELECT id FROM sellers WHERE cids = ?)");
    leadParams.push(parseInt(sede));
  } else if (userCids !== 7) {
    // NULL IN (...) no es TRUE: sin el OR, los leads sin vendedor asignado
    // quedaban fuera de las metricas de campanas.
    leadConditions.push(
      "(seller_id IS NULL OR seller_id IN (SELECT id FROM sellers WHERE cids != 7))",
    );
  }

  const desde = fechaInicio ? `${fechaInicio} 00:00:00` : null;
  const hasta = fechaFin ? `${fechaFin} 23:59:59` : null;

  const ENTRADA = "COALESCE(fecha_ingreso, created_at)";
  const ES_VENTA =
    "status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO')";

  // Condiciones reutilizables + sus parametros, en el orden en que se usan.
  const rango = (expr: string) =>
    desde && hasta ? `${expr} BETWEEN ? AND ?` : "1=1";
  const rangoParams = desde && hasta ? [desde, hasta] : [];

  const entradaEnPeriodo = rango(ENTRADA);
  const ventaEnPeriodo = `${ES_VENTA} AND fecha_venta IS NOT NULL AND ${rango("fecha_venta")}`;

  if (desde && hasta) {
    leadConditions.push(`((${entradaEnPeriodo}) OR (${ventaEnPeriodo}))`);
    leadParams.push(...rangoParams, ...rangoParams);
  }

  const leadWhere =
    leadConditions.length > 0 ? `WHERE ${leadConditions.join(" AND ")}` : "";

  const leadsByCampaign: any = await query(
    `
      SELECT
        campana,
        SUM(CASE WHEN ${entradaEnPeriodo} THEN 1 ELSE 0 END) as total_leads,
        SUM(CASE WHEN ${ventaEnPeriodo} THEN 1 ELSE 0 END) as ventas_cerradas,
        IFNULL(SUM(CASE WHEN ${ventaEnPeriodo} THEN monto_cerrado_usd ELSE 0 END), 0) as recaudo_usd
      FROM leads
      ${leadWhere}
      GROUP BY campana
      HAVING total_leads > 0 OR ventas_cerradas > 0
    `,
    [...rangoParams, ...rangoParams, ...rangoParams, ...leadParams],
  );

  const convConditions: string[] = [];
  const convParams: any[] = [];

  convConditions.push("canal = 'Instagram'");

  if (userCids === 7) {
    convConditions.push("pais IN ('Panama', 'PA')");
  } else {
    convConditions.push("pais IN ('Venezuela', 'VE')");
  }

  if (fechaInicio) {
    convConditions.push("created_at >= ?");
    convParams.push(`${fechaInicio} 00:00:00`);
  }
  if (fechaFin) {
    convConditions.push("created_at <= ?");
    convParams.push(`${fechaFin} 23:59:59`);
  }

  const convWhere =
    convConditions.length > 0 ? `WHERE ${convConditions.join(" AND ")}` : "";

  let qualificationData: any[] = [];
  let totalQualificationCounts: any = {
    total_calificados: 0,
    total_no_calificados: 0,
  };
  try {
    const result: any = await query(
      `
        SELECT
          campana,
          pais,
          COUNT(*) as total_conversaciones,
          SUM(CASE WHEN es_calificado = 'Calificado' THEN 1 ELSE 0 END) as calificados,
          SUM(CASE WHEN es_calificado = 'No Calificado' THEN 1 ELSE 0 END) as no_calificados
        FROM conversaciones
        ${convWhere}
        GROUP BY campana, pais
      `,
      convParams,
    );
    qualificationData = result.rows || [];

    const countsResult: any = await query(
      `
        SELECT
          SUM(CASE WHEN es_calificado = 'Calificado' THEN 1 ELSE 0 END) as total_calificados,
          SUM(CASE WHEN es_calificado = 'No Calificado' THEN 1 ELSE 0 END) as total_no_calificados
        FROM conversaciones
        ${convWhere}
      `,
      convParams,
    );
    totalQualificationCounts =
      countsResult.rows?.[0] || totalQualificationCounts;
  } catch {
    console.warn("Tabla conversaciones no disponible aún");
  }

  const campaignMap = new Map<
    string,
    Omit<
      CampaignAggregate,
      "costo_por_lead" | "costo_por_lead_calificado" | "roi"
    >
  >();

  for (const mc of metaCampaigns) {
    campaignMap.set(mc.campaign_name, {
      campaign_name: mc.campaign_name,
      pais: mc.pais,
      spend_usd: mc.spend_usd,
      impressions: mc.impressions,
      clicks: mc.clicks,
      leads_from_ads: mc.leads_from_ads,
      total_leads: 0,
      ventas_cerradas: 0,
      recaudo_usd: 0,
      calificados: 0,
      no_calificados: 0,
    });
  }

  for (const row of leadsByCampaign.rows || []) {
    const key = row.campana;
    if (campaignMap.has(key)) {
      const c = campaignMap.get(key)!;
      c.total_leads = parseInt(row.total_leads) || 0;
      c.ventas_cerradas = parseInt(row.ventas_cerradas) || 0;
      c.recaudo_usd = parseFloat(row.recaudo_usd) || 0;
    } else {
      campaignMap.set(key, {
        campaign_name: key,
        pais: userCids === 7 ? "Panama" : "Venezuela",
        spend_usd: 0,
        impressions: 0,
        clicks: 0,
        leads_from_ads: 0,
        total_leads: parseInt(row.total_leads) || 0,
        ventas_cerradas: parseInt(row.ventas_cerradas) || 0,
        recaudo_usd: parseFloat(row.recaudo_usd) || 0,
        calificados: 0,
        no_calificados: 0,
      });
    }
  }

  for (const row of qualificationData) {
    const key = row.campana;
    if (campaignMap.has(key)) {
      const c = campaignMap.get(key)!;
      c.calificados = parseInt(row.calificados) || 0;
      c.no_calificados = parseInt(row.no_calificados) || 0;
    } else if (row.campana) {
      campaignMap.set(key, {
        campaign_name: key,
        pais: row.pais || (userCids === 7 ? "Panama" : "Venezuela"),
        spend_usd: 0,
        impressions: 0,
        clicks: 0,
        leads_from_ads: 0,
        total_leads: 0,
        ventas_cerradas: 0,
        recaudo_usd: 0,
        calificados: parseInt(row.calificados) || 0,
        no_calificados: parseInt(row.no_calificados) || 0,
      });
    }
  }

  // Overrides manuales cargados desde el tab de Campanas Meta
  let overridesData: any[] = [];
  try {
    const overrideResult: any = await query("SELECT * FROM campaign_overrides");
    overridesData = overrideResult.rows || [];
  } catch {
    console.warn("Tabla campaign_overrides no disponible aún");
  }

  const overridesMap = new Map<string, any>();
  for (const ov of overridesData) {
    overridesMap.set(ov.campaign_name, ov);
  }

  for (const [name, c] of campaignMap) {
    const ov = overridesMap.get(name);
    if (!ov) continue;
    if (ov.impressions !== null && ov.impressions !== undefined)
      c.impressions = parseInt(ov.impressions);
    if (ov.clicks !== null && ov.clicks !== undefined)
      c.clicks = parseInt(ov.clicks);
    if (ov.leads_from_ads !== null && ov.leads_from_ads !== undefined)
      c.leads_from_ads = parseInt(ov.leads_from_ads);
    if (ov.calificados !== null && ov.calificados !== undefined)
      c.calificados = parseInt(ov.calificados);
    if (ov.no_calificados !== null && ov.no_calificados !== undefined)
      c.no_calificados = parseInt(ov.no_calificados);
    if (ov.ventas_cerradas !== null && ov.ventas_cerradas !== undefined)
      c.ventas_cerradas = parseInt(ov.ventas_cerradas);
    if (ov.recaudo_usd !== null && ov.recaudo_usd !== undefined)
      c.recaudo_usd = parseFloat(ov.recaudo_usd);
  }

  const campaigns: CampaignAggregate[] = Array.from(campaignMap.values()).map(
    (c) => {
      const costo_por_lead = c.total_leads > 0 ? c.spend_usd / c.total_leads : 0;
      const costo_por_lead_calificado =
        c.calificados > 0 ? c.spend_usd / c.calificados : 0;
      const roi =
        c.spend_usd > 0
          ? ((c.recaudo_usd - c.spend_usd) / c.spend_usd) * 100
          : 0;
      return {
        ...c,
        costo_por_lead: Math.round(costo_por_lead * 100) / 100,
        costo_por_lead_calificado:
          Math.round(costo_por_lead_calificado * 100) / 100,
        roi: Math.round(roi * 100) / 100,
      };
    },
  );

  campaigns.sort((a, b) => b.spend_usd - a.spend_usd);

  const totalSpend = campaigns.reduce((s, c) => s + c.spend_usd, 0);
  const recaudoTotal = campaigns.reduce((s, c) => s + c.recaudo_usd, 0);
  const totalCalificados =
    parseInt(totalQualificationCounts.total_calificados) || 0;

  const summary: CampaignSummary = {
    total_spend: totalSpend,
    total_leads: campaigns.reduce((s, c) => s + c.total_leads, 0),
    total_calificados: totalCalificados,
    total_no_calificados:
      parseInt(totalQualificationCounts.total_no_calificados) || 0,
    total_ventas: campaigns.reduce((s, c) => s + c.ventas_cerradas, 0),
    recaudo_total: recaudoTotal,
    costo_por_lead_calificado:
      totalCalificados > 0
        ? Math.round((totalSpend / totalCalificados) * 100) / 100
        : 0,
    roi_global:
      totalSpend > 0
        ? Math.round(((recaudoTotal - totalSpend) / totalSpend) * 100 * 100) /
          100
        : 0,
  };

  return { campaigns, summary, accounts };
}
