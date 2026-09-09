import { query } from "@/lib/db";

/**
 * Máquina de estados de las órdenes de compra (issues #150–#157).
 *
 *   borrador  --enviar-->  enviada
 *   rechazada --enviar-->  enviada
 *   enviada   --aprobar--> aprobada
 *   enviada   --rechazar-> rechazada
 *   aprobada  --reabrir--> borrador   (solo superadmin, para corregir un error de aprobación)
 *
 * Reglas de permisos:
 *   - `enviar`  lo hace el creador de la orden (rol `compras`) o un `superadmin`.
 *   - `aprobar` / `rechazar` / `reabrir` los hace SOLO `superadmin`.
 *
 * Cada transición deja una fila en `purchase_order_history`. Las escrituras
 * pasan por `query()` de `lib/db.ts`, así que además quedan en
 * `system_audit_log` automáticamente.
 */

export type OrdenEstado = "borrador" | "enviada" | "aprobada" | "rechazada";

export interface OrdenRow {
  id: number;
  order_number: string;
  status: OrdenEstado;
  company_id: number | null;
  supplier_name: string | null;
  supplier_odoo_id: number | null;
  created_by_id: string | null;
  created_by: string | null;
}

export interface Actor {
  id: string | null;
  name: string;
  role: string;
}

export interface TransicionResultado {
  ok: boolean;
  status: number;
  error?: string;
  order?: OrdenRow;
}

export async function getOrden(idOrNumber: string): Promise<OrdenRow | null> {
  const res = await query(
    `SELECT id, order_number, status, company_id, supplier_name, supplier_odoo_id,
            created_by_id, created_by
       FROM purchase_orders
      WHERE id = ? OR order_number = ?
      LIMIT 1`,
    [idOrNumber, idOrNumber],
  );
  return (res.rows[0] as OrdenRow) ?? null;
}

async function contarLineas(orderId: number): Promise<number> {
  const res = await query(
    `SELECT COUNT(*) AS n FROM purchase_order_lines WHERE order_id = ?`,
    [orderId],
  );
  return Number((res.rows[0] as any)?.n ?? 0);
}

async function registrarHistorial(
  orderId: number,
  from: OrdenEstado,
  to: OrdenEstado,
  actor: Actor,
  comment: string | null,
) {
  await query(
    `INSERT INTO purchase_order_history
       (order_id, from_status, to_status, changed_by, changed_by_role, comment)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [orderId, from, to, actor.name, actor.role, comment],
  );
}

function afectadas(res: { rows: any }): number {
  return Number((res.rows as any)?.affectedRows ?? 0);
}

const esSuperadmin = (actor: Actor) =>
  actor.role.toLowerCase().trim() === "superadmin";

/** compras (creador) o superadmin: borrador|rechazada -> enviada */
export async function enviarAAprobacion(
  order: OrdenRow,
  actor: Actor,
): Promise<TransicionResultado> {
  if (!esSuperadmin(actor) && order.created_by_id !== actor.id) {
    return { ok: false, status: 403, error: "Solo el creador de la orden o un superadmin pueden enviarla" };
  }
  if (order.status !== "borrador" && order.status !== "rechazada") {
    return { ok: false, status: 409, error: `No se puede enviar una orden en estado "${order.status}"` };
  }
  if (!order.company_id || !order.supplier_name) {
    return { ok: false, status: 422, error: "La orden necesita sede y proveedor antes de enviarse" };
  }
  if ((await contarLineas(order.id)) === 0) {
    return { ok: false, status: 422, error: "La orden no tiene líneas" };
  }

  const upd = await query(
    `UPDATE purchase_orders
        SET status = 'enviada', submitted_at = NOW(), rejection_reason = NULL
      WHERE id = ? AND status IN ('borrador', 'rechazada')`,
    [order.id],
  );
  if (afectadas(upd) === 0) {
    return { ok: false, status: 409, error: "El estado de la orden cambió, recarga e intenta de nuevo" };
  }
  await registrarHistorial(order.id, order.status, "enviada", actor, null);
  return { ok: true, status: 200, order: { ...order, status: "enviada" } };
}

/** superadmin: enviada -> aprobada */
export async function aprobarOrden(
  order: OrdenRow,
  actor: Actor,
): Promise<TransicionResultado> {
  if (!esSuperadmin(actor)) {
    return { ok: false, status: 403, error: "Solo un superadmin puede aprobar órdenes" };
  }
  if (order.status !== "enviada") {
    return { ok: false, status: 409, error: `Solo se aprueban órdenes en estado "enviada" (esta está "${order.status}")` };
  }

  const upd = await query(
    `UPDATE purchase_orders
        SET status = 'aprobada', approved_by = ?, approved_at = NOW()
      WHERE id = ? AND status = 'enviada'`,
    [actor.name, order.id],
  );
  if (afectadas(upd) === 0) {
    return { ok: false, status: 409, error: "El estado de la orden cambió, recarga e intenta de nuevo" };
  }
  await registrarHistorial(order.id, "enviada", "aprobada", actor, null);
  return { ok: true, status: 200, order: { ...order, status: "aprobada" } };
}

/** superadmin: enviada -> rechazada (motivo obligatorio) */
export async function rechazarOrden(
  order: OrdenRow,
  actor: Actor,
  motivo: string,
): Promise<TransicionResultado> {
  if (!esSuperadmin(actor)) {
    return { ok: false, status: 403, error: "Solo un superadmin puede rechazar órdenes" };
  }
  if (order.status !== "enviada") {
    return { ok: false, status: 409, error: `Solo se rechazan órdenes en estado "enviada" (esta está "${order.status}")` };
  }
  const razon = (motivo ?? "").trim();
  if (!razon) {
    return { ok: false, status: 422, error: "El motivo del rechazo es obligatorio" };
  }

  const upd = await query(
    `UPDATE purchase_orders
        SET status = 'rechazada', rejection_reason = ?
      WHERE id = ? AND status = 'enviada'`,
    [razon, order.id],
  );
  if (afectadas(upd) === 0) {
    return { ok: false, status: 409, error: "El estado de la orden cambió, recarga e intenta de nuevo" };
  }
  await registrarHistorial(order.id, "enviada", "rechazada", actor, razon);
  return { ok: true, status: 200, order: { ...order, status: "rechazada" } };
}

/** superadmin: aprobada -> borrador (deshacer una aprobación) */
export async function reabrirOrden(
  order: OrdenRow,
  actor: Actor,
  motivo: string | null,
): Promise<TransicionResultado> {
  if (!esSuperadmin(actor)) {
    return { ok: false, status: 403, error: "Solo un superadmin puede reabrir órdenes" };
  }
  if (order.status !== "aprobada") {
    return { ok: false, status: 409, error: `Solo se reabren órdenes "aprobada" (esta está "${order.status}")` };
  }

  const upd = await query(
    `UPDATE purchase_orders
        SET status = 'borrador', approved_by = NULL, approved_at = NULL, submitted_at = NULL
      WHERE id = ? AND status = 'aprobada'`,
    [order.id],
  );
  if (afectadas(upd) === 0) {
    return { ok: false, status: 409, error: "El estado de la orden cambió, recarga e intenta de nuevo" };
  }
  await registrarHistorial(order.id, "aprobada", "borrador", actor, (motivo ?? "").trim() || null);
  return { ok: true, status: 200, order: { ...order, status: "borrador" } };
}

export function actorDePayload(payload: any): Actor {
  return {
    id: (payload?.sub as string) ?? null,
    name: (payload?.name as string) ?? "desconocido",
    role: (payload?.role as string) ?? "",
  };
}
