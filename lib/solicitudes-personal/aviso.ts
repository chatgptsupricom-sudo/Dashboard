/**
 * Correos de las solicitudes de personal, al flujo de n8n "Solicitudes de
 * Personal - Avisos" (webhook `personal-notify`, en `N8N_PERSONAL_WEBHOOK_URL`;
 * sin ella no se avisa). Sale de la cuenta del panel, como Material POP.
 *
 *   nueva      → los SuperAdmin                                   · el gerente la creó
 *   aprobada   → RRHH de la sede (o sin sede) · copia: quien la pidió (también la que crea el SuperAdmin)
 *   rechazada  → quien la pidió, con el motivo
 *   cubierta   → quien la pidió                                   · se contrataron las vacantes
 *   pausada    → quien la pidió, con el motivo                    · RRHH pausó la requisición
 *   cancelada  → quien la pidió, con el motivo                    · RRHH canceló la requisición
 *
 * Como en notas de crédito, el panel solo manda el aviso y el id: n8n lee la
 * solicitud y los destinatarios (users_config + roles) de la MySQL. El webhook
 * es público; si aceptara direcciones, serviría para mandar correos a
 * cualquiera desde la cuenta de la empresa.
 *
 * Fire-and-forget: si n8n falla, la solicitud igual avanza en el panel.
 */
export type AvisoPersonal = "nueva" | "aprobada" | "rechazada" | "cubierta" | "pausada" | "cancelada";

export function avisarPersonal(aviso: AvisoPersonal, solicitudId: number): void {
  const url = process.env.N8N_PERSONAL_WEBHOOK_URL;
  if (!url) return;
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ evento: "personal_solicitud", aviso, solicitud_id: solicitudId }),
  })
    .then((r) => {
      if (!r.ok) console.error(`[solicitudes-personal/aviso] ${aviso} SP-${solicitudId}: n8n respondió ${r.status}`);
    })
    .catch((e) => console.error(`[solicitudes-personal/aviso] ${aviso} SP-${solicitudId}:`, e?.message));
}
