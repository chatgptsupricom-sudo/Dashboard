import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const accounts = JSON.parse(process.env.META_AD_ACCOUNTS || "[]");

    if (!token) {
      return NextResponse.json({ error: "META_ACCESS_TOKEN no configurado" }, { status: 500 });
    }

    if (accounts.length === 0) {
      return NextResponse.json({ error: "META_AD_ACCOUNTS no configurado" }, { status: 500 });
    }

    const results = [];

    for (const account of accounts) {
      console.log(`[Meta Test] Probando cuenta: ${account.id} (${account.nombre})`);

      // Test 1: Basic account info
      const accountUrl = `https://graph.facebook.com/v21.0/${account.id}?fields=name,account_status,currency&access_token=${token}`;
      const accountRes = await fetch(accountUrl);
      const accountData = await accountRes.json();

      // Test 2: Insights with POST
      const insightsUrl = `https://graph.facebook.com/v21.0/${account.id}/insights`;
      const insightsBody = {
        fields: ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "actions"],
        level: "campaign",
        time_range: { since: "2026-07-01", until: "2026-08-18" },
        access_token: token,
      };

      console.log(`[Meta Test] POST ${insightsUrl}`);
      console.log(`[Meta Test] Body:`, JSON.stringify(insightsBody));

      const insightsRes = await fetch(insightsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(insightsBody),
      });

      const insightsData = await insightsRes.json();

      console.log(`[Meta Test] Response status: ${insightsRes.status}`);
      console.log(`[Meta Test] Response:`, JSON.stringify(insightsData).slice(0, 1000));

      results.push({
        account_id: account.id,
        account_name: account.nombre,
        pais: account.pais,
        account_info: accountData,
        insights_status: insightsRes.status,
        insights_error: insightsData.error || null,
        insights_data: insightsData.data || [],
        insights_paging: insightsData.paging || null,
      });
    }

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error("[Meta Test] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
