import crypto from "crypto";
import { db } from "@/lib/db";
import { jwtSecretBytes } from "@/lib/secretos";

/**
 * Sesión OAuth del panel contra el MCP de Odoo (rag_odoo_mcp_server en modo
 * "Sign in with Odoo"). El SuperAdmin autoriza una vez en el navegador
 * (`GET /api/superadmin/agenteia/oauth`); el panel guarda el refresh token y
 * renueva solo el access token, que dura 1 hora.
 *
 * El módulo rota el refresh token en cada renovación y lo deja vivir 30 días:
 * si el agente pasa 30 días sin usarse, hay que volver a autorizar.
 *
 * Los tokens se guardan cifrados (AES-256-GCM con una llave derivada de
 * JWT_SECRET) y con `db.execute` directo: `query()` de lib/db.ts copiaría los
 * parámetros al log de auditoría.
 */

export const TABLA_OAUTH = "agenteia_mcp_oauth";
const MARGEN_MS = 10 * 60_000; // una respuesta del agente dura como mucho 5 min
const VIGENCIA_INICIO_MS = 10 * 60_000;

type Tokens = { access: string; refresh: string; exp: number };
type Fila = { clientId: string; redirectUri: string; tokens: Tokens | null };

/** URL del MCP sin barra final, ej. https://odoo.ejemplo.com/mcp/<db>. */
export const urlMcp = () => (process.env.ODOO_MCP_URL || "").trim().replace(/\/+$/, "");

const llave = () => crypto.createHash("sha256").update("agenteia-mcp-oauth").update(jwtSecretBytes()).digest();

function cifrar(texto: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", llave(), iv);
  const cuerpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), cuerpo]).toString("base64");
}

