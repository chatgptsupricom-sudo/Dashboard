import { getCampaignMetrics } from "@/lib/campanas-meta";
import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
    const userCids = auth.payload!.cids as number;

    const { searchParams } = new URL(request.url);
    const sede = searchParams.get("sede");
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    const fechaInicio = dateRegex.test(searchParams.get("fecha_inicio") || "")
      ? searchParams.get("fecha_inicio")!
      : null;
    const fechaFin = dateRegex.test(searchParams.get("fecha_fin") || "")
      ? searchParams.get("fecha_fin")!
      : null;

    const { campaigns, summary } = await getCampaignMetrics({
      userCids,
      sede,
      fechaInicio,
      fechaFin,
    });

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

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ["adminleads"]);
  if (auth.error) return auth.error;

  try {
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
