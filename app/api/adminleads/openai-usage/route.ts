import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const adminKey = process.env.OPENAI_ADMIN_KEY;
    if (!adminKey) {
      return NextResponse.json(
        { error: "OPENAI_ADMIN_KEY no configurado" },
        { status: 500 },
      );
    }

    const { searchParams } = new URL(request.url);
    const fechaInicio = searchParams.get("fecha_inicio");
    const fechaFin = searchParams.get("fecha_fin");

    const start_date = fechaInicio || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    const end_date = fechaFin || new Date().toISOString().slice(0, 10);

    const baseUrl = "https://api.openai.com/v1/organization";

    const headers = {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    };

    let projects: any[] = [];
    let usageData: any[] = [];

    // 1. Get projects list
    try {
      const projectsRes = await fetch(`${baseUrl}/projects`, { headers });
      if (projectsRes.ok) {
        const projectsJson = await projectsRes.json();
        projects = projectsJson.data || [];
      }
    } catch (err) {
      console.error("[OpenAI Usage] Error fetching projects:", err);
    }

    // 2. Get usage data per project
    for (const project of projects) {
      try {
        const usageRes = await fetch(
          `${baseUrl}/projects/${project.id}/usage/completions?start_date=${start_date}&end_date=${end_date}`,
          { headers },
        );

        if (usageRes.ok) {
          const usageJson = await usageRes.json();
          const projectUsage = usageJson.data || [];

          for (const item of projectUsage) {
            usageData.push({
              project_id: project.id,
              project_name: project.name,
              model: item.model || "unknown",
              input_tokens: item.input_tokens || 0,
              output_tokens: item.output_tokens || 0,
              total_tokens: (item.input_tokens || 0) + (item.output_tokens || 0),
              cost_usd: item.cost_usd || 0,
              num_requests: item.num_requests || 0,
            });
          }
        }
      } catch (err) {
        console.error(`[OpenAI Usage] Error fetching usage for project ${project.name}:`, err);
      }
    }

    // 3. Aggregate by project
    const byProject = projects.map((p: any) => {
      const projectData = usageData.filter((u) => u.project_id === p.id);
      return {
        project_id: p.id,
        project_name: p.name,
        total_tokens: projectData.reduce((s, u) => s + u.total_tokens, 0),
        total_cost_usd: projectData.reduce((s, u) => s + u.cost_usd, 0),
        total_requests: projectData.reduce((s, u) => s + u.num_requests, 0),
        models: projectData.map((u) => ({
          model: u.model,
          tokens: u.total_tokens,
          cost_usd: u.cost_usd,
          requests: u.num_requests,
        })),
      };
    });

    // 4. Aggregate by model (all projects)
    const modelMap = new Map<string, { tokens: number; cost_usd: number; requests: number }>();
    for (const u of usageData) {
      const existing = modelMap.get(u.model) || { tokens: 0, cost_usd: 0, requests: 0 };
      existing.tokens += u.total_tokens;
      existing.cost_usd += u.cost_usd;
      existing.requests += u.num_requests;
      modelMap.set(u.model, existing);
    }

    const byModel = Array.from(modelMap.entries()).map(([model, data]) => ({
      model,
      ...data,
    }));

    // 5. Total
    const totalCost = usageData.reduce((s, u) => s + u.cost_usd, 0);
    const totalTokens = usageData.reduce((s, u) => s + u.total_tokens, 0);
    const totalRequests = usageData.reduce((s, u) => s + u.num_requests, 0);

    return NextResponse.json({
      period: { start_date, end_date },
      total: {
        cost_usd: Math.round(totalCost * 10000) / 10000,
        tokens: totalTokens,
        requests: totalRequests,
      },
      by_project: byProject,
      by_model: byModel,
    });
  } catch (error: any) {
    console.error("[OpenAI Usage] Error:", error);
    return NextResponse.json(
      { error: error?.message || "Error fetching OpenAI usage" },
      { status: 500 },
    );
  }
}