function descifrar(dato: string): string {
  const b = Buffer.from(dato, "base64");
  const d = crypto.createDecipheriv("aes-256-gcm", llave(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

let tablaLista: Promise<unknown> | null = null;
const asegurarTabla = () =>
  (tablaLista ??= db
    .execute(
      `CREATE TABLE IF NOT EXISTS ${TABLA_OAUTH} (
        id TINYINT PRIMARY KEY,
        client_id VARCHAR(120) NOT NULL,
        redirect_uri VARCHAR(255) NOT NULL,
        tokens TEXT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
    )
    .catch((e) => {
      tablaLista = null;
      throw e;
    }));

async function leer(): Promise<Fila | null> {
  await asegurarTabla();
  const [filas]: any = await db.execute(`SELECT client_id, redirect_uri, tokens FROM ${TABLA_OAUTH} WHERE id = 1`);
  const f = filas?.[0];
  if (!f) return null;
  let tokens: Tokens | null = null;
  try {
    if (f.tokens) tokens = JSON.parse(descifrar(f.tokens));
  } catch {
    // Cambió JWT_SECRET: los tokens guardados ya no se pueden leer.
  }
  return { clientId: f.client_id, redirectUri: f.redirect_uri, tokens };
}

async function guardar(clientId: string, redirectUri: string, tokens: Tokens | null) {
  await asegurarTabla();
  await db.execute(
    `INSERT INTO ${TABLA_OAUTH} (id, client_id, redirect_uri, tokens) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE client_id = VALUES(client_id), redirect_uri = VALUES(redirect_uri), tokens = VALUES(tokens)`,
    [clientId, redirectUri, tokens ? cifrar(JSON.stringify(tokens)) : null],
  );
}

/** POST al token endpoint del módulo. `null` = Odoo rechazó el grant. */
async function pedirTokens(params: Record<string, string>): Promise<Tokens | null> {
  const r = await fetch(`${urlMcp()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  if (r.status === 400 || r.status === 401) return null;
  if (!r.ok) throw new Error(`El MCP de Odoo respondió ${r.status} al pedir el token.`);
  const j: any = await r.json();
  if (!j?.access_token || !j?.refresh_token) throw new Error("El MCP de Odoo no devolvió tokens.");
  return { access: j.access_token, refresh: j.refresh_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
}

// ── Autorización (una vez, en el navegador) ───────────────────────────────────

// El proceso es único (server.js): el inicio pendiente vive en memoria.
let pendiente: { state: string; verifier: string; clientId: string; redirectUri: string; exp: number } | null = null;

/** Registra el panel como cliente (si hace falta) y devuelve la URL de autorización de Odoo. */
export async function iniciarConexion(redirectUri: string): Promise<string> {
  if (!urlMcp()) throw new Error("Falta ODOO_MCP_URL.");
  const actual = await leer();
  let clientId = actual?.redirectUri === redirectUri ? actual.clientId : "";
  if (!clientId) {
    const r = await fetch(`${urlMcp()}/oauth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirect_uris: [redirectUri], client_name: "Panel SUPRICOM - Agente IA", token_endpoint_auth_method: "none" }),
    });
    const j: any = await r.json().catch(() => null);
    if (!r.ok || !j?.client_id) throw new Error(`El MCP de Odoo no registró el panel (${r.status}).`);
    clientId = j.client_id;
    await guardar(clientId, redirectUri, null);
  }
  const verifier = crypto.randomBytes(32).toString("base64url");
  const state = crypto.randomBytes(24).toString("base64url");
  pendiente = { state, verifier, clientId, redirectUri, exp: Date.now() + VIGENCIA_INICIO_MS };
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    code_challenge: crypto.createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  return `${urlMcp()}/oauth/authorize?${q}`;
}

/** Cambia el código que devolvió Odoo por los tokens y los guarda. */
export async function completarConexion(code: string, state: string): Promise<void> {
  const p = pendiente;
  pendiente = null;
  const a = Buffer.from(p?.state || "");
  const b = Buffer.from(state);
  if (!p || Date.now() > p.exp || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("La autorización venció o no la inició este panel. Vuelve a conectar.");
  }
  const tokens = await pedirTokens({
    grant_type: "authorization_code",
    client_id: p.clientId,
    code,
    redirect_uri: p.redirectUri,
    code_verifier: p.verifier,
  });
  if (!tokens) throw new Error("Odoo rechazó el código de autorización. Vuelve a conectar.");
  await guardar(p.clientId, p.redirectUri, tokens);
  cache = tokens;
}

// ── Token vigente para el agente ──────────────────────────────────────────────

let cache: Tokens | null = null;
let renovando: Promise<string | null> | null = null;

async function renovar(): Promise<string | null> {
  const fila = await leer();
  const t = fila?.tokens;
  if (!fila || !t) return null;
  if (t.exp - MARGEN_MS > Date.now()) return (cache = t).access;
  const nuevos = await pedirTokens({ grant_type: "refresh_token", client_id: fila.clientId, refresh_token: t.refresh });
  // El refresh token viejo queda revocado en Odoo apenas responde: si no se
  // guarda el nuevo, la sesión se pierde al reiniciar el proceso.
  await guardar(fila.clientId, fila.redirectUri, nuevos);
  cache = nuevos;
  if (!nuevos) console.warn("[agenteia] la sesión OAuth del MCP de Odoo venció: hay que volver a conectar.");
  return nuevos?.access ?? null;
}

/**
 * Access token vigente del MCP, o `null` si el panel no está conectado (o la
 * renovación falló): el agente sigue entonces solo con el JSON-RPC.
 */
export async function tokenMcp(): Promise<string | null> {
  if (!urlMcp()) return null;
  if (cache && cache.exp - MARGEN_MS > Date.now()) return cache.access;
  // Una sola renovación a la vez: el refresh token es de un solo uso.
  renovando ??= renovar()
    .catch((e) => {
      console.error("[agenteia] no se pudo renovar el token del MCP de Odoo:", e.message);
      return null;
    })
    .finally(() => {
      renovando = null;
    });
  return renovando;
}
