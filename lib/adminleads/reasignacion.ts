// Lo que deja una reasignación de lead: registro en audit_logs, aviso por
// Socket.io y a n8n (N8N_REASSIGN_WEBHOOK_URL). Lo usan /api/adminleads/reasignar
// y el paso de un lead de Excel al panel (lib/adminleads/leadsExcel.ts).
// `currentLead`: el lead con el vendedor anterior y el nuevo, con las columnas
// que lee /api/adminleads/reasignar.

import { query } from "@/lib/db";

export async function avisarReasignacion(payload: any, leadId: number, newSellerId: number, currentLead: any) {
  // Auditoría detallada
  const logSql = `
    INSERT INTO audit_logs (user_id, user_name, role, action, lead_id, changes)
    VALUES (?, ?, ?, ?, ?, ?)
  `;

  const changes = JSON.stringify({
    lead_name: currentLead.lead_name,
    from: {
      seller_name: currentLead.old_seller_name || "Sin asignar",
      cids: currentLead.old_seller_cids || "N/A",
    },
    to: {
      seller_name: currentLead.new_seller_name,
      cids: currentLead.new_seller_cids,
    },
  });

  const userId = payload.sub as string;

  await query(logSql, [
    userId,
    payload.name,
    payload.role,
    "REASSIGN",
    leadId,
    changes,
  ]);

  if ((globalThis as any).io) {
    (globalThis as any).io.emit("leads-updated", {
      action: "REASSIGN",
      leadId,
      newSellerId,
    });
  }

  // Notificar a n8n con datos de reasignación
  if (process.env.N8N_REASSIGN_WEBHOOK_URL) {
    fetch(process.env.N8N_REASSIGN_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento: "lead_reasignado",
        lead: {
          lead_id: leadId,
          nombre_contacto: currentLead.nombre_contacto ?? "",
          empresa: currentLead.lead_name ?? "",
          telefono: currentLead.telefono ?? "",
          rif: currentLead.rif ?? "",
          ubicacion_estado: currentLead.ubicacion_estado ?? "",
          ubicacion_detalle: currentLead.ubicacion_detalle ?? "",
          canal_origen: currentLead.canal_origen ?? "",
          campana: currentLead.campana ?? "",
          status: currentLead.status ?? "",
        },
        vendedor_anterior: {
          seller_id: currentLead.seller_id ?? null,
          nombre: currentLead.old_seller_name || "Sin asignar",
        },
        vendedor_nuevo: {
          seller_id: newSellerId,
          nombre: currentLead.new_seller_name || "Sin asignar",
        },
      }),
    }).catch((err) =>
      console.error("Error al notificar n8n (reasignación):", err),
    );
  }
}
