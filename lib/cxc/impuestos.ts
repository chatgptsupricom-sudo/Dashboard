/**
 * Cobros que en realidad son impuestos: retenciones (IVA, ISLR), el 25 % de IVA
 * que el cliente paga aparte (somos agentes de retención) y el IGTF. Se
 * reconocen por la descripción del pago ("25% de iva factura …", "pago IGTF
 * FACTURAS …") o por el diario ("IVA RETENIDO POR CLIENTE").
 *
 * "pago", "ABONO", "ABONO EDO DE CUENTA", un número de factura u orden NO son
 * impuesto: son cobros de facturas (nov-2026, a pedido de CxC).
 *
 * Lo usan el botón «Excluir impuestos» de Integración de Pagos y de
 * Contado/Crédito › Cobrado.
 */

// "iva" como palabra: no "activa", "efectiva", "derivados".
export const RE_IMPUESTO = /\b(iva|igtf|islr|i\.?v\.?a)\b|retenc|retenid|25\s*%/i;

/** true si la descripción del pago o el nombre del diario dicen que es un impuesto. */
export const esImpuesto = (...textos: (string | null | undefined)[]) => textos.some((t) => !!t && RE_IMPUESTO.test(t));

// Lo mismo para un dominio de Odoo (ilike no tiene "palabra"): " iva" y ">iva"
// (al empezar el <p> de la descripción en HTML) en vez de "iva".
const PATRONES_DESCRIPCION = ["25\\%", "igtf", "islr", " iva", ">iva", "retenc", "retenid"];

/**
 * Dominio de Odoo (prefijo = ruta a la línea del pago, ej. "credit_move_id.")
 * que deja fuera los pagos cuya descripción dice que es un impuesto. Los
 * asientos que no son un pago (sin `payment_id`) pasan.
 */
export function dominioSinImpuestos(prefijo: string): any[] {
  const campo = `${prefijo}payment_id.payment_description`;
  return [
    "|",
    [`${prefijo}payment_id`, "=", false],
    ...Array(PATRONES_DESCRIPCION.length - 1).fill("&"),
    ...PATRONES_DESCRIPCION.map((p) => [campo, "not ilike", p]),
  ];
}
