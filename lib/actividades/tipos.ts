/**
 * Actividades: tipos y reglas puras (sin servidor). Las usan la API
 * (`lib/actividades/datos.ts`) y la pantalla (`components/actividad/panel/`).
 *
 * Estados guardados en `activities.status` (no se cambian: los lee también
 * `app/api/reports/sellers/stats`): pending → in-progress → culminated.
 * Filas viejas pueden traer "pendiente", "en curso", "culminada"...:
 * `normalizarEstado` las lleva a los tres de siempre.
 */

export type Estado = "pending" | "in-progress" | "culminated";
export type Prioridad = "alta" | "media" | "baja";

export const ESTADOS: { id: Estado; etiqueta: string }[] = [
  { id: "pending", etiqueta: "Pendiente" },
  { id: "in-progress", etiqueta: "En curso" },
  { id: "culminated", etiqueta: "Culminada" },
];

export const PRIORIDADES: { id: Prioridad; etiqueta: string; orden: number }[] = [
  { id: "alta", etiqueta: "Alta", orden: 0 },
  { id: "media", etiqueta: "Media", orden: 1 },
  { id: "baja", etiqueta: "Baja", orden: 2 },
];

export interface ItemChecklist {
  id: string;
  texto: string;
  hecho: boolean;
}

export interface Actividad {
  id: number;
  title: string;
  description: string | null;
  observacion: string | null;
  status: Estado;
  priority: Prioridad;
  /** YYYY-MM-DD o null. */
  due_date: string | null;
  user_id: number | null;
  user_name: string | null;
  assigned_by: string | null;
  assigned_by_id: number | null;
  created_at: string | null;
  /** ISO; cuándo pasó a culminada (null en las de antes de esta columna). */
  completed_at: string | null;
  checklist: ItemChecklist[];
  /** El que mira puede editarla / borrarla (lo decide el servidor). */
  puede_editar: boolean;
  puede_borrar: boolean;
}

export interface PersonaVisible {
  id: number;
  name: string;
  email: string;
  role: string;
  cids: number | null;
}

export interface ResumenPersona {
  user_id: number;
  name: string;
  role: string;
  cids: number | null;
  vencidas: number;
  hoy: number;
  en_curso: number;
  pendientes: number;
  hechas_semana: number;
  /** Fecha (YYYY-MM-DD) de la vencida más vieja, para ordenar. */
  vencida_mas_vieja: string | null;
}

/** Días hacia atrás que se traen las culminadas (columna del Tablero). */
export const DIAS_CULMINADAS = 30;

export const LIMITE_CHECKLIST = 50;
export const LARGO_ITEM = 300;

export function normalizarEstado(s: unknown): Estado {
  const v = String(s ?? "").toLowerCase().trim();
  if (["in-progress", "en curso", "en-progreso", "en progreso"].includes(v)) return "in-progress";
  if (["culminated", "culminada", "terminada", "completada", "done"].includes(v)) return "culminated";
  return "pending";
}

export function normalizarPrioridad(p: unknown): Prioridad {
  const v = String(p ?? "").toLowerCase().trim();
  return v === "alta" || v === "baja" ? v : "media";
}

