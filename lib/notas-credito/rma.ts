import { query } from "@/lib/db";
import { ensureTablas } from "@/lib/notas-credito/datos";
import {
  espejarEnProductoUnico,
  espejarPrimeroEnCaso,
  leerProductos,
  sincronizarEnvio,
  type EstadoProducto,
} from "@/lib/rma/items";

/**
 * Lo que el flujo de notas de crédito le hace al caso de RMA:
 *   solicitada        → el producto pasa a "NC en revisión" (se guarda en qué estado estaba)
 *   rechazada         → vuelve a ese estado y RMA decide qué hacer
 *   aprobada (Gabriel) → "Nota de Crédito"
 * Con varios productos se mueve el del pedido y el envío se recalcula
 * (sincronizarEnvio); con uno, el caso y su producto juntos.
 */
export async function moverEstadoRma(datos: {
  caseId: number;
  itemId: number | null;
  nuevo: EstadoProducto;
  por: string;
  nota: string;
  origenPeticion: string;
}): Promise<EstadoProducto | null> {
  const productos = await leerProductos(datos.caseId);
  const producto = datos.itemId ? productos.find((p) => p.id === datos.itemId) : null;

  if (productos.length > 1 && producto) {
    if (producto.status === datos.nuevo) return producto.status;
    await query(`UPDATE rma_case_items SET status = ? WHERE id = ?`, [datos.nuevo, producto.id]);
    await query(
      `INSERT INTO rma_history (case_id, item_id, from_status, to_status, changed_by, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [datos.caseId, producto.id, producto.status, datos.nuevo, datos.por, datos.nota.slice(0, 1000)],
    );
    await espejarPrimeroEnCaso(datos.caseId);
    await sincronizarEnvio(datos.caseId, { changedBy: datos.por, origenPeticion: datos.origenPeticion });
    return producto.status;
  }

  const r = await query(`SELECT status FROM rma_cases WHERE id = ?`, [datos.caseId]);
  const antes = (r.rows as any[])[0]?.status as EstadoProducto | undefined;
  if (!antes) return null;
  if (antes === datos.nuevo) return antes;
  await query(`UPDATE rma_cases SET status = ? WHERE id = ?`, [datos.nuevo, datos.caseId]);
  await query(
    `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes) VALUES (?, ?, ?, ?, ?)`,
    [datos.caseId, antes, datos.nuevo, datos.por, datos.nota.slice(0, 1000)],
  );
  await espejarEnProductoUnico(datos.caseId, { status: datos.nuevo });
  return antes;
}

/**
 * Para los PUT del caso y del producto: un equipo en "NC en revisión" con una
 * solicitud del flujo abierta no se mueve a mano (lo mueve la decisión).
 * Los casos "nc_revision" del flujo anterior no tienen fila aquí y siguen
 * moviéndose a mano.
 */
export async function errorNotaEnCurso(caseId: number, itemId: number | null, actual: string): Promise<string | null> {
  if (actual !== "nc_revision") return null;
  try {
    await ensureTablas();
    const r = await query(
      `SELECT id FROM nc_solicitudes
        WHERE case_id = ? AND estado IN ('por_preaprobar','por_aprobar')${itemId ? " AND (item_id = ? OR item_id IS NULL)" : ""}
        LIMIT 1`,
      itemId ? [caseId, itemId] : [caseId],
    );
    const fila = (r.rows as any[])[0];
    return fila ? `Este equipo espera la decisión de la nota de crédito NC-${fila.id}: no se mueve a mano.` : null;
  } catch {
    return null;
  }
}
