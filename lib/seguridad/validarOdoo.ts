import { callOdooRPC, callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Valida en Odoo la orden de despacho (stock.picking → "Hecho") cuando
 * Seguridad aprueba en el portón: ahí sale la mercancía, y ahí se descuenta
 * el inventario. Antes la validaba alguien a mano en Odoo, a veces antes de
 * que la mercancía pasara por el portón (CENT1/OUT/08530).
 *
 * - Ya "Hecha" (alguien la validó en Odoo): no se toca, se informa.
 * - `button_validate` puede devolver un asistente en vez de validar (falta un
 *   serial, confirmar SMS, cantidades menores a lo pedido…). Por la API no hay
 *   quien lo conteste: se corta con el nombre del asistente, para que se
 *   resuelva en Odoo, y el egreso no se aprueba.
 * - `skip_backorder`: si una parte no estaba reservada, Odoo crea el pedido
 *   pendiente (backorder) como hace por defecto, sin preguntar.
 *
 * Lanza con el motivo si Odoo no la deja en "Hecho".
 */
export async function validarPickingEnOdoo(pickingId: number): Promise<"validado" | "ya_estaba"> {
  const leerEstado = async () => {
    const [p] = (await callOdooRPC<any[]>("stock.picking", "read", [[pickingId], ["state", "name"]])) || [];
    if (!p) throw new Error("No se encontró la orden de despacho en Odoo");
    return p as { state: string; name: string };
  };

  const antes = await leerEstado();
  if (antes.state === "done") return "ya_estaba";
  if (antes.state === "cancel") throw new Error(`La orden ${antes.name} está cancelada en Odoo`);

  const respuesta = await callOdooRPCEstricto<any>("stock.picking", "button_validate", [[pickingId]], {
    context: { skip_backorder: true },
  });
  if (respuesta && typeof respuesta === "object" && (respuesta.res_model || respuesta.type)) {
    throw new Error(
      `Odoo pide completar "${respuesta.name || respuesta.res_model || "un asistente"}" para validar ${antes.name}: resuélvelo en Odoo y vuelve a aprobar`,
    );
  }

  const despues = await leerEstado();
  if (despues.state !== "done") {
    throw new Error(`Odoo no dejó ${despues.name} en Hecho (quedó en "${despues.state}")`);
  }
  return "validado";
}
