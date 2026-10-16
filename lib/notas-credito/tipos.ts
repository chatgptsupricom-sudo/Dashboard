/**
 * Notas de crédito con aprobación en cadena (lo que se puede importar desde
 * el cliente: sin base ni Odoo). La lógica está en lib/notas-credito/*.
 *
 * Mismo flujo en Valencia, Caracas y Panamá; lo que cambia por sede son los
 * responsables de cada paso (usuarios de users_config, uno o varios):
 *   - Equipo de RMA que no se puede reparar: RMA la solicita → la preaprueba
 *     "preaprueba" (un filtro, para que a quien aprueba no le lleguen todas) →
 *     la aprueba "aprueba" → le llega a "procesa" como orden de crédito.
 *   - Cualquier otra: la crea "preaprueba" eligiendo la factura y sus
 *     productos (con serial); nace preaprobada y va directo a "aprueba" →
 *     "procesa". Quien procesa no crea solicitudes: hace la NC en Odoo.
 *   - Pedida por el cliente en su servicio aparte (NC_HOSTS, /<idioma>/notas-credito):
 *     factura + RIF, productos con serial y motivo; espera la preaprobación
 *     como una de RMA, y el cliente la sigue con su enlace (tracking_token).
 *   Si la rechazan en preaprobación o aprobación, no procede.
 *
 * Cada quien ve lo de su paso (vistasDe); el SuperAdmin y quien aprueba ven
 * además todo el flujo de la sede.
 *
 * Una sede tiene el flujo activo cuando los tres pasos tienen al menos una
 * persona (flujoCompleto). Mientras no, sus solicitudes de RMA le siguen
 * llegando solo al Super Admin, como antes.
 */

export type EstadoNC = "por_preaprobar" | "por_aprobar" | "aprobada" | "procesada" | "rechazada";
export type OrigenNC = "rma" | "directa" | "cliente";

export const ETIQUETA_ORIGEN_NC: Record<OrigenNC, string> = {
  rma: "RMA",
  directa: "Directa",
  cliente: "Cliente (portal)",
};

/** Motivos que el cliente elige en el portal (y escribe el detalle). */
export type MotivoCliente = "devolucion" | "error_precio" | "producto_equivocado" | "faltante" | "otro";
export const MOTIVOS_CLIENTE: MotivoCliente[] = ["devolucion", "error_precio", "producto_equivocado", "faltante", "otro"];
export const ETIQUETA_MOTIVO_CLIENTE: Record<MotivoCliente, string> = {
  devolucion: "Devolución de mercancía",
  error_precio: "Error en el precio facturado",
  producto_equivocado: "Llegó un producto distinto al que pedí",
  faltante: "Faltó mercancía en la entrega",
  otro: "Otro motivo",
};

/** Lo que el cliente ve en su enlace de seguimiento (sin montos ni nombres del equipo). */
export type EtapaCliente = "en_revision" | "aprobada" | "emitida" | "rechazada";
export type SeguimientoCliente = {
  numero: string;
  etapa: EtapaCliente;
  fecha: string;
  factura: string;
  motivo: string;
  productos: { producto: string; codigo: string; cantidad: number; seriales: string[] }[];
  nota_odoo: string | null;
  motivo_rechazo: string | null;
  actualizado: string | null;
};

export function etapaCliente(estado: EstadoNC): EtapaCliente {
  if (estado === "aprobada") return "aprobada";
  if (estado === "procesada") return "emitida";
  if (estado === "rechazada") return "rechazada";
  return "en_revision";
}

/**
 * Pasos del flujo, cada uno con sus responsables por sede (tabla
 * nc_aprobadores). "preaprueba" además crea las notas que no vienen de RMA.
 * "rma" es Servicio Técnico de la sede: no decide nada, recibe los avisos de
 * cómo terminan sus solicitudes y ve las notas de su sede. Las solicitudes
 * las puede hacer cualquiera con rol RMA.
 */
export type PasoNC = "rma" | "preaprueba" | "aprueba" | "procesa";
export const PASOS: PasoNC[] = ["rma", "preaprueba", "aprueba", "procesa"];
/** Los que deciden: sin alguien en cada uno, la sede no tiene el flujo activo. */
export const PASOS_DECISION: PasoNC[] = ["preaprueba", "aprueba", "procesa"];

export const ETIQUETA_PASO: Record<PasoNC, string> = {
  rma: "RMA (solicita)",
  preaprueba: "Preaprueba",
  aprueba: "Aprueba",
  procesa: "Hace la nota de crédito",
};

export const DESCRIPCION_PASO: Record<PasoNC, string> = {
  rma: "Servicio Técnico de la sede: recibe los avisos de sus solicitudes (aprobada, rechazada, hecha). Opcional.",
  preaprueba: "Filtra las solicitudes de RMA y crea las notas de crédito que no vienen de RMA (nacen preaprobadas).",
  aprueba: "Aprueba o rechaza. Es el único que puede aprobar una nota de crédito.",
  procesa: "Recibe la orden de crédito aprobada y la hace, en el panel o en Odoo.",
};

export const SEDES = [9, 10, 7];
export const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

/** El flujo de una sede está activo si cada paso tiene al menos un responsable. */
export function flujoCompleto(pasos: Partial<Record<PasoNC, string[]>> | null | undefined): boolean {
  return !!pasos && PASOS_DECISION.every((p) => (pasos[p]?.length ?? 0) > 0);
}

/** Usuario del panel (users_config) que se puede elegir como responsable. */
export type UsuarioPanel = { email: string; nombre: string; rol: string; cids: number | null; activo: boolean };

