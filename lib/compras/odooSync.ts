import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";

/**
 * Sincronizacion de ordenes de compra del panel con purchase.order en Odoo
 * (issue #166). Primera escritura real a Odoo de todo el panel -- por eso
 * el diseño es deliberadamente conservador:
 *
 *  - Solo se sincronizan ordenes con proveedor Y todas las lineas con datos
 *    reales de Odoo (supplier_odoo_id + product_odoo_id en cada linea). Una
 *    orden con proveedor o lineas escritas a mano nunca toca Odoo -- Odoo
 *    exige partner_id/product_id reales, y bloquear el formulario del panel
 *    por esto habria roto el flujo que #155 ya dejaba funcionando.
 *  - MySQL sigue siendo la fuente de verdad: si Odoo falla o esta caido, la
 *    orden igual se guarda en el panel; el intento fallido queda registrado
 *    en odoo_sync_status/odoo_sync_error y se reintenta en la proxima
 *    edicion o transicion de estado (mismo espiritu fire-and-forget que
 *    lib/rma/emailReparado.ts, salvo que aca SI se espera el resultado para
 *    poder mostrar el estado de inmediato en el panel).
 *  - `aprobada` en el panel confirma la PO en Odoo (button_confirm, pasa a
 *    state='purchase' -- desde ahi Odoo espera la recepcion de stock y la
 *    factura del proveedor). `reabrir` (aprobada -> borrador) intenta
 *    deshacer eso en Odoo tambien (button_cancel + button_draft) para que
 *    los dos sistemas no queden inconsistentes.
 */

type SyncStatus = "sincronizado" | "pendiente" | "error" | "no_aplica";

interface OrdenParaSync {
  id: number;
  company_id: number;
  supplier_odoo_id: number | null;
  supplier_name: string;
  currency: string;
  expected_date: string | null;
  notes: string | null;
  status: string;
  odoo_purchase_order_id: number | null;
}

interface LineaParaSync {
  product_odoo_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
}

let columnasListas: Promise<void> | null = null;

/** Idempotente -- mismo patron que el resto del modulo (ej. rma_ticket_adjuntos.tipo). */
export function ensureOdooSyncColumns(): Promise<void> {
  if (!columnasListas) {
    columnasListas = (async () => {
      const alters = [
        `ALTER TABLE purchase_orders ADD COLUMN odoo_purchase_order_id INT NULL`,
        `ALTER TABLE purchase_orders ADD COLUMN odoo_sync_status ENUM('sincronizado','pendiente','error','no_aplica') NOT NULL DEFAULT 'no_aplica'`,
        `ALTER TABLE purchase_orders ADD COLUMN odoo_sync_error TEXT NULL`,
      ];
      for (const sql of alters) {
        try {
          await query(sql);
        } catch (e: any) {
          if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) {
            console.error("[odooSync] ensureOdooSyncColumns:", e.message);
          }
        }
      }
    })();
  }
  return columnasListas;
}

/** Proveedor real de Odoo + todas las lineas con producto real de Odoo. */
function puedeSincronizar(orden: OrdenParaSync, lineas: LineaParaSync[]): boolean {
  if (!orden.supplier_odoo_id) return false;
  if (lineas.length === 0) return false;
  return lineas.every((l) => l.product_odoo_id != null);
}

