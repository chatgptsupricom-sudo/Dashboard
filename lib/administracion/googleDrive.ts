import crypto from "crypto";
import { db } from "@/lib/db";
import { jwtSecretBytes } from "@/lib/secretos";

/**
 * Google Drive para la Conciliación Binance: Administración pega el enlace de
 * la carpeta de comprobantes y el panel la lee con la cuenta de Google que se
 * conectó una vez (OAuth con GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, permiso
 * de solo lectura). La conexión es una para todo el panel: se ve lo que esa
 * cuenta ve en Drive.
 *
 * El refresh token de Google no vence mientras se use (sí si pasa 6 meses sin
 * usarse o se revoca): se guarda cifrado (AES-256-GCM con una llave derivada de
 * JWT_SECRET) y con `db.execute` directo, para que no quede en la auditoría.
 */

const TABLA = "binance_drive_oauth";
const AUTORIZAR = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/drive/v3";
const ALCANCE = "https://www.googleapis.com/auth/drive.readonly";
const CARPETA_MIME = "application/vnd.google-apps.folder";
// Lo mismo que acepta la subida de comprobantes.
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_BYTES = 8 * 1024 * 1024;
const MARGEN_MS = 5 * 60_000;

const clientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET?.trim() || "";
export const driveConfigurado = () => !!(clientId() && clientSecret());

/** Error para mostrarle tal cual a quien usa la pantalla. */
export class ErrorDrive extends Error {}

const llave = () => crypto.createHash("sha256").update("binance-drive-oauth").update(jwtSecretBytes()).digest();

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
      `CREATE TABLE IF NOT EXISTS ${TABLA} (
        id TINYINT PRIMARY KEY,
        refresh_token TEXT NOT NULL,
        correo VARCHAR(190) NOT NULL DEFAULT '',
        conectado_por VARCHAR(190) NOT NULL DEFAULT '',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`,
    )
    .catch((e) => {
      tablaLista = null;
      throw e;
    }));

async function leer(): Promise<{ refresh: string; correo: string } | null> {
  await asegurarTabla();
  const [filas]: any = await db.execute(`SELECT refresh_token, correo FROM ${TABLA} WHERE id = 1`);
  const f = filas?.[0];
  if (!f) return null;
  try {
    return { refresh: descifrar(f.refresh_token), correo: f.correo };
  } catch {
    return null; // Cambió JWT_SECRET: hay que volver a conectar.
  }
}

// ── Conexión (una vez, en el navegador) ───────────────────────────────────────

// El proceso es único (server.js): el inicio pendiente vive en memoria.
let pendiente: { state: string; exp: number } | null = null;

/** URL del consentimiento de Google. `redirectUri` tiene que estar registrada en el cliente OAuth. */
export function iniciarConexion(redirectUri: string): string {
  if (!driveConfigurado()) throw new ErrorDrive("Falta GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET en el servidor");
  const state = crypto.randomBytes(24).toString("base64url");
  pendiente = { state, exp: Date.now() + 10 * 60_000 };
  const url = new URL(AUTORIZAR);
  for (const [k, v] of Object.entries({
    client_id: clientId(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ALCANCE,
    // offline + consent: así Google siempre devuelve el refresh token.
    access_type: "offline",
    prompt: "consent",
    state,
  })) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

/** Cambia el código que devolvió Google por los tokens y guarda el refresh token. */
export async function completarConexion(code: string, state: string, redirectUri: string, email: string) {
  const p = pendiente;
  pendiente = null;
  const a = Buffer.from(p?.state || "");
  const b = Buffer.from(state);
  if (!p || Date.now() > p.exp || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new ErrorDrive("La autorización venció o no la inició este panel. Vuelve a conectar.");
  }
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.refresh_token) {
    throw new ErrorDrive(`Google no entregó el acceso (${j?.error_description || j?.error || r.status})`);
  }
  cache = { access: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  const yo: any = await driveGet("/about?fields=user(emailAddress)").catch(() => null);
  await asegurarTabla();
  await db.execute(
    `INSERT INTO ${TABLA} (id, refresh_token, correo, conectado_por) VALUES (1, ?, ?, ?)
     ON DUPLICATE KEY UPDATE refresh_token = VALUES(refresh_token), correo = VALUES(correo), conectado_por = VALUES(conectado_por)`,
    [cifrar(j.refresh_token), String(yo?.user?.emailAddress || ""), email],
  );
}

// ── Token vigente ─────────────────────────────────────────────────────────────

let cache: { access: string; exp: number } | null = null;

async function token(): Promise<string> {
  if (cache && cache.exp - MARGEN_MS > Date.now()) return cache.access;
  const fila = await leer();
  if (!fila) throw new ErrorDrive("Google Drive no está conectado: usa «Conectar Google Drive»");
  const r = await fetch(TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId(),
      client_secret: clientSecret(),
      refresh_token: fila.refresh,
      grant_type: "refresh_token",
    }),
  });
  const j: any = await r.json().catch(() => null);
  if (!r.ok || !j?.access_token) {
    // invalid_grant = revocado o 6 meses sin uso.
    throw new ErrorDrive("Se perdió la conexión con Google Drive: vuelve a conectarla");
  }
  cache = { access: j.access_token, exp: Date.now() + (Number(j.expires_in) || 3600) * 1000 };
  return cache.access;
}

