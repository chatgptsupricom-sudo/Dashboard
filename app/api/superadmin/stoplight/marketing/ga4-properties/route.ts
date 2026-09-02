import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";

async function getValidAccessToken(): Promise<string | null> {
  const rows = await query("SELECT access_token, refresh_token, token_expiry FROM google_tokens WHERE provider = 'google'", []);
  const tokenRow = (rows.rows as any[])[0];
  if (!tokenRow) return null;

  const now = new Date();
  const expiry = new Date(tokenRow.token_expiry);

  if (now < expiry) return tokenRow.access_token;
  if (!tokenRow.refresh_token) return null;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRow.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (data.error) return null;

  const newExpiry = new Date();
  newExpiry.setSeconds(newExpiry.getSeconds() + (data.expires_in || 3600));
  await query("UPDATE google_tokens SET access_token = ?, token_expiry = ? WHERE provider = 'google'", [data.access_token, newExpiry]);

  return data.access_token;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "superadmin" && userRole !== "gerencia de ventas" && userRole !== "compras" && userRole !== "gerente de operaciones") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const accessToken = await getValidAccessToken();
    if (!accessToken) return NextResponse.json({ error: "No conectado" }, { status: 401 });

    const res = await fetch("https://analyticsadmin.googleapis.com/v1alpha/accountSummaries?pageSize=200", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: "Error GA4", details: err }, { status: 500 });
    }

    const data = await res.json();
    const properties: { propertyId: string; displayName: string; accountName: string }[] = [];

    for (const account of data.accountSummaries || []) {
      for (const prop of account.propertySummaries || []) {
        properties.push({
          propertyId: prop.property?.replace("properties/", "") || "",
          displayName: prop.displayName || "",
          accountName: account.displayName || "",
        });
      }
    }

    return NextResponse.json({ success: true, properties });
  } catch (error: any) {
    console.error("Error listing GA4 properties:", error.message);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
