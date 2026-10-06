import { db } from "@/lib/db";

/**
 * Cuánto cuesta el Agente IA: una fila por mensaje respondido, con los tokens
 * que cobró la API de Claude y su costo en USD. Tabla agenteia_consumo, se
 * crea sola. Se ve en Configuración › Consumo (solo SuperAdmin).
 *
 * El costo es una estimación con los precios de lista de abajo: no incluye lo
 * que la API cobra aparte por búsquedas web y por el contenedor de código, ni
 * los títulos de los chats (Haiku, fracciones de centavo).
 */

// USD por millón de tokens (precios de lista de la API de Claude, sept. 2026).
// Escribir en caché cuesta 1,25× la entrada (caché de 5 minutos).
const PRECIOS: [prefijo: string, entrada: number, salida: number, cacheLectura: number][] = [
  ["claude-opus-5-5", 4, 20, 0.2],
  ["claude-opus-5", 5, 25, 0.5],
  ["claude-sonnet-5-5", 2, 10, 0.2],
  ["claude-sonnet-5", 2, 10, 0.2],
  ["claude-haiku-4-5", 1, 5, 0.1],
];

export type Uso = { entrada: number; salida: number; cacheEscritura: number; cacheLectura: number };
export const usoVacio = (): Uso => ({ entrada: 0, salida: 0, cacheEscritura: 0, cacheLectura: 0 });

/** Costo en USD de un uso de tokens; 0 si el modelo no está en la tabla de precios. */
export function costoUsd(modelo: string, u: Uso): number {
  // El prefijo más largo gana: "claude-opus-5-5" antes que "claude-opus-5".
  const p = PRECIOS.filter(([prefijo]) => modelo.startsWith(prefijo)).sort((a, b) => b[0].length - a[0].length)[0];
  if (!p) return 0;
  const [, entrada, salida, lectura] = p;
  return (u.entrada * entrada + u.cacheEscritura * entrada * 1.25 + u.cacheLectura * lectura + u.salida * salida) / 1_000_000;
}

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenteia_consumo (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      uid VARCHAR(120) NOT NULL,
      email VARCHAR(190) NOT NULL,
      nombre VARCHAR(190) NULL,
      chat_id VARCHAR(40) NULL,
      modelo VARCHAR(64) NOT NULL,
      tokens_entrada INT NOT NULL DEFAULT 0,
      tokens_salida INT NOT NULL DEFAULT 0,
      tokens_cache_escritura INT NOT NULL DEFAULT 0,
      tokens_cache_lectura INT NOT NULL DEFAULT 0,
      costo_usd DECIMAL(12,6) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_fecha (created_at),
      KEY idx_chat (uid, chat_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

export async function registrarConsumo(c: {
  uid: string;
  email: string;
  nombre: string;
  chatId: string | null;
  modelo: string;
  uso: Uso;
  costo: number;
}) {
  await ensureTabla();
  await db.execute(
    `INSERT INTO agenteia_consumo
       (uid, email, nombre, chat_id, modelo, tokens_entrada, tokens_salida, tokens_cache_escritura, tokens_cache_lectura, costo_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [c.uid, c.email, c.nombre || null, c.chatId, c.modelo, c.uso.entrada, c.uso.salida, c.uso.cacheEscritura, c.uso.cacheLectura, c.costo.toFixed(6)],
  );
}

// Medianoche de hoy y del día 1 del mes en Caracas (UTC−4 fijo, sin horario de verano).
function cortesCaracas() {
  const ahora = new Date(Date.now() - 4 * 3600_000);
  const [a, m, d] = [ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()];
  return { hoy: new Date(Date.UTC(a, m, d, 4)), mes: new Date(Date.UTC(a, m, 1, 4)) };
}

/** Totales de hoy y del mes, costo por usuario y por conversación, y los últimos mensajes (de todos los usuarios). */
export async function resumenConsumo() {
  await ensureTabla();
  const { hoy, mes } = cortesCaracas();
  const [[totales]]: any = await db.query(
    `SELECT COALESCE(SUM(IF(created_at >= ?, costo_usd, 0)), 0) AS hoy,
            COALESCE(SUM(IF(created_at >= ?, 1, 0)), 0) AS mensajes_hoy,
            COALESCE(SUM(costo_usd), 0) AS mes,
            COUNT(*) AS mensajes_mes
     FROM agenteia_consumo WHERE created_at >= ?`,
    [hoy, hoy, mes],
  );
  // El título sale de agenteia_chats si esa tabla existe (la crea la API de chats).
  const conversaciones = async (conTitulo: boolean) =>
    (
      await db.query(
        `SELECT c.chat_id, MAX(c.email) AS email, MAX(c.nombre) AS nombre, ${conTitulo ? "MAX(ch.titulo)" : "NULL"} AS titulo,
                COUNT(*) AS mensajes, SUM(c.costo_usd) AS costo, MAX(c.created_at) AS ultimo
         FROM agenteia_consumo c
         ${conTitulo ? "LEFT JOIN agenteia_chats ch ON ch.uid = c.uid AND ch.id = c.chat_id" : ""}
         WHERE c.created_at >= ?
         GROUP BY c.uid, c.chat_id ORDER BY ultimo DESC LIMIT 100`,
        [mes],
      )
    )[0];
  const porConversacion = await conversaciones(true).catch(() => conversaciones(false));
  const [porUsuario] = await db.query(
    `SELECT email, MAX(nombre) AS nombre, COUNT(*) AS mensajes, SUM(costo_usd) AS costo,
            SUM(IF(created_at >= ?, costo_usd, 0)) AS hoy, MAX(created_at) AS ultimo
     FROM agenteia_consumo WHERE created_at >= ?
     GROUP BY email ORDER BY costo DESC`,
    [hoy, mes],
  );
  const [mensajes] = await db.query(
    `SELECT id, email, nombre, chat_id, modelo, tokens_entrada, tokens_salida, tokens_cache_escritura, tokens_cache_lectura,
            costo_usd AS costo, created_at
     FROM agenteia_consumo ORDER BY id DESC LIMIT 100`,
  );
  const n = (v: unknown) => Number(v) || 0;
  return {
    hoy: n(totales.hoy),
    mensajesHoy: n(totales.mensajes_hoy),
    mes: n(totales.mes),
    mensajesMes: n(totales.mensajes_mes),
    usuarios: (porUsuario as any[]).map((u) => ({ ...u, mensajes: n(u.mensajes), costo: n(u.costo), hoy: n(u.hoy) })),
    conversaciones: (porConversacion as any[]).map((c) => ({ ...c, mensajes: n(c.mensajes), costo: n(c.costo) })),
    mensajes: (mensajes as any[]).map((m) => ({ ...m, costo: n(m.costo) })),
  };
}