export async function estadoDrive() {
  if (!driveConfigurado()) return { configurado: false, conectado: false, correo: "" };
  const fila = await leer();
  return { configurado: true, conectado: !!fila, correo: fila?.correo || "" };
}

async function driveFetch(ruta: string): Promise<Response> {
  const r = await fetch(`${API}${ruta}`, { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
  if (r.status === 404) {
    throw new ErrorDrive("No se encontró en Drive, o la cuenta conectada no tiene acceso: compártela con esa cuenta");
  }
  if (!r.ok) throw new ErrorDrive(`Google Drive respondió ${r.status}`);
  return r;
}

const driveGet = async (ruta: string) => (await driveFetch(ruta)).json();

// ── Carpeta y archivos ────────────────────────────────────────────────────────

/** ID de una carpeta o archivo a partir del enlace de Drive (o el ID pegado solo). */
export function idDeEnlace(texto: string): string | null {
  const t = texto.trim();
  const m = /\/folders\/([\w-]+)/.exec(t) || /[?&]id=([\w-]+)/.exec(t) || /^([\w-]{15,})$/.exec(t);
  return m ? m[1] : null;
}

export const esIdDrive = (id: string) => /^[\w-]{10,200}$/.test(id);

export type ArchivoDrive = { id: string; nombre: string; carpeta: string };

async function hijos(id: string): Promise<{ id: string; name: string; mimeType: string }[]> {
  const salida: any[] = [];
  let pagina = "";
  do {
    const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
    const j = await driveGet(
      `/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000` +
        `&supportsAllDrives=true&includeItemsFromAllDrives=true${pagina ? `&pageToken=${pagina}` : ""}`,
    );
    salida.push(...(j.files || []));
    pagina = j.nextPageToken || "";
  } while (pagina);
  return salida;
}

/**
 * Fotos y PDF de la carpeta. Si trae subcarpetas (una carpeta por día dentro
 * de la de la semana), también las de cada una, con el nombre de la subcarpeta.
 */
export async function listarCarpeta(id: string): Promise<{ nombre: string; archivos: ArchivoDrive[] }> {
  if (!esIdDrive(id)) throw new ErrorDrive("El enlace no es de una carpeta de Google Drive");
  const meta = await driveGet(`/files/${id}?fields=name,mimeType&supportsAllDrives=true`);
  if (meta.mimeType !== CARPETA_MIME) throw new ErrorDrive("El enlace no es de una carpeta de Google Drive");
  const archivos: ArchivoDrive[] = [];
  for (const h of await hijos(id)) {
    if (TIPOS.has(h.mimeType)) archivos.push({ id: h.id, nombre: h.name, carpeta: meta.name });
    else if (h.mimeType === CARPETA_MIME) {
      for (const n of await hijos(h.id)) {
        if (TIPOS.has(n.mimeType)) archivos.push({ id: n.id, nombre: n.name, carpeta: h.name });
      }
    }
  }
  return { nombre: meta.name, archivos };
}

/** Baja un archivo de Drive para leerlo como si se hubiera subido. */
export async function descargarDeDrive(id: string): Promise<{ nombre: string; mime: string; datos: Buffer }> {
  if (!esIdDrive(id)) throw new ErrorDrive("ID de Drive inválido");
  const meta = await driveGet(`/files/${id}?fields=name,mimeType,size&supportsAllDrives=true`);
  if (!TIPOS.has(meta.mimeType)) throw new ErrorDrive("Solo fotos (JPG, PNG, WEBP) o PDF");
  if (Number(meta.size) > MAX_BYTES) throw new ErrorDrive("El archivo pesa más de 8 MB");
  const r = await driveFetch(`/files/${id}?alt=media&supportsAllDrives=true`);
  return { nombre: String(meta.name), mime: meta.mimeType, datos: Buffer.from(await r.arrayBuffer()) };
}
