// Tipos y etiquetas de las órdenes de compra leídas de Odoo
// (lib/compras/ordenesOdoo.ts). Aparte para que la pantalla no importe el
// código de servidor.

export type EstadoOdoo = "draft" | "sent" | "to approve" | "purchase" | "done" | "cancel";

/** Grupos de las pestañas: solicitud de cotización, orden de compra, cancelada. */
export type GrupoOdoo = "solicitud" | "orden" | "cancelada";

export const GRUPO_DE_ESTADO: Record<EstadoOdoo, GrupoOdoo> = {
  draft: "solicitud",
  sent: "solicitud",
  "to approve": "solicitud",
  purchase: "orden",
  done: "orden",
  cancel: "cancelada",
};

// Mismos nombres que muestra Odoo en español.
export const ESTADO_ODOO_LABEL: Record<EstadoOdoo, string> = {
  draft: "Solicitud de cotización",
  sent: "SdC enviada",
  "to approve": "Para aprobar",
  purchase: "Orden de compra",
  done: "Bloqueada",
  cancel: "Cancelada",
};

export const RECEPCION_LABEL: Record<string, string> = {
  pending: "Sin recibir",
  partial: "Parcial",
  full: "Recibida",
};

export const FACTURA_LABEL: Record<string, string> = {
  no: "Nada que facturar",
  "to invoice": "Por facturar",
  invoiced: "Facturada",
};

export interface OrdenOdoo {
  id: number;
  name: string;
  state: EstadoOdoo;
  company_id: number;
  supplier_name: string;
  partner_ref: string | null;
  origin: string | null;
  currency: string;
  amount_total: number;
  date_order: string | null;
  date_approve: string | null;
  date_planned: string | null;
  buyer: string | null;
  receipt_status: string | null;
  invoice_status: string | null;
  lines_count: number;
  /** Orden del panel que creó esta en Odoo, si la hay. */
  panel_order_id: number | null;
}

export interface LineaOdoo {
  id: number;
  product_code: string | null;
  description: string;
  quantity: number;
  qty_received: number;
  qty_invoiced: number;
  unit_price: number;
  subtotal: number;
}
