import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const adminKey = process.env.OPENAI_ADMIN_KEY;
    if (!adminKey) {
      return NextResponse.json({ error: "No OPENAI_ADMIN_KEY" }, { status: 500 });
    }

    const baseUrl = "https://api.openai.com/v1/organization";
    const headers = {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    };

    const log: string[] = [];

    // Test 1: List projects
    const projectsRes = await fetch(`${baseUrl}/projects`, { headers });
    const projectsText = await projectsRes.text();
    log.push(`Projects (${projectsRes.status}): ${projectsText.substring(0, 500)}`);

    let projects: any[] = [];
    try { projects = JSON.parse(projectsText).data || []; } catch {}

    // Test 2: For each project, try usage endpoint
    for (const p of projects) {
      const usageUrl = `${baseUrl}/projects/${p.id}/usage/completions?start_date=2026-01-01&end_date=2026-08-20`;
      const usageRes = await fetch(usageUrl, { headers });
      const usageText = await usageRes.text();
      log.push(`Usage ${p.name} (${usageRes.status}): ${usageText.substring(0, 500)}`);

      // Also try other usage endpoints
      const usageUrl2 = `${baseUrl}/projects/${p.id}/usage?start_date=2026-01-01&end_date=2026-08-20`;
      const usageRes2 = await fetch(usageUrl2, { headers });
      const usageText2 = await usageRes2.text();
      log.push(`Usage2 ${p.name} (${usageRes2.status}): ${usageText2.substring(0, 300)}`);
    }

    // Test 3: Try org-level usage
    const orgUsageUrl = `${baseUrl}/usage/completions?start_date=2026-01-01&end_date=2026-08-20`;
    const orgUsageRes = await fetch(orgUsageUrl, { headers });
    const orgUsageText = await orgUsageRes.text();
    log.push(`Org Usage (${orgUsageRes.status}): ${orgUsageText.substring(0, 500)}`);

    // Test 4: Try costs endpoint
    const costsUrl = `${baseUrl}/costs?start_date=2026-01-01&end_date=2026-08-20`;
    const costsRes = await fetch(costsUrl, { headers });
    const costsText = await costsRes.text();
    log.push(`Costs (${costsRes.status}): ${costsText.substring(0, 500)}`);

    return NextResponse.json({ log });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
