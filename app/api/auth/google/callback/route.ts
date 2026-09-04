import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

// El state cookie es de un solo uso: se limpia en cada redirect de salida,
// falle o no el flujo, para que no quede reutilizable.
function redirectClearingState(request: NextRequest, path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.cookies.delete("google_oauth_state");
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state");
  const expectedState = request.cookies.get("google_oauth_state")?.value;

  // El `state` confirma que este callback corresponde a un flujo que ESTE
  // navegador arranco de verdad (ver /api/auth/google) y no a un enlace
  // armado a mano por otra persona para que un superadmin logueado le
  // pise el token de Google a la empresa con el de otra cuenta.
  if (!state || !expectedState || state !== expectedState) {
    return redirectClearingState(request, "/es/superadmin/StoplightReport?google_error=invalid_state");
  }

  if (error) {
    return redirectClearingState(request, `/es/superadmin/StoplightReport?google_error=${error}`);
  }

  if (!code) {
    return redirectClearingState(request, "/es/superadmin/StoplightReport?google_error=no_code");
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
      return redirectClearingState(request, `/es/superadmin/StoplightReport?google_error=${tokenData.error}`);
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

    return redirectClearingState(request, "/es/superadmin/StoplightReport?google_connected=success");
  } catch (err: any) {
    console.error("Google callback error:", err.message);
    return redirectClearingState(request, `/es/superadmin/StoplightReport?google_error=${encodeURIComponent(err.message)}`);
  }
}
