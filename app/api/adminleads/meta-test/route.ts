import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const token = process.env.META_ACCESS_TOKEN;
  const accounts = JSON.parse(process.env.META_AD_ACCOUNTS || "[]");

  const log: string[] = [];
  const push = (msg: string) => { log.push(msg); };

  push(`Token starts with: ${token ? token.substring(0, 15) + "..." : "MISSING"}`);
  push(`Accounts: ${accounts.length}`);

  if (!token) {
    return NextResponse.json({ error: "No token", log });
  }

  // Test 1: Simple GET to debug token
  const testUrl = `https://graph.facebook.com/v21.0/me?access_token=${token}`;
  push(`Test URL: ${testUrl.replace(token, "TOKEN_HIDDEN")}`);
  const testRes = await fetch(testUrl);
  const testText = await testRes.text();
  push(`Test response (${testRes.status}): ${testText.substring(0, 500)}`);

  // Test 2: Account info
  if (accounts.length > 0) {
    const acc = accounts[0];
    const accUrl = `https://graph.facebook.com/v21.0/${acc.id}?fields=name,account_status,currency&access_token=${token}`;
    push(`Account URL: ${accUrl.replace(token, "TOKEN_HIDDEN")}`);
    const accRes = await fetch(accUrl);
    const accText = await accRes.text();
    push(`Account response (${accRes.status}): ${accText.substring(0, 500)}`);
  }

  return NextResponse.json({ log });
}
