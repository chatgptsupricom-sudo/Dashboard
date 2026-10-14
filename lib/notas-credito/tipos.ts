/**
 * Notas de crédito con aprobación en cadena (lo que se puede importar desde
 * el cliente: sin base ni Odoo). La lógica está en lib/notas-credito/*.
 *
 * Valencia (9):
 *   - Equipo de RMA que no se puede reparar: RMA la solicita → la preaprueba
 *     Rangel (un filtro, para que a Gabriel no le lleguen todas) → la aprueba
 *     Gabriel Camacho → le llega a Victor como orden de crédito y la hace.
 *   - Cualquier otra: la crea Rangel y va directo a Gabriel → Victor.
 *   Si Rangel o Gabriel la rechazan, no procede.
 *
 * Caracas y Panamá todavía no tienen flujo: las solicitudes de RMA de esas
 * sedes le siguen llegando solo al Super Admin, como antes.
 */

export type EstadoNC = "por_preaprobar" | "por_aprobar" | "aprobada" | "procesada" | "rechazada";
export type OrigenNC = "rma" | "directa";

/**
 * Pasos del flujo, cada uno con sus responsables por sede (tabla
 * nc_aprobadores). "preaprueba" además crea las notas que no vienen de RMA.
 */
export type PasoNC = "preaprueba" | "aprueba" | "procesa";
export const PASOS: PasoNC[] = ["preaprueba", "aprueba", "procesa"];

export const ETIQUETA_PASO: Record<PasoNC, string> = {
  preaprueba: "Preaprueba",
  aprueba: "Aprueba",
  procesa: "Hace la nota de crédito",
};

export const DESCRIPCION_PASO: Record<PasoNC, string> = {
  preaprueba: "Filtra las solicitudes de RMA y crea las notas de crédito que no vienen de RMA.",
  aprueba: "Aprueba o rechaza. Es el único que puede aprobar una nota de crédito.",
  procesa: "Recibe la orden de crédito aprobada y la hace, en el panel o en Odoo.",
};

/** Sedes con el flujo definido. Para sumar Caracas, se agrega aquí (y sus responsables en la pantalla). */
export const SEDES_CON_FLUJO = [9];

export const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

export function tieneFlujo(companyId: number | null | undefined): boolean {
  return SEDES_CON_FLUJO.includes(Number(companyId));
}

export function estadoInicial(origen: OrigenNC): EstadoNC {
  return origen === "rma" ? "por_preaprobar" : "por_aprobar";
}

/** Quién tiene la solicitud en sus manos en cada estado. */
export const PASO_DEL_ESTADO: Partial<Record<EstadoNC, PasoNC>> = {
  por_preaprobar: "preaprueba",
  por_aprobar: "aprueba",
  aprobada: "procesa",
};

export const ETIQUETA_ESTADO: Record<EstadoNC, string> = {
  por_preaprobar: "Por preaprobar",
  por_aprobar: "Por aprobar",
  aprobada: "Aprobada · por hacer",
  procesada: "Hecha en Odoo",
  rechazada: "Rechazada",
};

export const COLOR_ESTADO: Record<EstadoNC, string> = {
  por_preaprobar: "bg-amber-100 text-amber-800 border-amber-200",
  por_aprobar: "bg-orange-100 text-orange-800 border-orange-200",
  aprobada: "bg-blue-100 text-blue-800 border-blue-200",
  procesada: "bg-emerald-100 text-emerald-800 border-emerald-200",
  rechazada: "bg-rose-100 text-rose-800 border-rose-200",
};

export const ESTADOS_ABIERTOS: EstadoNC[] = ["por_preaprobar", "por_aprobar", "aprobada"];

export type AccionNC =
  | "preaprobar"
  | "aprobar"
  | "rechazar"
  | "factura"
  | "crear_odoo"
  | "guardar_borrador"
  | "publicar"
  | "vincular"
  | "sincronizar";

export type SolicitudNC = {
  id: number;
  company_id: number;
  origen: OrigenNC;
  rma_nota_id: number | null;
  case_id: number | null;
  item_id: number | null;
  case_number: string | null;
  producto: string | null;
  serial: string | null;
  estado: EstadoNC;
  estado_rma_previo: string | null;
  odoo_product_id: number | null;
  factura_id: number | null;
  factura_nombre: string | null;
  partner_id: number | null;
  cliente: string | null;
  moneda: string | null;
  monto: number | null;
  total_factura: number | null;
  motivo: string;
  creado_por: string | null;
  creado_email: string | null;
  created_at: string;
  preaprobado_por: string | null;
  preaprobado_at: string | null;
  aprobado_por: string | null;
  aprobado_at: string | null;
  rechazado_por: string | null;
  rechazado_at: string | null;
  rechazado_paso: PasoNC | null;
  motivo_rechazo: string | null;
  odoo_move_id: number | null;
  odoo_move_nombre: string | null;
  odoo_estado: string | null;
  odoo_total: number | null;
  procesado_por: string | null;
  procesado_at: string | null;
};

export type LineaBorrador = {
  id: number;
  producto: string;
  descripcion: string;
  cantidad: number;
  precio: number;
  subtotal: number;
  total: number;
  impuestos: string;
};

export type BorradorNC = {
  id: number;
  nombre: string;
  estado: string;
  ref: string;
  nro_ctrl: string;
  fecha: string | null;
  moneda: string;
  total: number;
  base: number;
  lineas: LineaBorrador[];
  url: string;
};

export type CandidataNC = { id: number; nombre: string; estado: string; total: number; fecha: string | null; creado_por: string };

export function formatoMonto(v: number | null | undefined, moneda?: string | null): string {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${moneda || "USD"}`;
}