/**
 * Las de RMA y las del cliente esperan la preaprobación. Las directas las
 * crea quien preaprueba, así que nacen preaprobadas y esperan a quien aprueba.
 */
export function estadoInicial(origen: OrigenNC): EstadoNC {
  return origen === "directa" ? "por_aprobar" : "por_preaprobar";
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

/** Un producto de la factura dentro de una NC directa (tabla nc_solicitud_lineas). */
export type LineaSolicitud = {
  linea_factura_id: number;
  product_id: number | null;
  producto: string;
  codigo: string;
  marca: string;
  cantidad: number;
  /** Total con impuestos de una unidad, como en la factura. */
  precio_unidad: number;
  total: number;
  seriales: string[];
};

/** Un producto de la factura para elegir en "Nueva nota de crédito". */
export type ProductoFactura = {
  linea_id: number;
  product_id: number | null;
  producto: string;
  codigo: string;
  marca: string;
  cantidad: number;
  /** Lo que queda por acreditar de la línea (facturado − otras NC). */
  disponible: number;
  precio_unidad: number;
  con_serial: boolean;
  /** Seriales despachados con la factura; `nc` = solicitud que ya lo tiene. */
  seriales: { serial: string; nc: number | null }[];
};

export const SIN_MARCA = "Sin marca";

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
  /** Las que pide el cliente en el portal. */
  motivo_tipo?: MotivoCliente | null;
  contacto_telefono?: string | null;
  contacto_email?: string | null;
  lineas?: LineaSolicitud[];
};

/**
 * Pestañas de /notas-credito. Cada paso ve lo suyo:
 *   rma          las solicitudes de RMA de su sede
 *   preaprobar   las de RMA que esperan su preaprobación
 *   mis_creadas  las que creó, preaprobó o rechazó (para seguirlas)
 *   aprobar      las que esperan su aprobación
 *   procesar     lo aprobado sin NC publicada (y los borradores de Odoo)
 *   procesadas   las que ya tienen la NC publicada
 *   flujo        todo el flujo de la sede, filtrado por paso (SuperAdmin y aprueba)
 *   odoo         las NC de Odoo del mes (SuperAdmin, aprueba y procesa)
 *   responsables quién hace cada paso (SuperAdmin)
 */
export type VistaNC =
  | "preaprobar"
  | "mis_creadas"
  | "aprobar"
  | "procesar"
  | "procesadas"
  | "rma"
  | "flujo"
  | "odoo"
  | "responsables";

export const ETIQUETA_VISTA: Record<VistaNC, string> = {
  preaprobar: "Por preaprobar",
  mis_creadas: "Mis solicitudes",
  aprobar: "Por aprobar",
  procesar: "Por hacer la NC",
  procesadas: "Procesadas",
  rma: "Solicitudes de RMA",
  flujo: "Todo el flujo",
  odoo: "NC de Odoo",
  responsables: "Responsables",
};

/** Etapas del filtro de "Todo el flujo". */
export type EtapaNC = "rma" | "preaprueba" | "aprueba" | "procesados";
export const ETIQUETA_ETAPA: Record<EtapaNC, string> = {
  rma: "RMA",
  preaprueba: "Preaprueba",
  aprueba: "Aprueba",
  procesados: "Procesados",
};

/** En qué etapa del filtro cae una solicitud (las de RMA salen además en "RMA"). */
export function etapasDe(s: Pick<SolicitudNC, "origen" | "estado" | "rechazado_paso">): EtapaNC[] {
  const out: EtapaNC[] = s.origen === "rma" ? ["rma"] : [];
  if (s.estado === "por_preaprobar" || (s.estado === "rechazada" && s.rechazado_paso === "preaprueba")) out.push("preaprueba");
  if (s.estado === "por_aprobar" || (s.estado === "rechazada" && s.rechazado_paso === "aprueba")) out.push("aprueba");
  if (s.estado === "aprobada" || s.estado === "procesada") out.push("procesados");
  return out;
}

/** Si la sede se ve completa: el SuperAdmin en todas, quien aprueba en la suya. */
export function veTodoLaSede(pasos: PasoNC[] | undefined, superadmin: boolean): boolean {
  return superadmin || (pasos ?? []).includes("aprueba");
}

/** Si ve las NC de Odoo de la sede. */
export function veOdooDeLaSede(pasos: PasoNC[] | undefined, superadmin: boolean): boolean {
  return veTodoLaSede(pasos, superadmin) || (pasos ?? []).includes("procesa");
}

/** Pestañas de la sesión según sus pasos (en cualquier sede). */
export function vistasDe(pasos: Record<number, PasoNC[]>, superadmin: boolean): VistaNC[] {
  const todos = new Set(Object.values(pasos).flat());
  const v: VistaNC[] = [];
  if (todos.has("preaprueba")) v.push("preaprobar", "mis_creadas");
  if (todos.has("aprueba")) v.push("aprobar");
  if (todos.has("procesa")) v.push("procesar", "procesadas");
  if (todos.has("rma") && !superadmin && !todos.has("aprueba")) v.push("rma");
  if (superadmin || todos.has("aprueba")) v.push("flujo");
  if (superadmin || todos.has("aprueba") || todos.has("procesa")) v.push("odoo");
  if (superadmin) v.push("responsables");
  return v;
}

/** Nombre corto de lo que acredita: el producto, o "N productos". */
export function resumenProductos(lineas: { producto: string; cantidad: number }[]): string {
  if (!lineas.length) return "";
  if (lineas.length === 1) return `${lineas[0].cantidad > 1 ? `${lineas[0].cantidad} × ` : ""}${lineas[0].producto}`;
  return `${lineas.length} productos: ${lineas.map((l) => l.producto).join(" · ")}`;
}

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
