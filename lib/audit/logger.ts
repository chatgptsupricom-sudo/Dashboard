import type { Pool } from "mysql2/promise";
import jwt from "jsonwebtoken";
import { cookies } from "next/headers";
import { jwtSecretString } from "@/lib/secretos";

/**
 * Interceptor de mutaciones para lib/db.ts::query().
 *
 * La app nunca escribe a Odoo (0 llamadas create/write/unlink vía
 * callOdooRPC en todo app/, verificado antes de diseñar esto) — todas las
 * mutaciones reales pasan por aquí. Se activa solo para INSERT/UPDATE/
 * DELETE; los SELECT (la inmensa mayoría de las ~93 llamadas a query())
 * salen por el filtro rápido de detectarAccion() sin ningún costo extra.
 *
 * El antes/después estructurado SOLO se resuelve para el patrón dominante
 * confirmado en el repo — `UPDATE/DELETE ... WHERE <col> = ?` con el valor
 * como ÚLTIMO parámetro, sin AND/OR/rangos después. Fuera de eso (WHERE
 * compuesto, columna literal como `WHERE provider = 'google'`, SET
 * dinámico con subconsulta, etc.) se registra igual quién/cuándo/la
 * sentencia y los parámetros crudos, pero before/after quedan NULL —
 * mejor no capturar el diff que capturarlo mal.
 *
 * El "quién" se resuelve leyendo la cookie de sesión DIRECTO acá, con
 * `cookies()` de next/headers, en vez de recibirlo de un contexto seteado
 * por el guard de turno (AsyncLocalStorage con `enterWith`, probado y
 * descartado: el contexto se perdía justo al volver de la función que
 * verifica el JWT — aparenta ser un problema de propagación entre jose/
 * WebCrypto y AsyncLocalStorage en este runtime, no algo confiable). Esto
 * además evita depender de que cada uno de los ~6 puntos de verificación
 * de sesión del repo coopere: como es Next quien garantiza que `cookies()`
 * funcione en cualquier punto de la ejecución de un Route Handler, esto
 * cubre el 100% de las escrituras sin tocar ninguno de los ~200 route.ts.
 */
async function resolverActor(): Promise<{
  userId: string | null;
  userName: string | null;
  userRole: string | null;
}> {
  try {
    const store = await cookies();
    const token = store.get("token")?.value;
    if (!token) return { userId: null, userName: null, userRole: null };
    const payload = jwt.verify(token, jwtSecretString()) as Record<string, unknown>;
    return {
      userId: (payload.sub as string) ?? null,
      userName: (payload.name as string) ?? null,
      userRole: (payload.role as string) ?? null,
    };
  } catch {
    return { userId: null, userName: null, userRole: null };
  }
}

const MAX_STRING_LEN = 2000;

// Nombres de columna que nunca deben llegar en claro al log (ej.
// google_tokens.access_token/refresh_token, visibles en el panel de
// auditoria para roles no-superadmin). Coincide por substring, no exacto,
// para cubrir variantes (access_token, refresh_token, api_key, etc.).
const CAMPOS_SECRETOS = /token|secret|password|contrasena|contraseña|credential|api[_-]?key/i;

function sanitizarValor(v: unknown, campo?: string | null): unknown {
  if (v === null || v === undefined) return v;
  if (campo && CAMPOS_SECRETOS.test(campo)) return "[redactado]";
  if (Buffer.isBuffer(v)) return `[binario omitido, ${v.length} bytes]`;
  if (typeof v === "string" && v.length > MAX_STRING_LEN) {
    return `${v.slice(0, MAX_STRING_LEN)}… [truncado, ${v.length} caracteres]`;
  }
  return v;
}

function sanitizarFila(row: unknown): Record<string, unknown> | null {
  if (!row || typeof row !== "object") return null;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(row as Record<string, unknown>)) {
    out[k] = sanitizarValor(val, k);
  }
  return out;
}

