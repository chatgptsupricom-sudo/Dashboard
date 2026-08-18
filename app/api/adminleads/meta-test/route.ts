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

    // Test 2: Insights POST
    const insightsRes = await fetch(`https://graph.facebook.com/v21.0/${acc.id}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "actions"],
        level: "campaign",
        time_range: { since: "2026-07-01", until: "2026-08-18" },
        access_token: token,
      }),
    });
    const insightsText = await insightsRes.text();
    push(`Insights ${acc.id} (${insightsRes.status}): ${insightsText.substring(0, 1500)}`);
  }

  // Test 3: Second account
  if (accounts.length > 1) {
    const acc = accounts[1];
    const insightsRes = await fetch(`https://graph.facebook.com/v21.0/${acc.id}/insights`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "actions"],
        level: "campaign",
        time_range: { since: "2026-07-01", until: "2026-08-18" },
        access_token: token,
      }),
    });
    const insightsText = await insightsRes.text();
    push(`Insights ${acc.id} (${insightsRes.status}): ${insightsText.substring(0, 1500)}`);
  }

  return NextResponse.json({ log });
}
