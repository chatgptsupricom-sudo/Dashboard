/**
 * Etiquetas y colores de los estados de un caso / producto de RMA.
 *
 * Flujo (lib/rma/plazos.ts): por llegar → en diagnóstico (48 h hábiles) → en
 * reparación → reparado / nota de crédito / no procesado, y el equipo sale
 * antes del 7.º día hábil. "Recibido" es el estado de los casos de antes.
 */
export const ESTADOS_RMA = [
  "por_llegar",
  "en_diagnostico",
  "en_reparacion",
  "recibido",
  "reingresado",
  "nc_revision",
  "reparado",
  "nota_credito",
  "no_procesado",
] as const;

export const etiquetaEstado: Record<string, string> = {
  por_llegar: "Por llegar",
  en_diagnostico: "En diagnóstico",
  en_reparacion: "En reparación",
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
  nc_revision: "NC en revisión",
};

export const colorEstado: Record<string, string> = {
  por_llegar: "bg-violet-100 text-violet-700 border-violet-200",
  en_diagnostico: "bg-sky-100 text-sky-700 border-sky-200",
  en_reparacion: "bg-amber-100 text-amber-800 border-amber-200",
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-teal-100 text-teal-700 border-teal-200",
  nc_revision: "bg-orange-100 text-orange-700 border-orange-200",
};

/**
 * Los que RMA elige al cambiar el estado, en el orden del flujo. Sin
 * "recibido" (de antes), ni "nc_revision" (no se pone a mano); "nota_credito"
 * se muestra como "Solicitar nota de crédito".
 */
export const ESTADOS_ELEGIBLES = [
  "por_llegar",
  "en_diagnostico",
  "en_reparacion",
  "reparado",
  "nota_credito",
  "no_procesado",
  "reingresado",
] as const;

/** Desde dónde se puede pedir nota de crédito (lib/rma/notaCredito.ts). */
export const ESTADOS_SOLICITAN_NC = ["recibido", "en_diagnostico", "en_reparacion", "reingresado"];

/** Estado de una solicitud de nota de crédito. */
export const etiquetaSolicitud: Record<string, string> = {
  pendiente: "Enviada al Super Admin",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export const colorSolicitud: Record<string, string> = {
  pendiente: "bg-blue-100 text-blue-700 border-blue-200",
  aprobada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rechazada: "bg-rose-100 text-rose-700 border-rose-200",
};

export function fechaCorta(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}