// Para sql_params (array posicional, sin nombre de columna) hace falta
// mapear cada `?` de la sentencia a su columna. Solo cubre el patron
// dominante confirmado en el repo (columnas explicitas en INSERT, `col = ?`
// en UPDATE) — mismo criterio conservador que extraerWhereSimple: si no
// matchea, esa posicion queda sin nombre y sanitizarValor solo aplica el
// chequeo de largo/buffer, igual que antes de este cambio.
function extraerColumnasParaParams(sql: string, accion: Accion): (string | null)[] {
  if (accion === "INSERT") {
    // Solo la primera tupla VALUES(...) (ignora ON DUPLICATE KEY UPDATE):
    // hay que casar cada columna con su valor porque no todos son `?` (ej.
    // "INSERT INTO google_tokens (provider, access_token, ...) VALUES
    // ('google', ?, ...)" — provider es literal, no ocupa una posicion en
    // params).
    const m = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?\w+`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (!m) return [];
    const columnas = m[1].split(",").map((c) => c.trim().replace(/`/g, ""));
    const valores = m[2].split(",").map((v) => v.trim());
    const resultado: (string | null)[] = [];
    for (let i = 0; i < valores.length; i++) {
      if (valores[i] === "?") resultado.push(columnas[i] ?? null);
    }
    return resultado;
  }
  if (accion === "UPDATE") {
    const setMatch = sql.match(/UPDATE\s+`?\w+`?\s+SET\s+([\s\S]+?)(?:\bWHERE\b|$)/i);
    const whereMatch = sql.match(/\bWHERE\b([\s\S]+)$/i);
    const resultado: (string | null)[] = [];
    if (setMatch) {
      for (const parte of setMatch[1].split(",")) {
        const pm = parte.match(/`?(\w+)`?\s*=\s*\?/);
        if (pm) resultado.push(pm[1]);
      }
    }
    if (whereMatch) {
      const wParts = whereMatch[1].match(/`?(\w+)`?\s*=\s*\?/g) || [];
      for (const w of wParts) {
        const wm = w.match(/`?(\w+)`?\s*=\s*\?/)!;
        resultado.push(wm[1]);
      }
    }
    return resultado;
  }
  return [];
}

type Accion = "INSERT" | "UPDATE" | "DELETE";

export function detectarAccion(sql: string): Accion | null {
  const s = sql.trim();
  if (/^INSERT\b/i.test(s)) return "INSERT";
  if (/^UPDATE\b/i.test(s)) return "UPDATE";
  if (/^DELETE\b/i.test(s)) return "DELETE";
  return null;
}

function extraerTabla(sql: string, accion: Accion): string | null {
  let m: RegExpMatchArray | null = null;
  if (accion === "INSERT") {
    m = sql.match(/INSERT\s+(?:IGNORE\s+)?INTO\s+`?(\w+)`?/i);
  } else if (accion === "UPDATE") {
    m = sql.match(/UPDATE\s+`?(\w+)`?\s+SET/i);
  } else {
    m = sql.match(/DELETE\s+FROM\s+`?(\w+)`?/i);
  }
  return m?.[1] ?? null;
}

// Solo matchea un WHERE de una sola igualdad al final de la sentencia — ver
// el comentario de arriba sobre por qué no se intenta nada más ambicioso.
function extraerWhereSimple(sql: string): { columna: string } | null {
  const m = sql.trim().match(/WHERE\s+`?(\w+)`?\s*=\s*\?\s*;?\s*$/i);
  return m ? { columna: m[1] } : null;
}

async function leerFilaPorColumna(
  db: Pool,
  tabla: string,
  columna: string,
  valor: any,
): Promise<Record<string, unknown> | null> {
  try {
    const [rows] = await db.execute(
      `SELECT * FROM \`${tabla}\` WHERE \`${columna}\` = ? LIMIT 1`,
      [valor],
    );
    const row = Array.isArray(rows) ? (rows as any[])[0] : null;
    return sanitizarFila(row);
  } catch {
    // Columna/tabla no existe tal cual se parseó, o algo no coincide con lo
    // esperado — se deja sin resolver en vez de arriesgar un error.
    return null;
  }
}

