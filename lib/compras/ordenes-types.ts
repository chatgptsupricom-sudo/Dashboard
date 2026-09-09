// Tipos compartidos del flujo de órdenes de compra (issues #150–#157).
// Contrato de datos entre la UI (#155/#156) y la API (#153/#154).

export type OrdenEstado = "borrador" | "enviada" | "aprobada" | "rechazada";

export interface OrdenLinea {
  id?: number;
  product_odoo_id: number | null;
  product_code: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

// Ver lib/compras/odooSync.ts -- "no_aplica" es proveedor/lineas sin match
// real en Odoo (nunca se intenta escribir), no un estado transitorio.
export type OdooSyncStatus = "sincronizado" | "pendiente" | "error" | "no_aplica";

export interface OrdenResumen {
  id: number;
  order_number: string;
  company_id: number;
  supplier_name: string;
  status: OrdenEstado;
  currency: string;
  expected_date: string | null;
  total: number;
  lines_count: number;
  created_by: string;
  created_by_id: string | null;
  created_at: string;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  odoo_purchase_order_id: number | null;
  odoo_sync_status: OdooSyncStatus;
  odoo_sync_error: string | null;
}

export interface OrdenDetalle extends OrdenResumen {
  supplier_odoo_id: number | null;
  notes: string | null;
  subtotal: number;
  lines: OrdenLinea[];
  history: OrdenHistorial[];
  // Leido en vivo de Odoo en el GET de detalle -- null si no esta
  // sincronizada o si Odoo no respondio.
  odoo_live: { state: string; name: string; amount_total: number } | null;
}

export interface OrdenHistorial {
  id: number;
  from_status: OrdenEstado | null;
  to_status: OrdenEstado;
  changed_by: string;
  changed_by_role: string | null;
  comment: string | null;
  created_at: string;
}

export interface OrdenPayload {
  company_id: number;
  supplier_odoo_id: number | null;
  supplier_name: string;
  currency: string;
  expected_date: string | null;
  notes: string | null;
  lines: OrdenLinea[];
}

export interface ProveedorOdoo {
  id: number;
  name: string;
  ref?: string | null;
  email?: string | null;
}

export interface ProductoOdoo {
  id: number;
  default_code: string | null;
  name: string;
  standard_price: number;
}

export const ESTADO_LABEL: Record<OrdenEstado, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

// Clases Tailwind para el badge de cada estado (claro/oscuro).
export const ESTADO_BADGE: Record<OrdenEstado, string> = {
  borrador: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  enviada: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  aprobada: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  rechazada: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

// Color del punto que precede al texto del badge y del riel de estado en el detalle.
export const ESTADO_DOT: Record<OrdenEstado, string> = {
  borrador: "bg-slate-400",
  enviada: "bg-blue-500",
  aprobada: "bg-emerald-500",
  rechazada: "bg-red-500",
};

// Color de acento (barra lateral) para la cabecera del detalle.
export const ESTADO_ACCENT: Record<OrdenEstado, string> = {
  borrador: "bg-slate-300 dark:bg-slate-700",
  enviada: "bg-blue-500",
  aprobada: "bg-emerald-500",
  rechazada: "bg-red-500",
};

// La orden solo se puede editar / borrar en estos estados.
export const ESTADOS_EDITABLES: OrdenEstado[] = ["borrador", "rechazada"];

export function esEditable(estado: OrdenEstado): boolean {
  return ESTADOS_EDITABLES.includes(estado);
}

export function calcularLineaTotal(l: Pick<OrdenLinea, "quantity" | "unit_price">): number {
  const n = Number(l.quantity || 0) * Number(l.unit_price || 0);
  return Math.round(n * 100) / 100;
}

export function calcularTotal(lines: OrdenLinea[]): number {
  const n = lines.reduce((s, l) => s + calcularLineaTotal(l), 0);
  return Math.round(n * 100) / 100;
}

/** Nº de unidades sumadas de todas las líneas. */
export function contarUnidades(lines: OrdenLinea[]): number {
  return lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
}

export function fmtMoneda(n: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    minimumFractionDigits: 2,
  }).format(Number(n || 0));
}

/** "hace 2 días" / "hace 3 h" -- antigüedad de envío en la cola de aprobación (issue #156). */
export function tiempoDesde(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "—";
  const min = Math.floor(ms / 60000);
  if (min < 60) return `hace ${min} min`;
  const horas = Math.floor(min / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}
