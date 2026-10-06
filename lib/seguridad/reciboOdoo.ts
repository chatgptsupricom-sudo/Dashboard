import { callOdooRPC, callOdooRPCEstricto } from "@/lib/odoo";

/**
 * El "Recibo de entrega" de Odoo (Imprimir › Recibo de entrega de la orden
 * de despacho) como PDF, para imprimirlo desde el panel.
 *
 * Odoo no deja pedir un reporte con la API key: `/report/pdf/...` exige una
 * sesión web y `_render_qweb_pdf` es privado. Lo que sí se puede es abrir el
 * asistente de correo de la orden con la plantilla que lleva ese reporte
 * adjunto ("Envío: enviar por correo electrónico"): al crearlo, Odoo genera
 * el PDF y lo deja como adjunto del asistente. No se envía ningún correo —
 * eso solo pasa con `action_send_mail`, que aquí no se llama.
 *
 * El adjunto se borra al terminar. El asistente no se puede borrar por la
 * API (nadie tiene ese permiso): es un registro temporal y Odoo lo limpia
 * solo.
 */

const REPORTE = "stock.report_deliveryslip";

export class ReciboNoDisponible extends Error {}

export async function reciboEntregaPdf(pickingId: number): Promise<{ nombre: string; pdf: Buffer }> {
  const [picking] =
    (await callOdooRPC<any[]>("stock.picking", "read", [[pickingId], ["state", "name"]])) || [];
  if (!picking) throw new ReciboNoDisponible("No se encontró la orden de despacho en Odoo");
  if (picking.state !== "done") {
    throw new ReciboNoDisponible(
      `La orden ${picking.name} todavía no está validada en Odoo: el recibo de entrega sale cuando se valida`,
    );
  }

  const plantillas =
    (await callOdooRPC<any[]>(
      "mail.template",
      "search_read",
      [[["model", "=", "stock.picking"], ["report_template_ids.report_name", "=", REPORTE]]],
      { fields: ["id"], order: "id asc", limit: 1 },
    )) || [];
  if (plantillas.length === 0) {
    throw new Error("Odoo no tiene la plantilla de correo con el recibo de entrega");
  }

  const asistente = await callOdooRPCEstricto<number>("mail.compose.message", "create", [
    {
      model: "stock.picking",
      res_ids: `[${pickingId}]`,
      template_id: plantillas[0].id,
      composition_mode: "comment",
    },
  ]);
  const [leido] =
    (await callOdooRPCEstricto<any[]>("mail.compose.message", "read", [[asistente], ["attachment_ids"]])) || [];
  const ids: number[] = leido?.attachment_ids || [];
  const adjuntos = ids.length
    ? (await callOdooRPCEstricto<any[]>("ir.attachment", "read", [ids, ["name", "mimetype", "res_model", "datas"]])) || []
    : [];
  // Solo los que generó el asistente: los fijos de la plantilla no se tocan.
  const generados = adjuntos.filter((a) => a.res_model === "mail.compose.message");

  try {
    const recibo = generados.find((a) => a.mimetype === "application/pdf" && a.datas);
    if (!recibo) throw new Error(`Odoo no generó el recibo de entrega de ${picking.name}`);
    return { nombre: String(recibo.name || `Recibo de entrega - ${picking.name}.pdf`), pdf: Buffer.from(recibo.datas, "base64") };
  } finally {
    if (generados.length > 0) {
      try {
        await callOdooRPCEstricto("ir.attachment", "unlink", [generados.map((a) => a.id)]);
      } catch (e: any) {
        console.error(`[odoo] no se borró el adjunto temporal del recibo de ${picking.name}:`, e?.message || e);
      }
    }
  }
}