// Odoo espera "YYYY-MM-DD HH:MM:SS" en sus campos Datetime -- un
// ValueError de Python si se le manda ISO 8601 ("...T00:00:00.000Z"),
// que es lo que sale de mysql2 al pasar por JSON.stringify (encontrado
// probando en vivo: expected_date rompia el create entero de la orden,
// no solo ese campo).
function formatearFechaOdoo(fecha: string | Date): string {
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 00:00:00`;
}

async function resolverMonedaOdoo(code: string): Promise<number | null> {
  const monedas = await callOdooRPC<any[]>(
    "res.currency",
    "search_read",
    [[["name", "=", code]]],
    { fields: ["id"], limit: 1 },
  );
  return monedas?.[0]?.id ?? null;
}

async function estadoOdoo(odooId: number): Promise<string | null> {
  const rows = await callOdooRPC<any[]>(
    "purchase.order",
    "search_read",
    [[["id", "=", odooId]]],
    { fields: ["state"], limit: 1 },
  );
  return rows?.[0]?.state ?? null;
}

async function marcarEstado(
  orderId: number,
  status: SyncStatus,
  odooId: number | null,
  error: string | null,
): Promise<void> {
  await query(
    `UPDATE purchase_orders SET odoo_sync_status = ?, odoo_purchase_order_id = ?, odoo_sync_error = ? WHERE id = ?`,
    [status, odooId, error, orderId],
  );
}

/**
 * Crea o actualiza el purchase.order de Odoo para esta orden, y confirma
 * (o revierte) segun el estado del panel. Nunca lanza -- cualquier error de
 * Odoo (caido, validacion, permisos) queda registrado en la fila y se
 * retorna sin tumbar al caller; la orden ya esta guardada en MySQL cuando
 * esto se llama.
 */
export async function sincronizarOrdenConOdoo(orderId: number): Promise<void> {
  try {
    await ensureOdooSyncColumns();

    const ordenResult = await query(
      `SELECT id, company_id, supplier_odoo_id, supplier_name, currency,
              expected_date, notes, status, odoo_purchase_order_id
       FROM purchase_orders WHERE id = ?`,
      [orderId],
    );
    const orden = ordenResult.rows[0] as OrdenParaSync | undefined;
    if (!orden) return;

    const lineasResult = await query(
      `SELECT product_odoo_id, description, quantity, unit_price FROM purchase_order_lines WHERE order_id = ?`,
      [orderId],
    );
    const lineas = lineasResult.rows as LineaParaSync[];

    if (!puedeSincronizar(orden, lineas)) {
      await marcarEstado(orderId, "no_aplica", orden.odoo_purchase_order_id, null);
      return;
    }

    const currencyId = await resolverMonedaOdoo(orden.currency);
    if (!currencyId) {
      await marcarEstado(
        orderId,
        "error",
        orden.odoo_purchase_order_id,
        `Moneda "${orden.currency}" no encontrada en Odoo`,
      );
      return;
    }

    const orderLineCommands = [
      [5, 0, 0], // borra todas las lineas actuales de la PO antes de reescribirlas
      ...lineas.map((l) => [
        0,
        0,
        {
          product_id: l.product_odoo_id,
          name: l.description,
          product_qty: l.quantity,
          price_unit: l.unit_price,
        },
      ]),
    ];

    const vals: Record<string, any> = {
      partner_id: orden.supplier_odoo_id,
      company_id: orden.company_id,
      currency_id: currencyId,
      notes: orden.notes || undefined,
      order_line: orderLineCommands,
    };
    if (orden.expected_date) vals.date_planned = formatearFechaOdoo(orden.expected_date);

    let odooId = orden.odoo_purchase_order_id;
    let odooState: string | null = null;

    if (odooId) {
      odooState = await estadoOdoo(odooId);
      if (odooState) {
        await callOdooRPC("purchase.order", "write", [[odooId], vals]);
      } else {
        // El id que teniamos guardado ya no existe en Odoo (borrado a mano) -- recrear.
        odooId = null;
      }
    }
    if (!odooId) {
      odooId = await callOdooRPC<number>("purchase.order", "create", [vals]);
      odooState = "draft";
    }
    if (!odooId) throw new Error("Odoo no devolvio un id de purchase.order");

    // callOdooRPC no distingue "Odoo ejecuto el metodo" de "Odoo devolvio un
    // error de negocio" (ej. una validacion que bloquea button_confirm): un
    // error de aplicacion en Odoo llega como HTTP 200 con `error` en el
    // body, axios no lo trata como falla y result queda undefined -- sin
    // esto, una confirmacion que Odoo rechazo se hubiera marcado igual como
    // "sincronizado" (encontrado probando esto en vivo). Por eso se
    // reconsulta el estado real despues de cada transicion en vez de
    // confiar en que la llamada "no lanzo".
    if (orden.status === "aprobada" && odooState !== "purchase" && odooState !== "done") {
      await callOdooRPC("purchase.order", "button_confirm", [[odooId]]);
      const nuevoEstado = await estadoOdoo(odooId);
      if (nuevoEstado !== "purchase" && nuevoEstado !== "done") {
        await marcarEstado(
          orderId,
          "error",
          odooId,
          `Odoo no confirmo la orden de compra (quedo en estado "${nuevoEstado}") -- revisar validaciones en Odoo (ej. terminos de pago, presupuesto)`,
        );
        return;
      }
    } else if (orden.status !== "aprobada" && (odooState === "purchase" || odooState === "done")) {
      // El panel dejo de tener la orden aprobada (reabrir) despues de que
      // Odoo ya la habia confirmado -- deshacer para no quedar inconsistentes.
      // Best-effort real: si Odoo no deja revertir (ej. ya factura o
      // recibida), se registra el error pero no se bloquea el resto del
      // sync -- el panel y Odoo quedan desincronizados en ese caso puntual,
      // visible en el badge.
      try {
        await callOdooRPC("purchase.order", "button_cancel", [[odooId]]);
        await callOdooRPC("purchase.order", "button_draft", [[odooId]]);
        const nuevoEstado = await estadoOdoo(odooId);
        if (nuevoEstado === "purchase" || nuevoEstado === "done") {
          await marcarEstado(
            orderId,
            "error",
            odooId,
            `No se pudo revertir la PO en Odoo a borrador (sigue en "${nuevoEstado}") -- probablemente ya tiene recepcion o factura asociada`,
          );
          return;
        }
      } catch (e: any) {
        console.error(`[odooSync] no se pudo revertir PO ${odooId} a borrador:`, e?.message);
        await marcarEstado(orderId, "error", odooId, `No se pudo revertir en Odoo: ${e?.message}`);
        return;
      }
    }

    await marcarEstado(orderId, "sincronizado", odooId, null);
  } catch (error: any) {
    console.error(`[odooSync] orden ${orderId}:`, error?.message);
    try {
      await query(
        `UPDATE purchase_orders SET odoo_sync_status = 'error', odoo_sync_error = ? WHERE id = ?`,
        [String(error?.message || error).slice(0, 2000), orderId],
      );
    } catch (e: any) {
      console.error(`[odooSync] no se pudo registrar el error de sync:`, e?.message);
    }
  }
}

/** Estado en vivo de la PO en Odoo, para mostrar en el detalle (issue #166, lectura on-demand). */
export async function leerEstadoOdoo(
  odooPurchaseOrderId: number,
): Promise<{ state: string; name: string; amount_total: number } | null> {
  try {
    const rows = await callOdooRPC<any[]>(
      "purchase.order",
      "search_read",
      [[["id", "=", odooPurchaseOrderId]]],
      { fields: ["state", "name", "amount_total"], limit: 1 },
    );
    return rows?.[0] ?? null;
  } catch (e: any) {
    console.error(`[odooSync] leerEstadoOdoo ${odooPurchaseOrderId}:`, e?.message);
    return null;
  }
}
