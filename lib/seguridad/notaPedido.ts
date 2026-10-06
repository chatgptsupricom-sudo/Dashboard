import { callOdooRPC } from "@/lib/odoo";

/**
 * La nota del pedido de venta en Odoo (el texto libre al pie del pedido,
 * `sale.order.note`). Ahí Ventas escribe quién retira cuando el cliente busca
 * la mercancía ("CLIENTE RETIRA", "TRANSPORTE VALDIVIESO VIENE A RETIRAR"),
 * y otras instrucciones del despacho. Almacén y Seguridad la ven en la orden
 * y en el egreso.
 *
 * Se lee de Odoo cada vez (la pueden cambiar después de armar el egreso), con
 * un minuto de memoria: el detalle del egreso se recarga con cada conteo.
 */

const MAX = 1000;
const VIGENCIA_MS = 60_000;
const memoria = new Map<string, { nota: string | null; hasta: number }>();

/** El HTML de Odoo a texto: saltos de línea por párrafo, sin etiquetas. */
export function textoDeNota(html: unknown): string | null {
  if (typeof html !== "string") return null;
  const texto = html
    .replace(/<\s*br\s*\/?>|<\/\s*(p|div|li|h[1-6])\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  return texto ? texto.slice(0, MAX) : null;
}

async function leer(clave: string, dominio: any[]): Promise<string | null> {
  const guardada = memoria.get(clave);
  if (guardada && guardada.hasta > Date.now()) return guardada.nota;
  const [pedido] =
    (await callOdooRPC<any[]>("sale.order", "search_read", [dominio], { fields: ["note"], limit: 1 })) || [];
  const nota = textoDeNota(pedido?.note);
  memoria.set(clave, { nota, hasta: Date.now() + VIGENCIA_MS });
  if (memoria.size > 500) {
    for (const [k, v] of memoria) if (v.hasta <= Date.now()) memoria.delete(k);
  }
  return nota;
}

/** Nota del pedido, por su id. null si no tiene (o si Odoo no responde). */
export async function notaDelPedido(saleId: number | null | undefined): Promise<string | null> {
  if (!saleId) return null;
  try {
    return await leer(`s${saleId}`, [["id", "=", saleId]]);
  } catch (e: any) {
    console.error(`[odoo] no se pudo leer la nota del pedido ${saleId}:`, e?.message || e);
    return null;
  }
}

/** Nota del pedido de una orden de despacho. null si no tiene pedido o nota. */
export async function notaDelPedidoDePicking(pickingId: number | null | undefined): Promise<string | null> {
  if (!pickingId) return null;
  try {
    return await leer(`p${pickingId}`, [["picking_ids", "in", [pickingId]]]);
  } catch (e: any) {
    console.error(`[odoo] no se pudo leer la nota del pedido de la orden ${pickingId}:`, e?.message || e);
    return null;
  }
}
