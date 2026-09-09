import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { SLUGS_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";

/**
 * Aviso de "tu equipo esta reparado" (issue #119), con el link a la pagina
 * donde el cliente elige como recibirlo (issue #121). Se manda por webhook
 * a n8n -- mismo patron fire-and-forget que ya usa
 * app/api/servicio-tecnico/ticket/route.ts para notificar tickets nuevos
 * (reusa N8N_LEAD_WEBHOOK_URL con un `evento` distinto, en vez de un env
 * var nuevo, para no duplicar configuracion).
 *
 * n8n es quien arma y manda el correo de verdad del lado de alla -- este
 * modulo solo junta los datos y dispara el webhook.
 */

export type CasoParaCorreo = {
  id: number;
  case_number: string;
  origen: string;
  company_id: number | null;
  odoo_partner_id: number | null;
  tracking_token: string | null;
  model: string | null;
  hardware: string | null;
  client_name: string | null;
};

/**
 * Origen publico del PORTAL de servicio tecnico (no necesariamente el mismo
 * host que el panel administrativo, que es desde donde se dispara esto).
 * Si no esta configurado, se cae al origen de la propia peticion -- correcto
 * solo si panel y portal viven en el mismo dominio.
 */
function origenPortal(origenPeticion: string): string {
  return process.env.NEXT_PUBLIC_SERVICIO_TECNICO_URL || origenPeticion;
}

/**
 * Fire-and-forget: no lanza. Un fallo aca (Odoo caido, n8n caido, correo
 * faltante) no debe tumbar el cambio de estado del caso, que ya quedo
 * guardado en rma_cases antes de llamar esto.
 */
export function enviarCorreoReparado(caso: CasoParaCorreo, origenPeticion: string): void {
  procesar(caso, origenPeticion).catch((e) => {
    console.error(`[rma/emailReparado] caso ${caso.case_number}:`, e?.message);
  });
}

async function procesar(caso: CasoParaCorreo, origenPeticion: string): Promise<void> {
  // Solo los casos del portal tienen tracking_token, y por lo tanto una
  // pagina publica a la que mandar al cliente -- los casos creados
  // internamente (ingreso de Seguridad) no tienen ese link.
  if (caso.origen !== "portal" || !caso.tracking_token) {
    console.warn(`[rma/emailReparado] caso ${caso.case_number}: no es del portal o sin tracking_token, se omite el correo`);
    return;
  }

  if (!process.env.N8N_LEAD_WEBHOOK_URL) {
    console.warn("[rma/emailReparado] N8N_LEAD_WEBHOOK_URL no configurado, se omite el correo");
    return;
  }

  const sucursalSlug = caso.company_id ? SLUGS_SUCURSAL[caso.company_id] : undefined;
  if (!sucursalSlug) {
    console.warn(`[rma/emailReparado] caso ${caso.case_number}: sucursal (company_id=${caso.company_id}) sin slug conocido, se omite el correo`);
    return;
  }

  const email = await resolverEmailCliente(caso.odoo_partner_id);
  if (!email) {
    console.warn(`[rma/emailReparado] caso ${caso.case_number}: sin email de cliente en Odoo, se omite el correo`);
    return;
  }

  // Backfill de client_email para referencia/auditoria -- no bloquea el
  // envio si falla.
  query(`UPDATE rma_cases SET client_email = ? WHERE id = ?`, [email, caso.id]).catch((e: any) => {
    console.error(`[rma/emailReparado] caso ${caso.case_number}: no se pudo guardar client_email:`, e?.message);
  });

  const link = `${origenPortal(origenPeticion)}/es/servicio-tecnico/${sucursalSlug}/entrega/${caso.tracking_token}`;

  await fetch(process.env.N8N_LEAD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      evento: "rma_equipo_reparado",
      correo: {
        destinatario: email,
        nombre_cliente: caso.client_name || "",
        producto: caso.model || caso.hardware || "",
        case_number: caso.case_number,
        link_entrega: link,
      },
    }),
  });
}

/** Email real (sin enmascarar) del partner en Odoo -- solo para uso interno/envio, nunca para exponer en una API publica. */
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
    console.error("[rma/emailReparado] error consultando Odoo:", e?.message);
    return null;
  }
}
