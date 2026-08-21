import { query } from "@/lib/db";
import {
  filterByCids,
  getAdAccounts,
  syncAllCampaigns,
  type NormalizedCampaign,
} from "@/lib/meta";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret);
    const userCids = payload.cids as number;

    const { searchParams } = new URL(request.url);
    const sede = searchParams.get("sede");
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const fechaInicio = dateRegex.test(searchParams.get("fecha_inicio") || "")
      ? searchParams.get("fecha_inicio")!
      : null;
    const fechaFin = dateRegex.test(searchParams.get("fecha_fin") || "")
      ? searchParams.get("fecha_fin")!
      : null;

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

    const leadConditions: string[] = [];
    const leadParams: any[] = [];

    leadConditions.push(
      "canal_origen IN ('Facebook Ads', 'Instagram', 'Meta Ads')",
    );
    leadConditions.push("campana IS NOT NULL AND campana != ''");

    if (sede) {
      leadConditions.push(
        "seller_id IN (SELECT id FROM sellers WHERE cids = ?)",
      );
      leadParams.push(parseInt(sede));
    } else if (userCids !== 7) {
      leadConditions.push(
        "seller_id IN (SELECT id FROM sellers WHERE cids != 7)",
      );
    }

    if (fechaInicio) {
      leadConditions.push(
        "COALESCE(fecha_venta, fecha_ingreso, created_at) >= ?",
      );
      leadParams.push(`${fechaInicio} 00:00:00`);
    }
    if (fechaFin) {
      leadConditions.push(
        "COALESCE(fecha_venta, fecha_ingreso, created_at) <= ?",
      );
      leadParams.push(`${fechaFin} 23:59:59`);
    }

    const leadWhere =
      leadConditions.length > 0
        ? `WHERE ${leadConditions.join(" AND ")}`
        : "";

    const leadsByCampaign: any = await query(
      `
      SELECT
        campana,
        COUNT(*) as total_leads,
        SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO') THEN 1 ELSE 0 END) as ventas_cerradas,
        IFNULL(SUM(CASE WHEN status = 'CERRADO' AND motivo_cierre IN ('VENTA', 'GANADO') THEN monto_cerrado_usd ELSE 0 END), 0) as recaudo_usd
      FROM leads
      ${leadWhere}
      GROUP BY campana
    `,
      leadParams,
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
      convConditions.length > 0
        ? `WHERE ${convConditions.join(" AND ")}`
        : "";

    let qualificationData: any[] = [];
    let totalQualificationCounts: any = { total_calificados: 0, total_no_calificados: 0 };
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
      totalQualificationCounts = countsResult.rows?.[0] || totalQualificationCounts;
    } catch {
      console.warn("Tabla conversaciones no disponible aún");
    }

    let aiUsageData: any[] = [];
    try {
      let aiQuery = `
        SELECT
          source,
          model,
          COUNT(*) as total_calls,
          IFNULL(SUM(total_tokens), 0) as total_tokens,
          IFNULL(SUM(estimated_cost_usd), 0) as total_cost_usd
        FROM ai_usage_logs
      `;
      const aiParams: any[] = [];
      if (fechaInicio || fechaFin) {
        aiQuery += ` WHERE request_timestamp >= ? AND request_timestamp <= ?`;
        aiParams.push(
          `${fechaInicio || "2026-01-01"} 00:00:00`,
          `${fechaFin || new Date().toISOString().slice(0, 10)} 23:59:59`,
        );
      }
      aiQuery += ` GROUP BY source, model`;

      const result: any = await query(aiQuery, aiParams);
      aiUsageData = result.rows || [];
    } catch {
      console.warn("Tabla ai_usage_logs no disponible aún");
    }

    const campaignMap = new Map<
      string,
      {
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
      }
    >();

    for (const mc of metaCampaigns) {
      const key = mc.campaign_name;
      campaignMap.set(key, {
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
        const pais =
          userCids === 7 ? "Panama" : "Venezuela";
        campaignMap.set(key, {
          campaign_name: key,
          pais,
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

    // Apply campaign overrides from DB
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
      if (ov) {
        if (ov.impressions !== null && ov.impressions !== undefined) c.impressions = parseInt(ov.impressions);
        if (ov.clicks !== null && ov.clicks !== undefined) c.clicks = parseInt(ov.clicks);
        if (ov.leads_from_ads !== null && ov.leads_from_ads !== undefined) c.leads_from_ads = parseInt(ov.leads_from_ads);
        if (ov.calificados !== null && ov.calificados !== undefined) c.calificados = parseInt(ov.calificados);
        if (ov.no_calificados !== null && ov.no_calificados !== undefined) c.no_calificados = parseInt(ov.no_calificados);
        if (ov.ventas_cerradas !== null && ov.ventas_cerradas !== undefined) c.ventas_cerradas = parseInt(ov.ventas_cerradas);
        if (ov.recaudo_usd !== null && ov.recaudo_usd !== undefined) c.recaudo_usd = parseFloat(ov.recaudo_usd);
      }
    }

    const campaigns = Array.from(campaignMap.values()).map((c) => {
      const costo_por_lead =
        c.total_leads > 0 ? c.spend_usd / c.total_leads : 0;
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
    });

    campaigns.sort((a, b) => b.spend_usd - a.spend_usd);

    const summary = {
      total_spend: campaigns.reduce((s, c) => s + c.spend_usd, 0),
      total_leads: campaigns.reduce((s, c) => s + c.total_leads, 0),
      total_calificados: parseInt(totalQualificationCounts.total_calificados) || 0,
      total_no_calificados: parseInt(totalQualificationCounts.total_no_calificados) || 0,
      total_ventas: campaigns.reduce((s, c) => s + c.ventas_cerradas, 0),
      recaudo_total: campaigns.reduce((s, c) => s + c.recaudo_usd, 0),
      costo_por_lead_calificado:
        (parseInt(totalQualificationCounts.total_calificados) || 0) > 0
          ? Math.round(
              (campaigns.reduce((s, c) => s + c.spend_usd, 0) /
                (parseInt(totalQualificationCounts.total_calificados) || 1)) *
                100,
            ) / 100
          : 0,
      roi_global:
        campaigns.reduce((s, c) => s + c.spend_usd, 0) > 0
          ? Math.round(
              ((campaigns.reduce((s, c) => s + c.recaudo_usd, 0) -
                campaigns.reduce((s, c) => s + c.spend_usd, 0)) /
                campaigns.reduce((s, c) => s + c.spend_usd, 0)) *
                100 *
                100,
            ) / 100
          : 0,
    };

    const aiPanel = aiUsageData
      .filter((r: any) => r.source === "panel")
      .reduce(
        (acc: any, r: any) => ({
          calls: acc.calls + (parseInt(r.total_calls) || 0),
          cost_usd:
            acc.cost_usd + (parseFloat(r.total_cost_usd) || 0),
        }),
        { calls: 0, cost_usd: 0 },
      );

    const aiBot = aiUsageData
      .filter((r: any) => r.source === "n8n_bot")
      .reduce(
        (acc: any, r: any) => ({
          calls: acc.calls + (parseInt(r.total_calls) || 0),
          cost_usd:
            acc.cost_usd + (parseFloat(r.total_cost_usd) || 0),
        }),
        { calls: 0, cost_usd: 0 },
      );

    const byModel = aiUsageData.map((r: any) => ({
      model: r.model,
      calls: parseInt(r.total_calls) || 0,
      tokens: parseInt(r.total_tokens) || 0,
      cost_usd: parseFloat(r.total_cost_usd) || 0,
    }));

    return NextResponse.json({
      campaigns,
      summary,
      aiUsage: {
        panel: aiPanel,
        n8n_bot: aiBot,
        total_usd: Math.round((aiPanel.cost_usd + aiBot.cost_usd) * 100) / 100,
        by_model: byModel,
      },
    });
  } catch (error: any) {
    console.error("Error en API meta-campaigns:", error);
    return NextResponse.json(
      {
        error: "Error en base de datos",
        detail: error?.message || String(error),
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const secret = new TextEncoder().encode(process.env.JWT_SECRET);
    await jwtVerify(token, secret);

    const body = await request.json();
    const { campaign_name, impressions, clicks, leads_from_ads, calificados, no_calificados, ventas_cerradas, recaudo_usd } = body;

    if (!campaign_name) {
      return NextResponse.json({ error: "campaign_name es requerido" }, { status: 400 });
    }

    const fields: string[] = [];
    const params: any[] = [];

    if (impressions !== undefined) { fields.push("impressions = ?"); params.push(parseInt(impressions) || 0); }
    if (clicks !== undefined) { fields.push("clicks = ?"); params.push(parseInt(clicks) || 0); }
    if (leads_from_ads !== undefined) { fields.push("leads_from_ads = ?"); params.push(parseInt(leads_from_ads) || 0); }
    if (calificados !== undefined) { fields.push("calificados = ?"); params.push(parseInt(calificados) || 0); }
    if (no_calificados !== undefined) { fields.push("no_calificados = ?"); params.push(parseInt(no_calificados) || 0); }
    if (ventas_cerradas !== undefined) { fields.push("ventas_cerradas = ?"); params.push(parseInt(ventas_cerradas) || 0); }
    if (recaudo_usd !== undefined) { fields.push("recaudo_usd = ?"); params.push(parseFloat(recaudo_usd) || 0); }

    if (fields.length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const colNames = fields.map(f => f.split(' =')[0]);
    const insertValues = params.slice(0, fields.length);
    const updateClause = fields.join(', ');

    await query(
      `INSERT INTO campaign_overrides (campaign_name, ${colNames.join(', ')})
       VALUES (?, ${colNames.map(() => '?').join(', ')})
       ON DUPLICATE KEY UPDATE ${updateClause}`,
      [campaign_name, ...insertValues, ...insertValues],
    );

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error en PATCH meta-campaigns:", error);
    return NextResponse.json(
      { error: error?.message || "Error interno" },
      { status: 500 },
    );
  }
}
