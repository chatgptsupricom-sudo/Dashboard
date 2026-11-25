/**
 * Cuentas de clientes de la tienda web: correo + contraseña propios (no son usuarios de Odoo ni del panel).
 *
 * - El acceso se crea (o se recupera) con un código de 6 dígitos que llega al correo; solo se manda a
 *   correos que están en la ficha de un cliente en Odoo (`clientePorCorreo`). El código se guarda como
 *   hash; el texto va en `codigo_envio` solo hasta que n8n lo manda (flujo "Tienda web - Código de
 *   acceso", `N8N_TIENDA_CODIGO_WEBHOOK_URL`, importable desde `scripts/n8n-tienda-codigo-acceso.json`).
 * - Contraseña con scrypt. 5 intentos fallidos bloquean la cuenta 15 min.
 * - Sesión: JWT (jose) firmado con una clave derivada de JWT_SECRET solo para esto (audiencia
 *   `tienda-cliente`), con la versión de la cuenta: cambiar la contraseña cierra las sesiones abiertas.
 *
 * Tablas `tienda_clientes` y `tienda_codigos` (se crean solas). Se escribe con `db.execute` directo.
 */
import crypto from "crypto";
import { promisify } from "util";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { jwtSecretString } from "@/lib/secretos";
import { clientePorCorreo, type ClienteOdoo } from "./odoo";

const scrypt = promisify(crypto.scrypt) as (clave: string, sal: Buffer, largo: number, opciones: crypto.ScryptOptions) => Promise<Buffer>;

let tablasListas: Promise<void> | null = null;
function asegurarTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_clientes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          correo VARCHAR(160) NOT NULL UNIQUE,
          clave_hash VARCHAR(255) NOT NULL,
          version INT NOT NULL DEFAULT 1,
          fallidos INT NOT NULL DEFAULT 0,
          bloqueado_hasta DATETIME NULL,
          creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          clave_cambiada_at DATETIME NULL,
          ultimo_ingreso DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS tienda_codigos (
          id INT AUTO_INCREMENT PRIMARY KEY,
          correo VARCHAR(160) NOT NULL,
          nombre VARCHAR(160) NULL,
          codigo_hash CHAR(64) NOT NULL,
          codigo_envio CHAR(6) NULL,
          intentos INT NOT NULL DEFAULT 0,
          expira_at DATETIME NOT NULL,
          usado_at DATETIME NULL,
          enviado_at DATETIME NULL,
          ip VARCHAR(64) NULL,
          creado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          KEY idx_correo (correo, creado_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
    })().catch((e) => { tablasListas = null; throw e; });
  }
  return tablasListas;
}

