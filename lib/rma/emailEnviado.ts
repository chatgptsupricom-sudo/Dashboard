import { callOdooRPC } from "@/lib/odoo";

/**
 * Aviso de "ya enviamos tu equipo reparado" cuando el metodo de entrega es
 * agencia, disparado al subir la foto de la guia (issue: "cuando se
 * pise Marcar como entregado si es por agencia se debe adjuntar la guia").
 * Mismo mecanismo que lib/rma/emailReparado.ts: webhook a n8n,
 * fire-and-forget, reusando N8N_LEAD_WEBHOOK_URL con un `evento` distinto.
 */

export type CasoParaCorreoEnvio = {
  id: number;
  case_number: string;
  origen: string;
  odoo_partner_id: number | null;
  model: string | null;
  hardware: string | null;
  client_name: string | null;
  client_email: string | null;
  entrega_agencia: string | null;
};

/** Fire-and-forget: un fallo aca no debe tumbar la subida de la guia, que ya quedo guardada. */
export function enviarCorreoEnviadoAgencia(caso: CasoParaCorreoEnvio, guiaUrl: string): void {
  procesar(caso, guiaUrl).catch((e) => {
    console.error(`[rma/emailEnviado] caso ${caso.case_number}:`, e?.message);
  });
}

async function procesar(caso: CasoParaCorreoEnvio, guiaUrl: string): Promise<void> {
  if (!process.env.N8N_LEAD_WEBHOOK_URL) {
    console.warn("[rma/emailEnviado] N8N_LEAD_WEBHOOK_URL no configurado, se omite el correo");
    return;
  }

  // Preferir el email ya cacheado (lo dejo enviarCorreoReparado la primera
  // vez que el caso paso a "reparado") para no repetir la consulta a Odoo
  // en cada guia que se sube; si no esta, se resuelve igual que alla.
  const email = caso.client_email || (await resolverEmailCliente(caso.odoo_partner_id));
  if (!email) {
    console.warn(`[rma/emailEnviado] caso ${caso.case_number}: sin email de cliente, se omite el correo`);
    return;
  }

  await fetch(process.env.N8N_LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: "rma_producto_enviado",
      correo: {
        destinatario: email,
        nombre_cliente: caso.client_name || "",
        producto: caso.model || caso.hardware || "",
        case_number: caso.case_number,
        agencia: caso.entrega_agencia || "",
        // n8n tiene que buscar esta URL (publica, sin sesion) para poder
        // adjuntar la imagen al correo -- el webhook no manda el archivo
        // en si, mismo criterio que el link_entrega de emailReparado.ts.
        guia_url: guiaUrl,
      },
    }),
  });
}

async function resolverEmailCliente(partnerId: number | null): Promise<string | null> {
  if (!partnerId) return null;
  try {
    const partners = await callOdooRPC<any[]>(
      "res.partner",
      "search_read",
      [[["id", "=", partnerId]]],
      { fields: ["email"], limit: 1 },
    );
    const email = partners?.[0]?.email;
    return email ? String(email).trim() : null;
  } catch (e: any) {
    console.error("[rma/emailEnviado] error consultando Odoo:", e?.message);
    return null;
  }
}
