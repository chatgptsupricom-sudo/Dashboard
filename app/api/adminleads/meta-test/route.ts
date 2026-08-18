import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const token = process.env.META_ACCESS_TOKEN;
  const accounts = JSON.parse((process.env.META_AD_ACCOUNTS || "[]").replace(/\n/g, "").trim());

  const log: string[] = [];
  const push = (msg: string) => { log.push(msg); };

  push(`Token OK: ${token ? "yes" : "no"}`);
  push(`Accounts: ${accounts.length}`);

  if (!token) return NextResponse.json({ error: "No token", log });

  // Test 1: Account info
  if (accounts.length > 0) {
    const acc = accounts[0];
    const accRes = await fetch(`https://graph.facebook.com/v21.0/${acc.id}?fields=name,account_status,currency&access_token=${token}`);
    const accText = await accRes.text();
    push(`Account ${acc.id}: ${accText.substring(0, 200)}`);

    // Test 2: Insights GET (not POST - POST returns async report_run_id)
    const insightsParams = new URLSearchParams({
      fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
      level: "campaign",
      time_range: JSON.stringify({ since: "2026-07-01", until: "2026-08-18" }),
      limit: "10",
      access_token: token,
    });
    const insightsRes = await fetch(`https://graph.facebook.com/v21.0/${acc.id}/insights?${insightsParams}`);
    const insightsText = await insightsRes.text();
    push(`Insights GET ${acc.id} (${insightsRes.status}): ${insightsText.substring(0, 1500)}`);
  }

    // Test 3: Second account
    if (accounts.length > 1) {
      const acc = accounts[1];
      const insightsParams = new URLSearchParams({
        fields: "campaign_id,campaign_name,spend,impressions,clicks,actions",
        level: "campaign",
        time_range: JSON.stringify({ since: "2026-07-01", until: "2026-08-18" }),
        limit: "10",
        access_token: token,
      });
      const insightsRes = await fetch(`https://graph.facebook.com/v21.0/${acc.id}/insights?${insightsParams}`);
      const insightsText = await insightsRes.text();
      push(`Insights GET ${acc.id} (${insightsRes.status}): ${insightsText.substring(0, 1500)}`);
    }

  return NextResponse.json({ log });
}
