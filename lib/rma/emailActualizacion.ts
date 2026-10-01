import { query } from "@/lib/db";
import { emailDeContacto, origenPortal, resolverEmailCliente } from "@/lib/rma/emailReparado";
import { SLUGS_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import { urlWebhookRma } from "@/lib/rma/webhook";

/**
 * Aviso al cliente cada vez que RMA cambia el estado de un producto o le
 * agrega información (diagnóstico, notas): "así va tu servicio técnico".
 *
 * Mismo mecanismo que lib/rma/emailReparado.ts: webhook a n8n con un
 * `evento` propio (`rma_actualizacion`), fire-and-forget. n8n arma y manda el
 * correo; si en n8n no hay nada que atienda este evento, no llega nada.
 *
 * Solo casos del portal (tienen enlace de consulta). No lleva las notas ni el
 * diagnóstico escritos por el técnico: son internos. Dice qué cambió y en qué
 * estado está cada producto del envío.
 */

export type CambioRma = {
  producto: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  /** "estado" si cambió el estado; "informacion" si se agregó diagnóstico o notas. */
  tipo: "estado" | "informacion";
};

const ESTADOS: Record<string, string> = {
  recibido: "Recibido — lo estamos revisando",
  reparado: "Reparado",
  nota_credito: "Nota de crédito",
  no_procesado: "No procesado",
  reingresado: "Reingresado",
  // Para el cliente sigue en revisión: la solicitud de nota de crédito es interna.
  nc_revision: "En revisión",
};

export function enviarCorreoActualizacion(caseId: number, cambio: CambioRma, origenPeticion: string): void {
  procesar(caseId, cambio, origenPeticion).catch((e) => {
    console.error(`[rma/emailActualizacion] caso ${caseId}:`, e?.message);
  });
}

async function procesar(caseId: number, cambio: CambioRma, origenPeticion: string): Promise<void> {
  if (!urlWebhookRma()) return;

  const r = await query(
    `SELECT id, case_number, origen, company_id, odoo_partner_id, tracking_token, client_name,
            model, hardware, status
       FROM rma_cases WHERE id = ?`,
    [caseId],
  );
  const caso = (r.rows as any[])[0];
  if (!caso || caso.origen !== "portal" || !caso.tracking_token) return;

  const slug = caso.company_id ? SLUGS_SUCURSAL[caso.company_id] : undefined;
  if (!slug) return;

  const email = (await resolverEmailCliente(caso.odoo_partner_id)) || (await emailDeContacto(caso.id));
  if (!email) {
    console.warn(`[rma/emailActualizacion] caso ${caso.case_number}: sin email del cliente, se omite el aviso`);
    return;
  }

  // Estado de cada producto del envío (sin diagnóstico ni notas).
  let productos: { producto: string; serial: string | null; estado: string }[] = [];
  try {
    const p = await query(
      `SELECT model, hardware, serial, status FROM rma_case_items WHERE case_id = ? ORDER BY orden, id`,
      [caseId],
    );
    productos = (p.rows as any[]).map((x) => ({
      producto: x.model || x.hardware || "",
      serial: x.serial || null,
      estado: ESTADOS[x.status] || x.status,
    }));
  } catch {
    // Sin la tabla de productos, el del caso.
  }
  if (!productos.length) {
    productos = [{ producto: caso.model || caso.hardware || "", serial: null, estado: ESTADOS[caso.status] || caso.status }];
  }

  const link = `${origenPortal(origenPeticion)}/es/servicio-tecnico/${slug}/consultar?token=${caso.tracking_token}`;

  await fetch(urlWebhookRma()!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: "rma_actualizacion",
      correo: {
        destinatario: email,
        nombre_cliente: caso.client_name || "",
        case_number: caso.case_number,
        estado_envio: ESTADOS[caso.status] || caso.status,
        cambio: {
          ...cambio,
          estado_anterior: cambio.estado_anterior ? ESTADOS[cambio.estado_anterior] || cambio.estado_anterior : null,
          estado_nuevo: ESTADOS[cambio.estado_nuevo] || cambio.estado_nuevo,
        },
        productos,
        link_consulta: link,
      },
    }),
  });
}
