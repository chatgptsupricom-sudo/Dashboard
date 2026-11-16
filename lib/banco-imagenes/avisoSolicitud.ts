import { tocaAvisoAvance } from "@/lib/banco-imagenes/solicitudes";

/**
 * Correos de las solicitudes de flyers, por el flujo de n8n de
 * `N8N_FLYER_WEBHOOK_URL`:
 *
 *   creada               → AdminLeads de la sede
 *   aprobada, rechazada  → vendedor
 *   avance               → vendedor, como mucho uno por día por solicitud
 *   completada           → vendedor
 *
 * El panel manda solo `{ evento, solicitud_id, link }`: n8n lee la solicitud y
 * los correos de la MySQL (`flyer_solicitudes`, `users_config`). El webhook es
 * público; si aceptara direcciones, serviría para mandar correos a cualquiera.
 *
 * Fire-and-forget: si n8n falla, la acción igual queda hecha. Sin la variable
 * no se avisa.
 */
export type EventoFlyer = "creada" | "aprobada" | "rechazada" | "avance" | "completada";

export function avisarFlyer(evento: EventoFlyer, solicitudId: number, origen: string): void {
  enviar(evento, solicitudId, origen).catch((e) => {
    console.error(`[flyers/aviso] ${evento} solicitud ${solicitudId}:`, e?.message);
  });
}

async function enviar(evento: EventoFlyer, solicitudId: number, origen: string) {
  const url = process.env.N8N_FLYER_WEBHOOK_URL;
  if (!url) return;
  if (evento === "avance" && !(await tocaAvisoAvance(solicitudId))) return;
  const base = origen.replace(/\/+$/, "");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento,
      solicitud_id: solicitudId,
      link:
        evento === "creada"
          ? `${base}/es/adminleads/banco-imagenes?tab=solicitudes`
          : `${base}/es/vendedores/banco-imagenes?tab=solicitudes`,
    }),
  });
  if (!res.ok) console.error(`[flyers/aviso] n8n respondió ${res.status} (${evento} ${solicitudId})`);
}

/** Avisos de lo que dejó una subida o un descarte. */
export function avisarAvance(r: { conAvance: number[]; completadas: number[] }, origen: string) {
  for (const id of r.completadas) avisarFlyer("completada", id, origen);
  for (const id of r.conAvance) avisarFlyer("avance", id, origen);
}
