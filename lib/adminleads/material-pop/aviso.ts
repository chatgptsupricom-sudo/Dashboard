import { listarSolicitudes } from "@/lib/adminleads/material-pop/requests";
import { NOMBRE_UBICACION } from "@/lib/adminleads/material-pop/notaEntrega";

/**
 * Correos de las solicitudes de material POP, en tres momentos:
 *
 *   creada    → adminLeads de la sede            · copia a Gabriel Camacho
 *   aprobada  → vendedor que hizo la solicitud   · copia a Gabriel Camacho
 *   entregada → vendedor que hizo la solicitud   · copia a Juan Villanueva y Gabriel Camacho
 *
 * Todos van al flujo de n8n "Material POP - Avisos" (webhook `pop-notify`),
 * que se configura en `N8N_POP_WEBHOOK_URL`. No hay respaldo a la URL de
 * leads: ese flujo asigna leads a vendedores y no mira el `evento`, así que el
 * aviso terminaría en ninguna parte (es lo que pasó con los de RMA).
 *
 * El panel NO manda direcciones: manda la sede (creada) o el id del vendedor
 * en `users_config` (aprobada, entregada), y n8n busca el correo. Las copias
 * fijas viven en el nodo "Armar correo" del flujo. El webhook es público, y si
 * aceptara una dirección cualquiera serviría para mandar correos a quien sea
 * desde la cuenta de la empresa.
 *
 * Fire-and-forget: si n8n falla, la acción igual queda hecha en el panel.
 */
export type EventoAviso = "creada" | "aprobada" | "entregada";

export function avisarSolicitud(
  evento: EventoAviso,
  solicitudId: number,
  cids: number | null,
  origenPeticion: string,
  extra: { ubicacion?: string; entregadoPor?: string } = {},
): void {
  procesarAviso(evento, solicitudId, cids, origenPeticion, extra).catch((e) => {
    console.error(`[material-pop/aviso] ${evento} solicitud ${solicitudId}:`, e?.message);
  });
}

async function procesarAviso(
  evento: EventoAviso,
  solicitudId: number,
  cids: number | null,
  origenPeticion: string,
  extra: { ubicacion?: string; entregadoPor?: string },
): Promise<void> {
  const url = process.env.N8N_POP_WEBHOOK_URL;
  if (!url) return;

  const [solicitud] = await listarSolicitudes({ cids, id: solicitudId });
  if (!solicitud) return;
  // Aprobada y entregada van al vendedor: sin su id no hay a quién buscar.
  if (evento !== "creada" && !solicitud.sellerUserId) {
    console.warn(`[material-pop/aviso] ${solicitud.code} no tiene vendedor: no se avisa`);
    return;
  }

  const origen = origenPeticion.replace(/\/+$/, "");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: `pop_solicitud_${evento}`,
      cids,
      seller_user_id: solicitud.sellerUserId,
      solicitud: {
        codigo: solicitud.code,
        vendedor: solicitud.sellerName,
        cliente: solicitud.clientName,
        // Sin cliente: el correo dice "para uso interno" en vez del cliente.
        uso_interno: solicitud.usoInterno,
        condicion: solicitud.usoInterno
          ? null
          : solicitud.deliveryCondition === "al_comprar"
            ? "Contra la compra del cliente"
            : "Entrega inmediata",
        orden_odoo: solicitud.odooOrderName,
        notas: solicitud.notes,
        fecha: solicitud.createdAt,
        revisado_por: solicitud.reviewedByName,
        fecha_revision: solicitud.reviewedAt,
        notas_revision: solicitud.reviewNotes,
        // La entrega no guarda quién la hizo en la solicitud (queda en los
        // movimientos): la ruta lo pasa aparte.
        entregado_por: extra.entregadoPor || null,
        fecha_entrega: solicitud.deliveredAt,
        ubicacion: extra.ubicacion ? NOMBRE_UBICACION[extra.ubicacion] || extra.ubicacion : null,
        total_unidades: solicitud.items.reduce((s, it) => s + it.quantity, 0),
        // Lo libre de cada producto (stock menos lo ya comprometido) va en el
        // correo de solicitud nueva: sin abrir el panel se ve si se puede
        // aprobar. Lo aprobado, en los de aprobada y entregada.
        items: solicitud.items.map((it) => ({
          codigo: it.code,
          producto: it.name,
          marca: it.brand,
          cantidad: it.quantity,
          aprobada: it.approvedQuantity,
          disponible: Math.max(0, it.stockTotal - it.reservadoOtras),
        })),
      },
      link:
        evento === "creada"
          ? `${origen}/es/adminleads/material-pop?tab=requests`
          : `${origen}/es/vendedores/material-pop`,
    }),
  });
  if (!res.ok) {
    console.error(`[material-pop/aviso] n8n respondió ${res.status} (${evento} ${solicitud.code})`);
  }
}
