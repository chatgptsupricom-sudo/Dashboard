import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const adminKey = process.env.OPENAI_ADMIN_KEY;

  if (!adminKey) {
    return NextResponse.json({ error: "OPENAI_ADMIN_KEY no configurado" }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const start_date = searchParams.get("fecha_inicio") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
  const end_date = searchParams.get("fecha_fin") || new Date().toISOString().slice(0, 10);

  const headers = { Authorization: `Bearer ${adminKey}` };
  const baseUrl = "https://api.openai.com/v1/organization";

  try {
    const projectsRes = await fetch(`${baseUrl}/projects`, { headers });
    const projectsJson = await projectsRes.json();
    const projects = projectsJson.data || [];

    const byProject = [];
    const allUsage = [];

    for (const project of projects) {
      try {
        const usageRes = await fetch(
          `${baseUrl}/projects/${project.id}/usage/completions?start_date=${start_date}&end_date=${end_date}`,
          { headers },
        );
        const usageJson = await usageRes.json();
        const items = usageJson.data || [];

        let projectCost = 0;
        let projectTokens = 0;
        let projectRequests = 0;

        for (const item of items) {
          const cost = item.cost_usd || 0;
          const tokens = (item.input_tokens || 0) + (item.output_tokens || 0);
          projectCost += cost;
          projectTokens += tokens;
          projectRequests += item.num_requests || 0;

          allUsage.push({
            model: item.model || "unknown",
            cost_usd: cost,
            tokens,
            requests: item.num_requests || 0,
          });
        }

        byProject.push({
          project_id: project.id,
          project_name: project.name,
          total_cost_usd: Math.round(projectCost * 10000) / 10000,
          total_tokens: projectTokens,
          total_requests: projectRequests,
        });
      } catch (e) {
        byProject.push({
          project_id: project.id,
          project_name: project.name,
          total_cost_usd: 0,
          total_tokens: 0,
          total_requests: 0,
        });
      }
    }

    const modelMap = new Map();
    for (const u of allUsage) {
      const existing = modelMap.get(u.model) || { tokens: 0, cost_usd: 0, requests: 0 };
      existing.tokens += u.tokens;
      existing.cost_usd += u.cost_usd;
      existing.requests += u.requests;
      modelMap.set(u.model, existing);
    }

    const byModel = Array.from(modelMap.entries()).map(([model, data]) => ({ model, ...data }));

    return NextResponse.json({
      period: { start_date, end_date },
      total: {
        cost_usd: Math.round(allUsage.reduce((s, u) => s + u.cost_usd, 0) * 10000) / 10000,
        tokens: allUsage.reduce((s, u) => s + u.tokens, 0),
        requests: allUsage.reduce((s, u) => s + u.requests, 0),
      },
      by_project: byProject,
      by_model: byModel,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
