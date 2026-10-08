/** Etapas de un caso de RMA tal como las sigue el vendedor (solo lectura). */

/** Estados en los que el técnico ya terminó con el equipo. */
export const ESTADOS_RESUELTOS = ["reparado", "nota_credito", "no_procesado"];
/** Estados en los que el equipo sigue en el taller. */
export const ESTADOS_EN_PROCESO = ["recibido", "reingresado", "nc_revision"];

export type Filtro = "todos" | "en_proceso" | "por_entregar" | "entregados";

export function filtroDelCaso(c: { status: string; despachado_at: string | null }): Exclude<Filtro, "todos"> {
  if (c.despachado_at) return "entregados";
  if (ESTADOS_RESUELTOS.includes(c.status)) return "por_entregar";
  return "en_proceso";
}

/**
 * Paso en el que va el caso, de 0 a 4: ticket → recepción → revisión →
 * resuelto → entregado. 4 = terminado.
 */
export function pasoDelCaso(c: { status: string; despachado_at: string | null }, recibido = true): number {
  if (c.despachado_at) return 4;
  if (ESTADOS_RESUELTOS.includes(c.status)) return 3;
  return recibido ? 2 : 1;
}

/** Días desde que se abrió el caso hasta la entrega (o hasta hoy). */
export function diasDelCaso(c: { created_at: string; despachado_at: string | null }): number {
  const desde = new Date(c.created_at).getTime();
  const hasta = c.despachado_at ? new Date(c.despachado_at).getTime() : Date.now();
  if (Number.isNaN(desde) || Number.isNaN(hasta)) return 0;
  return Math.max(0, Math.floor((hasta - desde) / 86_400_000));
}

export const COLOR_ESTADO: Record<string, string> = {
  recibido: "bg-blue-100 text-blue-700 border-blue-200",
  reparado: "bg-green-100 text-green-700 border-green-200",
  nota_credito: "bg-purple-100 text-purple-700 border-purple-200",
  no_procesado: "bg-red-100 text-red-700 border-red-200",
  reingresado: "bg-teal-100 text-teal-700 border-teal-200",
  nc_revision: "bg-orange-100 text-orange-700 border-orange-200",
};

export function fechaHora(v: string | null | undefined, locale: string): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(locale === "en" ? "en-US" : "es-VE", { dateStyle: "medium", timeStyle: "short" });
}

/** Solo el día de un TIMESTAMP, en la zona del navegador (no cortar el ISO: es UTC). */
export function fechaDia(v: string | null | undefined, locale: string): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(locale === "en" ? "en-US" : "es-VE", { day: "2-digit", month: "short", year: "numeric" });
}