export function normalizarChecklist(valor: unknown): ItemChecklist[] {
  let lista: unknown = valor;
  if (typeof valor === "string") {
    try {
      lista = JSON.parse(valor);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(lista)) return [];
  return lista
    .filter((i) => i && typeof i === "object" && String((i as any).texto ?? "").trim())
    .slice(0, LIMITE_CHECKLIST)
    .map((i: any, n) => ({
      id: String(i.id ?? `i${n}`).slice(0, 40),
      texto: String(i.texto).trim().slice(0, LARGO_ITEM),
      hecho: Boolean(i.hecho),
    }));
}

const ZONA = "America/Caracas";

/** Fecha YYYY-MM-DD de un instante en hora de Caracas. */
export function fechaCaracas(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Suma días a una fecha YYYY-MM-DD (sin zonas: mediodía UTC). */
export function sumarDias(fecha: string, dias: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Días de `desde` a `hasta` (YYYY-MM-DD). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T12:00:00Z`);
  const b = Date.parse(`${hasta}T12:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** Día de la semana (0 = domingo) de una fecha YYYY-MM-DD. */
export function diaSemana(fecha: string): number {
  return new Date(`${fecha}T12:00:00Z`).getUTCDay();
}

export type Grupo = "vencidas" | "hoy" | "proximas" | "despues" | "sin_fecha" | "hechas";

export const GRUPOS: { id: Grupo; etiqueta: string; ayuda: string }[] = [
  { id: "vencidas", etiqueta: "Vencidas", ayuda: "Pasó la fecha y no está culminada" },
  { id: "hoy", etiqueta: "Para hoy", ayuda: "Vencen hoy" },
  { id: "proximas", etiqueta: "Próximos 7 días", ayuda: "Vencen esta semana" },
  { id: "despues", etiqueta: "Más adelante", ayuda: "Vencen en más de 7 días" },
  { id: "sin_fecha", etiqueta: "Sin fecha", ayuda: "No tienen fecha de culminación" },
  { id: "hechas", etiqueta: "Culminadas hoy", ayuda: "Lo que se terminó hoy" },
];

/**
 * En qué grupo de "Mi día" cae una actividad. Las culminadas solo salen si
 * se culminaron hoy (las demás quedan en el Tablero): `null` = no se muestra.
 */
export function grupoDe(act: Pick<Actividad, "status" | "due_date" | "completed_at">, hoy: string): Grupo | null {
  if (act.status === "culminated") {
    return act.completed_at && fechaCaracas(new Date(act.completed_at)) === hoy ? "hechas" : null;
  }
  if (!act.due_date) return "sin_fecha";
  const dias = diasEntre(hoy, act.due_date);
  if (dias < 0) return "vencidas";
  if (dias === 0) return "hoy";
  if (dias <= 7) return "proximas";
  return "despues";
}

/** Orden dentro de un grupo: en curso primero, luego prioridad, fecha y antigüedad. */
export function compararActividades(a: Actividad, b: Actividad): number {
  const curso = Number(b.status === "in-progress") - Number(a.status === "in-progress");
  if (curso) return curso;
  const pa = PRIORIDADES.find((p) => p.id === a.priority)?.orden ?? 1;
  const pb = PRIORIDADES.find((p) => p.id === b.priority)?.orden ?? 1;
  if (pa !== pb) return pa - pb;
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return b.id - a.id;
}

const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "12 nov" (o "12 nov 2025" si no es de este año). */
export function fechaCorta(fecha: string, hoy: string): string {
  const [a, m, d] = fecha.split("-").map(Number);
  const base = `${d} ${MESES_CORTOS[m - 1]}`;
  return a === Number(hoy.slice(0, 4)) ? base : `${base} ${a}`;
}

/** Texto y tono del vencimiento: "Vencida hace 3 días", "Hoy", "Mañana", "vie 28 nov". */
export function textoVencimiento(
  fecha: string | null,
  hoy: string,
): { texto: string; tono: "rojo" | "ambar" | "neutro" | "gris" } {
  if (!fecha) return { texto: "Sin fecha", tono: "gris" };
  const dias = diasEntre(hoy, fecha);
  if (dias < 0) {
    return { texto: dias === -1 ? "Venció ayer" : `Vencida hace ${-dias} días`, tono: "rojo" };
  }
  if (dias === 0) return { texto: "Hoy", tono: "ambar" };
  if (dias === 1) return { texto: "Mañana", tono: "neutro" };
  if (dias <= 6) return { texto: `${DIAS_CORTOS[diaSemana(fecha)]} ${fechaCorta(fecha, hoy)}`, tono: "neutro" };
  return { texto: fechaCorta(fecha, hoy), tono: "neutro" };
}

/** Atajos de fecha del formulario: hoy, mañana, el viernes y el lunes que viene. */
export function atajosFecha(hoy: string): { etiqueta: string; fecha: string }[] {
  const dia = diaSemana(hoy);
  const hastaViernes = (5 - dia + 7) % 7;
  const hastaLunes = ((1 - dia + 7) % 7) || 7;
  const atajos = [
    { etiqueta: "Hoy", fecha: hoy },
    { etiqueta: "Mañana", fecha: sumarDias(hoy, 1) },
  ];
  if (hastaViernes > 1) atajos.push({ etiqueta: "Viernes", fecha: sumarDias(hoy, hastaViernes) });
  atajos.push({ etiqueta: "Próx. lunes", fecha: sumarDias(hoy, hastaLunes) });
  return atajos;
}

export const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };
