/**
 * «Mi cuenta» de la tienda web (odoo/landing/mi-cuenta.html): reglas puras. Sin Odoo ni base de datos;
 * chequeo: `node scripts/check-tienda-web.cjs`.
 *
 * Quién puede tener cuenta: un correo que esté en la ficha de un cliente en Odoo (no del grupo). Crea su
 * acceso con un código que le llega a ese correo y elige su contraseña. Ve solo lo de su empresa: las
 * fichas con ese correo y las que tienen su mismo RIF/RUC, en las tres sedes.
 */

export const SEDE_DE_COMPANIA: Record<number, { id: string; nombre: string }> = {
  9: { id: "valencia", nombre: "Valencia" },
  10: { id: "caracas", nombre: "Caracas" },
  7: { id: "panama", nombre: "Panamá" },
};
export const COMPANIAS_TIENDA = [9, 10, 7];

const CORREO = /^[^\s@<>,;"']+@[^\s@<>,;"']+\.[a-z]{2,}$/i;
export function normalizarCorreo(v: unknown): string | null {
  const c = String(v ?? "").trim().toLowerCase();
  return c.length <= 160 && CORREO.test(c) ? c : null;
}

/** Correos de la empresa: no pueden ser cuenta de cliente (verían lo de los clientes que los tienen cargados). */
export const esCorreoInterno = (correo: string) => /@(supricom\.com\.ve|supricom\.com|supricom\.com\.pa|ofimaster\.com)$/i.test(correo);

/** Contraseña: 8 a 72 caracteres, con al menos una letra y un número. null = sirve; si no, qué le falta. */
export function problemaContrasena(v: unknown): string | null {
  const c = String(v ?? "");
  if (c.length < 8) return "La contraseña necesita al menos 8 caracteres";
  if (c.length > 72) return "La contraseña puede tener hasta 72 caracteres";
  if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(c) || !/\d/.test(c)) return "La contraseña necesita letras y números";
  return null;
}

/** Código de 6 dígitos (lo genera el servidor con crypto.randomInt). */
export const codigoValido = (v: unknown) => /^\d{6}$/.test(String(v ?? "").trim());

/** RIF/RUC para comparar fichas: sin guiones, puntos ni espacios, en mayúsculas. */
export const claveDocumento = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** El tramo de números más largo de un RIF/RUC tal como está en Odoo («J-31737690-0» → «31737690»), para buscarlo. */
export function nucleoDocumento(v: unknown): string | null {
  const tramos = String(v ?? "").match(/\d+/g) || [];
  const largo = tramos.reduce((a, b) => (b.length > a.length ? b : a), "");
  return largo.length >= 6 ? largo : null;
}

/* ------------------------------------------------------------------ Pedidos */
export type EtapaPedido = "cotizacion" | "confirmado" | "despachado" | "facturado" | "anulado";

/**
 * Etapa de un pedido de Odoo para el cliente: cotización (borrador o enviada) → confirmado → despachado
 * (delivery_status = full) → facturado (invoice_status = invoiced). Lo anulado aparte.
 */
export function etapaPedido(p: { state?: string; delivery_status?: string | false; invoice_status?: string }): EtapaPedido {
  if (p.state === "cancel") return "anulado";
  if (p.state === "draft" || p.state === "sent") return "cotizacion";
  if (p.invoice_status === "invoiced") return "facturado";
  if (p.delivery_status === "full") return "despachado";
  return "confirmado";
}
export const NOMBRE_ETAPA: Record<EtapaPedido, string> = {
  cotizacion: "Cotización",
  confirmado: "Confirmado",
  despachado: "Despachado",
  facturado: "Facturado",
  anulado: "Anulado",
};

/* ------------------------------------------------------------------ Facturas */
export type EstadoFactura = "pagada" | "parcial" | "pendiente" | "vencida" | "nota";

/** Estado de una factura para el cliente, con la fecha de hoy (AAAA-MM-DD, Caracas). */
export function estadoFactura(f: { move_type?: string; payment_state?: string; amount_residual?: number; invoice_date_due?: string | false }, hoy: string): EstadoFactura {
  if (f.move_type === "out_refund") return "nota";
  const saldo = Math.abs(Number(f.amount_residual) || 0);
  if (saldo < 0.005 || f.payment_state === "paid" || f.payment_state === "in_payment" || f.payment_state === "reversed") return "pagada";
  if (f.invoice_date_due && f.invoice_date_due < hoy) return "vencida";
  return f.payment_state === "partial" ? "parcial" : "pendiente";
}
export const NOMBRE_ESTADO_FACTURA: Record<EstadoFactura, string> = {
  pagada: "Pagada",
  parcial: "Abono parcial",
  pendiente: "Por pagar",
  vencida: "Vencida",
  nota: "Nota de crédito",
};

/** Días de atraso (o que faltan, en negativo) de un vencimiento contra hoy. */
export function diasDeAtraso(vence: string | false | null | undefined, hoy: string): number | null {
  if (!vence) return null;
  const a = Date.UTC(+vence.slice(0, 4), +vence.slice(5, 7) - 1, +vence.slice(8, 10));
  const b = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export const redondear = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
