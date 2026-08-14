import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/es/superadmin/StoplightReport?google_error=${error}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL("/es/superadmin/StoplightReport?google_error=no_code", request.url));
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error("Google token error:", tokenData);
      return NextResponse.redirect(new URL(`/es/superadmin/StoplightReport?google_error=${tokenData.error}`, request.url));
    }

    await query(`CREATE TABLE IF NOT EXISTS google_tokens (
      id INT AUTO_INCREMENT PRIMARY KEY,
      provider VARCHAR(50) NOT NULL DEFAULT 'google',
      access_token TEXT,
      refresh_token TEXT,
      token_expiry DATETIME,
      scopes TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY unique_provider (provider)
    )`);

    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + (tokenData.expires_in || 3600));

    await query(
      `INSERT INTO google_tokens (provider, access_token, refresh_token, token_expiry, scopes)
       VALUES ('google', ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         access_token = VALUES(access_token),
         refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
         token_expiry = VALUES(token_expiry),
         scopes = VALUES(scopes)`,
      [
        tokenData.access_token,
        tokenData.refresh_token || null,
        expiryDate,
        tokenData.scope || "",
      ]
    );

    return NextResponse.redirect(new URL("/es/superadmin/StoplightReport?google_connected=success", request.url));
  } catch (err: any) {
    console.error("Google callback error:", err.message);
    return NextResponse.redirect(new URL(`/es/superadmin/StoplightReport?google_error=${encodeURIComponent(err.message)}`, request.url));
  }
}