/* ------------------------------------------------------------------ Contraseñas */
export async function cifrarClave(clave: string): Promise<string> {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(clave, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${sal.toString("base64")}$${hash.toString("base64")}`;
}
async function claveCorrecta(clave: string, guardada: string): Promise<boolean> {
  const [alg, N, r, p, sal, hash] = guardada.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64");
  const calculado = await scrypt(clave, Buffer.from(sal, "base64"), esperado.length, { N: Number(N), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && crypto.timingSafeEqual(calculado, esperado);
}
// Para que entrar con un correo sin cuenta tarde lo mismo que con uno que sí tiene (no se adivina quién es cliente).
const CLAVE_FALSA = "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

/* ------------------------------------------------------------------ Códigos */
const hashCodigo = (correo: string, codigo: string) =>
  crypto.createHmac("sha256", jwtSecretString()).update(`tienda-codigo|${correo}|${codigo}`).digest("hex");

export type ResultadoCodigo = "enviado" | "no-es-cliente" | "muchos";

/**
 * Pide un código para crear o recuperar el acceso. Responde lo mismo a la persona en los tres casos (la
 * ruta no le dice si el correo es de un cliente); aquí se distingue para el registro del servidor.
 * Hasta 3 códigos por correo cada hora; uno nuevo anula los anteriores.
 */
export async function pedirCodigo(correo: string, ip: string): Promise<ResultadoCodigo> {
  await asegurarTablas();
  const cliente = await clientePorCorreo(correo);
  if (!cliente) return "no-es-cliente";
  const [recientes]: any = await db.execute(
    "SELECT COUNT(*) AS n FROM tienda_codigos WHERE correo = ? AND creado_at > NOW() - INTERVAL 1 HOUR", [correo],
  );
  if (Number(recientes?.[0]?.n) >= 3) return "muchos";
  await db.execute("UPDATE tienda_codigos SET usado_at = NOW(), codigo_envio = NULL WHERE correo = ? AND usado_at IS NULL", [correo]);
  const codigo = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const [res]: any = await db.execute(
    `INSERT INTO tienda_codigos (correo, nombre, codigo_hash, codigo_envio, expira_at, ip)
     VALUES (?, ?, ?, ?, NOW() + INTERVAL 15 MINUTE, ?)`,
    [correo, (cliente.nombre || cliente.empresa).slice(0, 160), hashCodigo(correo, codigo), codigo, ip.slice(0, 64)],
  );
  avisarCodigo(Number(res?.insertId));
  return "enviado";
}

function avisarCodigo(id: number): void {
  const url = process.env.N8N_TIENDA_CODIGO_WEBHOOK_URL;
  if (!id) return;
  if (!url) { console.warn(`[tienda-web/clientes] código ${id} sin enviar: falta N8N_TIENDA_CODIGO_WEBHOOK_URL`); return; }
  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: "tienda_codigo", codigo_id: id }),
    signal: AbortSignal.timeout(10000),
  })
    .then((r) => { if (!r.ok) console.error(`[tienda-web/clientes] código ${id}: n8n respondió ${r.status}`); })
    .catch((e) => console.error(`[tienda-web/clientes] código ${id}:`, e?.message));
}

/** Revisa el código (5 intentos, 15 min) y lo gasta. */
async function gastarCodigo(correo: string, codigo: string): Promise<boolean> {
  const [filas]: any = await db.execute(
    `SELECT id, codigo_hash, intentos FROM tienda_codigos
      WHERE correo = ? AND usado_at IS NULL AND expira_at > NOW() ORDER BY id DESC LIMIT 1`, [correo],
  );
  const f = filas?.[0];
  if (!f) return false;
  if (Number(f.intentos) >= 5) return false;
  const bien = crypto.timingSafeEqual(Buffer.from(String(f.codigo_hash)), Buffer.from(hashCodigo(correo, codigo)));
  if (!bien) {
    await db.execute("UPDATE tienda_codigos SET intentos = intentos + 1 WHERE id = ?", [f.id]);
    return false;
  }
  await db.execute("UPDATE tienda_codigos SET usado_at = NOW(), codigo_envio = NULL WHERE id = ?", [f.id]);
  return true;
}

/* ------------------------------------------------------------------ Sesión */
const claveSesion = () => new Uint8Array(crypto.createHmac("sha256", jwtSecretString()).update("tienda-clientes-sesion").digest());
const AUDIENCIA = "tienda-cliente";

async function firmarSesion(id: number, version: number, recordar: boolean): Promise<string> {
  return new SignJWT({ v: version })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(id))
    .setAudience(AUDIENCIA)
    .setIssuedAt()
    .setExpirationTime(recordar ? "30d" : "12h")
    .sign(claveSesion());
}

export interface SesionCliente { id: number; correo: string; cliente: ClienteOdoo }

/**
 * La cuenta de un token (header `Authorization: Bearer`). null = sin sesión, vencida, cerrada por cambio
 * de contraseña o el correo ya no es de un cliente en Odoo.
 */
export async function sesionDe(request: Request): Promise<SesionCliente | null> {
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, claveSesion(), { audience: AUDIENCIA });
    const id = Number(payload.sub);
    await asegurarTablas();
    const [filas]: any = await db.execute("SELECT id, correo, version FROM tienda_clientes WHERE id = ?", [id]);
    const c = filas?.[0];
    if (!c || Number(c.version) !== Number(payload.v)) return null;
    const cliente = await clientePorCorreo(String(c.correo));
    return cliente ? { id, correo: String(c.correo), cliente } : null;
  } catch {
    return null;
  }
}

export type ResultadoAcceso =
  | { ok: true; token: string }
  | { ok: false; motivo: "datos" | "bloqueada" | "codigo" | "no-es-cliente"; minutos?: number };

/** Crea la cuenta o le cambia la contraseña, con el código del correo. Cierra las sesiones anteriores. */
export async function fijarClave(correo: string, codigo: string, clave: string, recordar: boolean): Promise<ResultadoAcceso> {
  await asegurarTablas();
  if (!(await gastarCodigo(correo, codigo))) return { ok: false, motivo: "codigo" };
  if (!(await clientePorCorreo(correo))) return { ok: false, motivo: "no-es-cliente" };
  const hash = await cifrarClave(clave);
  await db.execute(
    `INSERT INTO tienda_clientes (correo, clave_hash, clave_cambiada_at, ultimo_ingreso) VALUES (?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE clave_hash = VALUES(clave_hash), version = version + 1, fallidos = 0, bloqueado_hasta = NULL,
       clave_cambiada_at = NOW(), ultimo_ingreso = NOW()`,
    [correo, hash],
  );
  const [filas]: any = await db.execute("SELECT id, version FROM tienda_clientes WHERE correo = ?", [correo]);
  return { ok: true, token: await firmarSesion(Number(filas[0].id), Number(filas[0].version), recordar) };
}

/** Entrar con correo y contraseña. */
export async function entrar(correo: string, clave: string, recordar: boolean): Promise<ResultadoAcceso> {
  await asegurarTablas();
  const [filas]: any = await db.execute(
    "SELECT id, clave_hash, version, fallidos, bloqueado_hasta, TIMESTAMPDIFF(MINUTE, NOW(), bloqueado_hasta) AS faltan FROM tienda_clientes WHERE correo = ?",
    [correo],
  );
  const c = filas?.[0];
  if (!c) { await claveCorrecta(clave, CLAVE_FALSA); return { ok: false, motivo: "datos" }; }
  if (c.bloqueado_hasta && Number(c.faltan) >= 0) return { ok: false, motivo: "bloqueada", minutos: Number(c.faltan) + 1 };
  if (!(await claveCorrecta(clave, String(c.clave_hash)))) {
    const fallidos = Number(c.fallidos) + 1;
    await db.execute(
      fallidos >= 5
        ? "UPDATE tienda_clientes SET fallidos = 0, bloqueado_hasta = NOW() + INTERVAL 15 MINUTE WHERE id = ?"
        : "UPDATE tienda_clientes SET fallidos = fallidos + 1 WHERE id = ?",
      [c.id],
    );
    return fallidos >= 5 ? { ok: false, motivo: "bloqueada", minutos: 15 } : { ok: false, motivo: "datos" };
  }
  if (!(await clientePorCorreo(correo))) return { ok: false, motivo: "no-es-cliente" };
  await db.execute("UPDATE tienda_clientes SET fallidos = 0, bloqueado_hasta = NULL, ultimo_ingreso = NOW() WHERE id = ?", [c.id]);
  return { ok: true, token: await firmarSesion(Number(c.id), Number(c.version), recordar) };
}

/**
 * Cambiar la contraseña desde el perfil, con la actual. Cierra las otras sesiones y devuelve una nueva para
 * este equipo. false = la actual no es correcta.
 */
export async function cambiarClave(id: number, actual: string, nueva: string, recordar: boolean): Promise<string | null> {
  await asegurarTablas();
  const [filas]: any = await db.execute("SELECT clave_hash FROM tienda_clientes WHERE id = ?", [id]);
  const c = filas?.[0];
  if (!c || !(await claveCorrecta(actual, String(c.clave_hash)))) return null;
  await db.execute(
    "UPDATE tienda_clientes SET clave_hash = ?, version = version + 1, clave_cambiada_at = NOW(), fallidos = 0, bloqueado_hasta = NULL WHERE id = ?",
    [await cifrarClave(nueva), id],
  );
  const [v]: any = await db.execute("SELECT version FROM tienda_clientes WHERE id = ?", [id]);
  return firmarSesion(id, Number(v[0].version), recordar);
}

/** Cuándo se creó el acceso, cuándo entró por última vez y cuándo cambió la contraseña. */
export async function datosAcceso(id: number) {
  await asegurarTablas();
  const [filas]: any = await db.execute(
    "SELECT DATE_FORMAT(creado_at, '%Y-%m-%d') AS creado, DATE_FORMAT(ultimo_ingreso, '%Y-%m-%d %H:%i') AS ultimo, DATE_FORMAT(clave_cambiada_at, '%Y-%m-%d') AS clave FROM tienda_clientes WHERE id = ?",
    [id],
  );
  const f = filas?.[0] || {};
  return { creado: f.creado || "", ultimoIngreso: f.ultimo || "", claveCambiada: f.clave || "" };
}

/** Cerrar la sesión en todos los equipos (sube la versión de la cuenta). */
export async function cerrarTodas(id: number): Promise<void> {
  await asegurarTablas();
  await db.execute("UPDATE tienda_clientes SET version = version + 1 WHERE id = ?", [id]);
}