/**
 * Se llama ANTES de ejecutar la sentencia real, para capturar el estado
 * previo — después de la mutación ya sería tarde. Es la única parte del
 * interceptor que agrega latencia real al camino crítico (un SELECT extra),
 * y solo cuando el WHERE matchea el patrón simple; para todo lo demás
 * retorna de inmediato sin tocar la base.
 */
export async function capturarAntes(
  db: Pool,
  sql: string,
  params: unknown[] | undefined,
): Promise<Record<string, unknown> | null> {
  const accion = detectarAccion(sql);
  if (accion !== "UPDATE" && accion !== "DELETE") return null;

  const tabla = extraerTabla(sql, accion);
  const where = extraerWhereSimple(sql);
  if (!tabla || !where) return null;

  const p = params ?? [];
  const valor = p[p.length - 1];
  if (valor === undefined) return null;

  return leerFilaPorColumna(db, tabla, where.columna, valor);
}

/**
 * Se llama DESPUÉS de que la sentencia real ya se ejecutó con éxito.
 * Fire-and-forget desde lib/db.ts::query() — nunca debe bloquear ni hacer
 * fallar la respuesta al cliente por un problema de logging.
 */
export async function registrarMutacion(
  db: Pool,
  sql: string,
  params: unknown[] | undefined,
  resultMeta: any,
  antes: Record<string, unknown> | null,
): Promise<void> {
  try {
    const accion = detectarAccion(sql);
    if (!accion) return;

    const actor = await resolverActor();
    const tabla = extraerTabla(sql, accion);
    const p = params ?? [];

    let despues: Record<string, unknown> | null = null;
    let recordId: string | null = null;

    if (accion === "INSERT") {
      const insertId = resultMeta?.insertId;
      if (insertId && tabla) {
        recordId = String(insertId);
        despues = await leerFilaPorColumna(db, tabla, "id", insertId);
      }
    } else {
      const where = extraerWhereSimple(sql);
      if (where && tabla) {
        const valor = p[p.length - 1];
        recordId = valor != null ? String(valor) : null;
        if (accion === "UPDATE" && valor !== undefined) {
          despues = await leerFilaPorColumna(db, tabla, where.columna, valor);
        }
        // DELETE: la fila ya no existe, "despues" se deja null a propósito
        // (no es un error de parseo, es el estado real post-borrado).
      }
    }

    const columnasParams = extraerColumnasParaParams(sql, accion);
    const paramsSanitizados = p.map((val, i) => sanitizarValor(val, columnasParams[i]));

    await db.execute(
      `INSERT INTO system_audit_log
        (user_id, user_name, user_role, method, path, table_name, record_id, sql_text, sql_params, before_data, after_data, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ok')`,
      [
        actor.userId,
        actor.userName,
        actor.userRole,
        // No hay forma confiable de leer el metodo/ruta HTTP desde aca sin
        // el mismo relay entre-funciones que ya se descarto arriba — se usa
        // el tipo de sentencia SQL como "method" (dice mas sobre que paso
        // que adivinar si fue un POST/PUT/PATCH) y path queda sin resolver.
        accion,
        null,
        tabla,
        recordId,
        sql,
        JSON.stringify(paramsSanitizados),
        antes ? JSON.stringify(antes) : null,
        despues ? JSON.stringify(despues) : null,
      ],
    );
  } catch (e: any) {
    // Un fallo de auditoría jamás debe tumbar la operación real que ya se
    // ejecutó con éxito — solo se registra en consola del servidor.
    console.error("[audit] no se pudo registrar la mutación:", e?.message);
  }
}
