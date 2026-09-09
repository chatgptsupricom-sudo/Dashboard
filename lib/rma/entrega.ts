import { query } from "@/lib/db";
import { matchCiudadARuta } from "@/lib/rma/rutasEnvio";

/**
 * Elección del cliente de cómo recibir su equipo reparado (issue #121).
 * Columnas nuevas en `rma_cases`, mismo patrón de auto-migración que
 * `ensurePortalColumns` / `ensureRutasEnvioSchema` -- se crean solas la
 * primera vez que algo de este módulo las necesita.
 *
 * `entrega_datos` es JSON de propósito general para lo que cada método
 * necesite (hoy nada, más adelante los datos de contacto para la agencia
 * del issue #124 y el estado de revisión de Seguridad del issue #123).
 */

let entregaSchemaListo: Promise<void> | null = null;

export function ensureEntregaSchema(): Promise<void> {
  if (!entregaSchemaListo) {
    entregaSchemaListo = crearSchema().catch((e) => {
      console.error("[rma/entrega] ensureEntregaSchema:", e?.message);
      entregaSchemaListo = null; // reintentar en la proxima llamada
      throw e;
    });
  }
  return entregaSchemaListo;
}

async function crearSchema(): Promise<void> {
  const alters = [
    `ALTER TABLE rma_cases ADD COLUMN entrega_metodo ENUM('sucursal','ruta','agencia') DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN entrega_ciudad VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN entrega_ruta_id INT DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN entrega_agencia VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN entrega_datos JSON DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN entrega_elegida_at TIMESTAMP DEFAULT NULL`,
  ];
  for (const sql of alters) {
    try {
      await query(sql);
    } catch (e: any) {
      if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) throw e;
    }
  }
}

export type CasoEntrega = {
  id: number;
  case_number: string;
  status: string;
  product_name: string;
  company_id: number | null;
  entrega_metodo: "sucursal" | "ruta" | "agencia" | null;
  entrega_ciudad: string | null;
  entrega_agencia: string | null;
  entrega_elegida_at: string | null;
};

/**
 * Busca el caso por tracking_token, solo origen='portal' -- mismo criterio
 * de privacidad que app/api/servicio-tecnico/ticket/[token]/route.ts (los
 * casos creados internamente no tienen link publico).
 */
export async function obtenerCasoPorToken(token: string): Promise<CasoEntrega | null> {
  const { rows } = await query(
    `SELECT id, case_number, status, model, hardware, company_id,
            entrega_metodo, entrega_ciudad, entrega_agencia, entrega_elegida_at
     FROM rma_cases
     WHERE tracking_token = ? AND origen = 'portal'
     LIMIT 1`,
    [token],
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  return {
    id: row.id,
    case_number: row.case_number,
    status: row.status,
    product_name: row.model || row.hardware || "",
    company_id: row.company_id,
    entrega_metodo: row.entrega_metodo,
    entrega_ciudad: row.entrega_ciudad,
    entrega_agencia: row.entrega_agencia,
    entrega_elegida_at: row.entrega_elegida_at,
  };
}

export type EleccionEntrega =
  | { metodo: "sucursal" }
  | { metodo: "ruta"; ciudad: string }
  | { metodo: "agencia"; agencia: string; datos: Record<string, string> };

export type ResultadoEleccion =
  | { ok: true; rutaNombre?: string }
  | { ok: false; error: "SIN_COBERTURA" };

/**
 * Guarda la elección del cliente. Solo se llama sobre un caso que TODAVIA
 * no tiene entrega_metodo -- el endpoint es quien decide si re-mostrar la
 * eleccion existente en vez de aceptar una nueva (ver route.ts).
 */
export async function guardarEleccionEntrega(
  caseId: number,
  eleccion: EleccionEntrega,
): Promise<ResultadoEleccion> {
  if (eleccion.metodo === "ruta") {
    const ruta = await matchCiudadARuta(eleccion.ciudad);
    if (!ruta) return { ok: false, error: "SIN_COBERTURA" };

    await query(
      `UPDATE rma_cases
       SET entrega_metodo = 'ruta', entrega_ciudad = ?, entrega_ruta_id = ?, entrega_elegida_at = NOW()
       WHERE id = ?`,
      [eleccion.ciudad, ruta.id, caseId],
    );
    return { ok: true, rutaNombre: ruta.nombre };
  }

  if (eleccion.metodo === "agencia") {
    await query(
      `UPDATE rma_cases
       SET entrega_metodo = 'agencia', entrega_agencia = ?, entrega_datos = ?, entrega_elegida_at = NOW()
       WHERE id = ?`,
      [eleccion.agencia, JSON.stringify(eleccion.datos), caseId],
    );
    return { ok: true };
  }

  await query(
    `UPDATE rma_cases SET entrega_metodo = 'sucursal', entrega_elegida_at = NOW() WHERE id = ?`,
    [caseId],
  );
  return { ok: true };
}
