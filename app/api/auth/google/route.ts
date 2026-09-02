import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { randomBytes } from "crypto";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/auth/google/callback";

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
].join(" ");

// Sin esto, cualquiera (sin sesion en el panel) podia entrar directo a esta
// URL, autorizar con SU PROPIA cuenta de Google, y el callback pisaba la
// unica fila de google_tokens compartida por toda la empresa. El `state`
// ademas evita que a un superadmin ya logueado lo enganchen para completar
// un flujo que arranco otra persona (CSRF de OAuth).
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const state = randomBytes(32).toString("hex");
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(GOOGLE_REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(SCOPES)}&access_type=offline&prompt=consent&state=${state}`;

  const response = NextResponse.redirect(authUrl);
  response.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });
  return response;
}
