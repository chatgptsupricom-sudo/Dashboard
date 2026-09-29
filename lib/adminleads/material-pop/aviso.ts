import { listarSolicitudes } from "@/lib/adminleads/material-pop/requests";

/**
 * Correo al adminLeads de la sede cuando un vendedor crea una solicitud de
 * material POP.
 *
 * Va al flujo de n8n "Material POP - Avisos" (webhook `pop-notify`), que se
 * configura en `N8N_POP_WEBHOOK_URL`. No hay respaldo a la URL de leads: ese
 * flujo asigna leads a vendedores y no mira el `evento`, así que el aviso
 * terminaría en ninguna parte (es lo que pasó con los de RMA).
 *
 * El panel NO manda destinatarios: n8n busca los correos de los adminLeads de
 * la sede en `users_config`. El webhook es público, y si aceptara una
 * dirección cualquiera serviría para mandar correos a quien sea desde la
 * cuenta de la empresa.
 *
 * Fire-and-forget: si n8n falla, la solicitud igual queda creada y aparece en
 * la pestaña Solicitudes con su contador de pendientes.
 */
export function avisarSolicitudCreada(solicitudId: number, cids: number, origenPeticion: string): void {
  procesarAviso(solicitudId, cids, origenPeticion).catch((e) => {
    console.error(`[material-pop/aviso] solicitud ${solicitudId}:`, e?.message);
  });
}

async function procesarAviso(solicitudId: number, cids: number, origenPeticion: string): Promise<void> {
  const url = process.env.N8N_POP_WEBHOOK_URL;
  if (!url) return;

  const [solicitud] = await listarSolicitudes({ cids, id: solicitudId });
  if (!solicitud) return;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: "pop_solicitud_creada",
      cids,
      solicitud: {
        codigo: solicitud.code,
        vendedor: solicitud.sellerName,
        cliente: solicitud.clientName,
        condicion:
          solicitud.deliveryCondition === "al_comprar"
            ? "Contra la compra del cliente"
            : "Entrega inmediata",
        orden_odoo: solicitud.odooOrderName,
        notas: solicitud.notes,
        fecha: solicitud.createdAt,
        total_unidades: solicitud.items.reduce((s, it) => s + it.quantity, 0),
        // Lo libre de cada producto (stock menos lo ya comprometido) va en el
        // correo: sin abrir el panel se ve si la solicitud se puede aprobar.
        items: solicitud.items.map((it) => ({
          codigo: it.code,
          producto: it.name,
          marca: it.brand,
          cantidad: it.quantity,
          disponible: Math.max(0, it.stockTotal - it.reservadoOtras),
        })),
      },
      link: `${origenPeticion.replace(/\/+$/, "")}/es/adminleads/material-pop?tab=requests`,
    }),
  });
  if (!res.ok) {
    console.error(`[material-pop/aviso] n8n respondió ${res.status} para la solicitud ${solicitudId}`);
  }
}
