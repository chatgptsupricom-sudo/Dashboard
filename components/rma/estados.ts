/** Etiquetas y colores de los estados de un caso / producto de RMA. */
export const ESTADOS_RMA = ["recibido", "reingresado", "nc_revision", "reparado", "nota_credito", "no_procesado"] as const;

export const etiquetaEstado: Record<string, string> = {
  recibido: "Recibido",
  reparado: "Reparado",
  nota_credito: "Nota de Crédito",
  no_procesado: "No Procesado",
  reingresado: "Reingresado",
  nc_revision: "NC en revisión",
};

export const colorEstado: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-teal-100 text-teal-700 border-teal-200",
  nc_revision: "bg-orange-100 text-orange-700 border-orange-200",
};

/** Estado de una solicitud de nota de crédito. */
export const etiquetaSolicitud: Record<string, string> = {
  pendiente: "Esperando al Super Admin",
  aprobada: "Aprobada",
  rechazada: "Rechazada",
};

export const colorSolicitud: Record<string, string> = {
  pendiente: "bg-orange-100 text-orange-700 border-orange-200",
  aprobada: "bg-emerald-100 text-emerald-700 border-emerald-200",
  rechazada: "bg-rose-100 text-rose-700 border-rose-200",
};

export function fechaCorta(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("es-VE", { day: "2-digit", month: "short", year: "numeric" });
}
