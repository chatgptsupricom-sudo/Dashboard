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

    // Fetch OpenAI usage from Admin API (org-level endpoints)
    let openaiUsage = { total: { cost_usd: 0, tokens: 0, requests: 0 }, by_project: [], by_model: [] };
    try {
      const adminKey = process.env.OPENAI_ADMIN_KEY;
      if (adminKey) {
        const headers = { Authorization: `Bearer ${adminKey}` };
        const baseUrl = "https://api.openai.com/v1/organization";
        const start = fechaInicio || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
        const end = fechaFin || new Date().toISOString().slice(0, 10);
        // Get completions usage (max 31 days per request with bucket_width=1d)
        let allUsage: any[] = [];
        let byProject: any[] = [];

        try {
          const startTs = Math.floor(new Date(start).getTime() / 1000);
          const endTs = Math.floor(new Date(end + "T23:59:59").getTime() / 1000);

          // Step 1: List projects from admin API
          let projects: any[] = [];
          try {
            const projRes = await fetch(`${baseUrl}/projects`, { headers });
            if (projRes.ok) {
              const projJson = await projRes.json();
              projects = projJson.data || [];
            }
          } catch (e) {
            console.log("[OpenAI] Could not list projects:", e);
          }

          // Step 2: Get per-project usage by querying each project separately
          const PRICING: Record<string, { input: number; output: number }> = {
            "gpt-4o": { input: 2.50, output: 10.00 },
            "gpt-4o-mini": { input: 0.15, output: 0.60 },
            "o3-mini": { input: 1.10, output: 4.40 },
            "o3": { input: 10.00, output: 40.00 },
            "o4-mini": { input: 1.10, output: 4.40 },
            "gpt-4-turbo": { input: 10.00, output: 30.00 },
            "gpt-3.5-turbo": { input: 0.50, output: 1.50 },
          };

          // Map known project IDs to friendly names
          const PROJECT_NAMES: Record<string, string> = {
            "proj_AQAvbt97wLltTNUTMQk1vopO": "Dashboard (Panel)",
            "proj_oYndr5CRzK6cceAfR2BElEkl": "n8n auto chat (Bot)",
          };

          for (const project of projects) {
            let projectTokens = 0;
            let projectRequests = 0;

            try {
              // Use OpenAI-Project header to filter by project
              const projectHeaders = {
                ...headers,
                "OpenAI-Project": project.id,
              };

              const usageRes = await fetch(
                `${baseUrl}/usage/completions?bucket_width=1d&start_time=${startTs}&end_time=${endTs}&limit=31`,
                { headers: projectHeaders },
              );

              if (usageRes.ok) {
                const usageJson = await usageRes.json();
                const buckets = usageJson.data || [];

                for (const bucket of buckets) {
                  for (const item of bucket.results || []) {
                    const inputTokens = item.input_tokens || 0;
                    const outputTokens = item.output_tokens || 0;
                    const model = item.model || "gpt-4o";
                    const pricing = PRICING[item.model] || { input: 2.50, output: 10.00 };
                    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

                    allUsage.push({
                      model,
                      cost_usd: cost,
                      tokens: inputTokens + outputTokens,
                      requests: item.num_model_requests || 0,
                      project_id: project.id,
                    });

                    projectTokens += inputTokens + outputTokens;
                    projectRequests += item.num_model_requests || 0;
                  }
                }
              } else {
                const errText = await usageRes.text().catch(() => "");
                console.log(`[OpenAI] Usage ${project.name} (${usageRes.status}): ${errText.substring(0, 200)}`);
              }
            } catch (e) {
              console.log(`[OpenAI] Error for project ${project.name}:`, e);
            }

            byProject.push({
              project_id: project.id,
              project_name: PROJECT_NAMES[project.id] || project.name,
              total_tokens: projectTokens,
              total_requests: projectRequests,
              total_cost_usd: 0,
            });
          }

          // If no projects found, get org-level usage
          if (projects.length === 0) {
            try {
              const usageRes = await fetch(
                `${baseUrl}/usage/completions?bucket_width=1d&start_time=${startTs}&end_time=${endTs}&limit=31`,
                { headers },
              );
              if (usageRes.ok) {
                const usageJson = await usageRes.json();
                const buckets = usageJson.data || [];
                for (const bucket of buckets) {
                  for (const item of bucket.results || []) {
                    const inputTokens = item.input_tokens || 0;
                    const outputTokens = item.output_tokens || 0;
                    const model = item.model || "gpt-4o";
                    const pricing = PRICING[item.model] || { input: 2.50, output: 10.00 };
                    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
                    allUsage.push({ model, cost_usd: cost, tokens: inputTokens + outputTokens, requests: item.num_model_requests || 0 });
                  }
                }
              }
            } catch (e) {}
          }

          // Calculate costs from usage data (since costs endpoint doesn't have project_id)
          const projectCostMap = new Map<string, number>();
          for (const u of allUsage) {
            const projId = u.project_id || "org";
            projectCostMap.set(projId, (projectCostMap.get(projId) || 0) + u.cost_usd);
          }

          byProject = byProject.map((p) => ({
            ...p,
            total_cost_usd: Math.round((projectCostMap.get(p.project_id) || 0) * 10000) / 10000,
          }));

        } catch (e) {
          console.error("[OpenAI] Error:", e);
        }
        // Aggregate by model
        const modelMap = new Map();
        for (const u of allUsage) {
          const existing = modelMap.get(u.model) || { tokens: 0, cost_usd: 0, requests: 0 };
          existing.tokens += u.tokens;
          existing.cost_usd += u.cost_usd;
          existing.requests += u.requests;
          modelMap.set(u.model, existing);
        }

        openaiUsage = {
          total: {
            cost_usd: Math.round(allUsage.reduce((s, u) => s + u.cost_usd, 0) * 10000) / 10000,
            tokens: allUsage.reduce((s, u) => s + u.tokens, 0),
            requests: allUsage.reduce((s, u) => s + u.requests, 0),
          },
          by_project: byProject,
          by_model: Array.from(modelMap.entries()).map(([model, data]) => ({ model, ...data })),
        };

        console.log(`[OpenAI] Usage fetched: $${openaiUsage.total.cost_usd}, ${openaiUsage.total.tokens} tokens, ${openaiUsage.by_model.length} models`);
      }
    } catch (err) {
      console.error("Error fetching OpenAI usage:", err);
    }

    return NextResponse.json({
      campaigns,
      summary,
      aiUsage: {
        panel: aiPanel,
        n8n_bot: aiBot,
        total_usd: Math.round((aiPanel.cost_usd + aiBot.cost_usd) * 100) / 100,
        by_model: byModel,
      },
      openaiUsage,
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
