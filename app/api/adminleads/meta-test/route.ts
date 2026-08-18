import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const token = process.env.META_ACCESS_TOKEN;
    const accounts = JSON.parse(process.env.META_AD_ACCOUNTS || "[]");

    if (!token) {
      return NextResponse.json({ error: "META_ACCESS_TOKEN no configurado" }, { status: 500 });
    }

    const results = [];

    for (const account of accounts) {
      // Test 1: Get account info (simple GET)
      const accountUrl = `https://graph.facebook.com/v21.0/${account.id}?fields=name,account_status,currency&access_token=${token}`;
      const accountRes = await fetch(accountUrl);
      const accountText = await accountRes.text();
      let accountData;
      try { accountData = JSON.parse(accountText); } catch { accountData = { raw: accountText }; }

      // Test 2: Get campaigns list (simple GET, no insights)
      const campaignsUrl = `https://graph.facebook.com/v21.0/${account.id}/campaigns?fields=name,status,objective&limit=5&access_token=${token}`;
      const campaignsRes = await fetch(campaignsUrl);
      const campaignsText = await campaignsRes.text();
      let campaignsData;
      try { campaignsData = JSON.parse(campaignsText); } catch { campaignsData = { raw: campaignsText }; }

      // Test 3: Insights POST
      const insightsUrl = `https://graph.facebook.com/v21.0/${account.id}/insights`;
      const insightsRes = await fetch(insightsUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fields: ["campaign_id", "campaign_name", "spend", "impressions", "clicks"],
          level: "campaign",
          time_range: { since: "2026-07-01", until: "2026-08-18" },
          access_token: token,
        }),
      });
      const insightsText = await insightsRes.text();
      let insightsData;
      try { insightsData = JSON.parse(insightsText); } catch { insightsData = { raw: insightsText }; }

      results.push({
        account_id: account.id,
        account_name: account.nombre,
        pais: account.pais,
        account_info: accountData,
        campaigns_list: campaignsData,
        insights: insightsData,
      });
    }

    return NextResponse.json({ token_prefix: token.substring(0, 20) + "...", results });
  } catch (error: any) {
    return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
}
