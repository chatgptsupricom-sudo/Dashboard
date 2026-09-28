import { randomBytes } from "crypto";

/**
 * Lo que comparten los dos endpoints del portal que crean un caso en
 * rma_cases: el de productos comprados en Supricom (con factura,
 * app/api/servicio-tecnico/ticket) y el de equipos externos (sin factura,
 * app/api/servicio-tecnico/externo).
 *
 * Los dos numeran igual, generan el token igual y enlazan las fotos igual: si
 * cada uno lo hiciera a su manera, dos reportes simultáneos (uno de cada tipo)
 * podrían pisarse el número de caso sin que el reintento lo detecte.
 */

/** Intentos del INSERT cuando choca el case_number o el tracking_token. */
export const MAX_REINTENTOS = 5;

/** Para escribir dentro de la conexión dedicada de quien llama. */
type Conexion = { execute: (sql: string, params?: any[]) => Promise<any> };

// Genera el siguiente case_number consultando el maximo actual.
// Si dos requests obtienen el mismo numero, el INSERT va a fallar por UNIQUE
// y reintentamos. Esto es preferible a un lock de tabla porque el portal
// publico va a tener picos de carga impredecibles.
export async function siguienteNumeroCaso(conn: Conexion): Promise<string> {
  // conn.execute() devuelve [filas, campos]. Ojo: NO tiene .rows — eso lo pone
  // el wrapper `query()` de lib/db.ts, que sí desestructura. Leyendo .rows
  // sobre la conexión cruda sale siempre undefined.
  const [filas] = (await conn.execute(
    `SELECT case_number FROM rma_cases ORDER BY id DESC LIMIT 1`
  )) as [any[], any];

  let nextNum = 1;
  if (filas.length > 0) {
    const lastNum = parseInt(filas[0].case_number, 10);
    if (!Number.isFinite(lastNum)) {
      // Si el case_number no es numerico (caso legacy), seguimos con count().
      const [conteo] = (await conn.execute(
        `SELECT COUNT(*) AS total FROM rma_cases`
      )) as [any[], any];
      nextNum = (conteo?.[0]?.total || 0) + 1;
    } else {
      nextNum = lastNum + 1;
    }
  }
  return String(nextNum).padStart(4, "0");
}

// Genera un token de seguimiento: 32 bytes random en hex.
// crypto.randomBytes es cryptographically secure.
export function generarTrackingToken(): string {
  return randomBytes(32).toString("hex");
}

/** Si el error del INSERT es un choque de case_number o tracking_token (se reintenta). */
export function esChoqueReintentable(e: any): boolean {
  const msg = String(e?.message || "");
  return (
    msg.includes("Duplicate entry") &&
    (msg.includes("case_number") || msg.includes("tracking_token"))
  );
}

// Asegura que las columnas del portal existan (idempotente).
// Asi el portal funciona aunque no se haya corrido el ALTER manualmente.
export async function asegurarColumnasPortal(conn: Conexion) {
  const alters = [
    // client_phone NO es una columna del portal: está en sql/rma_cases.sql
    // desde el principio y el módulo RMA interno también inserta en ella. Pero
    // faltaba en la base del entorno de prueba, así que el schema del repo y el
    // real habían divergido. Se incluye acá para que cualquier entorno con esa
    // misma laguna se arregle solo — si falta, no se puede guardar el teléfono
    // de contacto, que es la mitad del sentido de un reporte.
    `ALTER TABLE rma_cases ADD COLUMN client_phone VARCHAR(50) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN origen ENUM('interno','portal') DEFAULT 'interno'`,
    `ALTER TABLE rma_cases ADD COLUMN tracking_token VARCHAR(64) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN odoo_partner_id INT DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN odoo_product_id INT DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN serial VARCHAR(100) DEFAULT NULL`,
    // Garantía congelada al momento del reporte (issue #29).
    `ALTER TABLE rma_cases ADD COLUMN garantia_estado VARCHAR(20) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN garantia_meses INT DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN garantia_vence DATE DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN garantia_marca VARCHAR(100) DEFAULT NULL`,
    // Equipos que no se compraron en Supricom (sql/rma_cases_producto_externo.sql).
    `ALTER TABLE rma_cases ADD COLUMN producto_externo TINYINT(1) NOT NULL DEFAULT 0`,
    `ALTER TABLE rma_cases ADD COLUMN client_document VARCHAR(30) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN contacto_email VARCHAR(200) DEFAULT NULL`,
    // Ya la agrega lib/rma/rutasEnvio.ts; se repite porque el portal de
    // equipos externos la llena al crear el caso.
    `ALTER TABLE rma_cases ADD COLUMN client_email VARCHAR(200) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD INDEX idx_origen (origen)`,
  ];
  for (const sql of alters) {
    try {
      await conn.execute(sql);
    } catch (e: any) {
      if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) {
        console.error("[portal-ticket] ensurePortalColumns:", e.message);
      }
    }
  }
  try {
    await conn.execute(
      `ALTER TABLE rma_cases ADD UNIQUE INDEX uk_tracking_token (tracking_token)`,
    );
  } catch (e: any) {
    // Duplicate index o duplicate entry, ignorar.
    if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) {
      // Si falla por "Duplicate entry", significa que ya hay duplicados
      // y debemos limpiar primero. Pero en un deploy limpio esto no pasa.
      console.error("[portal-ticket] uk_tracking_token:", e.message);
    }
  }
}

/**
 * Enlaza las fotos que se subieron con el token temporal de cada producto al
 * caso recién creado, y las pasa al token definitivo del ticket (que es con el
 * que después se sirven). Cada foto queda con su producto; sin la migración
 * de rma_case_items (no hay ids), solo con el caso.
 */
export async function enlazarAdjuntos(
  conn: Conexion,
  caseId: number,
  trackingToken: string,
  tokensSubida: string[],
  idsProductos: number[],
): Promise<void> {
  for (const [i, tokenSubida] of tokensSubida.entries()) {
    const itemId = idsProductos.length === tokensSubida.length ? idsProductos[i] : null;
    await conn.execute(
      itemId
        ? `UPDATE rma_ticket_adjuntos SET ticket_id = ?, tracking_token = ?, item_id = ?
            WHERE tracking_token = ? AND ticket_id IS NULL`
        : `UPDATE rma_ticket_adjuntos SET ticket_id = ?, tracking_token = ?
            WHERE tracking_token = ? AND ticket_id IS NULL`,
      itemId
        ? [caseId, trackingToken, itemId, tokenSubida]
        : [caseId, trackingToken, tokenSubida],
    );
  }
}
