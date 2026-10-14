import { asegurarAprobadoresGuardados } from "@/lib/notas-credito/datos";
import type { SolicitudNC } from "@/lib/notas-credito/tipos";

/**
 * Correos del flujo de notas de crédito, al flujo de n8n "Notas de Crédito -
 * Avisos" (webhook `nc-notify`, se configura en `N8N_NC_WEBHOOK_URL`; sin
 * ella no se avisa). Sale de la cuenta del panel, como Material POP.
 *
 *   preaprobar  → quien preaprueba en la sede (Rangel)              · solicitud de RMA nueva
 *   aprobar     → quien aprueba (Gabriel)                           · preaprobada, o creada directa
 *   procesar    → quien hace la NC (Victor), copia a quien la pidió · aprobada
 *   rechazada   → quien la pidió (copia a quien la preaprobó, si la rechazó Gabriel)
 *   procesada   → quien la pidió                                    · la NC quedó publicada en Odoo
 *
 * El panel NO manda direcciones ni textos: solo el aviso y el id de la
 * solicitud. n8n lee la solicitud (nc_solicitudes) y los responsables
 * (nc_aprobadores) de la MySQL del panel. El webhook es público: si aceptara
 * direcciones o textos, serviría para mandar correos a cualquiera desde la
 * cuenta de la empresa. Por eso los responsables tienen que estar guardados
 * en la tabla (asegurarAprobadoresGuardados).
 *
 * Fire-and-forget: si n8n falla, la solicitud igual avanza en el panel.
 */
export type AvisoNC = "preaprobar" | "aprobar" | "procesar" | "rechazada" | "procesada";

export function avisarNC(aviso: AvisoNC, sol: SolicitudNC, _origenPeticion?: string): void {
  procesar(aviso, sol).catch((e) => {
    console.error(`[notas-credito/aviso] ${aviso} NC-${sol.id}:`, e?.message);
  });
}

async function procesar(aviso: AvisoNC, sol: SolicitudNC): Promise<void> {
  const url = process.env.N8N_NC_WEBHOOK_URL;
  if (!url) return;
  await asegurarAprobadoresGuardados(sol.company_id);
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: "nc_flujo", aviso, solicitud_id: sol.id }),
  });
  if (!r.ok) console.error(`[notas-credito/aviso] ${aviso} NC-${sol.id}: n8n respondió ${r.status}`);
}
