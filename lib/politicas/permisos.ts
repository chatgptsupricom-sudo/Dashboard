// Quién entra a Políticas y Acuerdos. Archivo aparte de datos.ts (que usa
// MySQL) para que también lo usen las pantallas y el middleware.

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();

/** Publican (crean, editan, borran y ven quién leyó). */
export const ROLES_EDITAN_POLITICAS = ["superadmin", "procesos"];

/** Solo leen las publicadas de su sede y marcan "Leído y entendido". */
export const ROLES_LEEN_POLITICAS = [
  "administración",
  "administracion",
  "cuentas por cobrar",
  "gerencia de ventas",
  "gerente de operaciones",
  "recursos humanos",
  "compras",
];

export const ROLES_POLITICAS = [...ROLES_EDITAN_POLITICAS, ...ROLES_LEEN_POLITICAS];

export const puedeEditarPoliticas = (r: unknown) => ROLES_EDITAN_POLITICAS.includes(normRol(r));
export const puedeVerPoliticas = (r: unknown) => ROLES_POLITICAS.includes(normRol(r));

export const TIPOS_POLITICA = {
  politica: "Política",
  acuerdo: "Acuerdo / formato",
  circular: "Circular",
} as const;
export type TipoPolitica = keyof typeof TIPOS_POLITICA;

export const ESTADOS_POLITICA = {
  borrador: "Borrador",
  vigente: "Vigente",
  derogada: "Derogada",
} as const;
export type EstadoPolitica = keyof typeof ESTADOS_POLITICA;

/** Cómo se muestra hoy: el estado guardado más las fechas de vigencia. */
export function situacionPolitica(p: { estado: string; vigenciaDesde: string | null; vigenciaHasta: string | null }) {
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
  if (p.estado === "borrador") return { texto: "Borrador", clase: "bg-amber-100 text-amber-700" };
  if (p.estado === "derogada") return { texto: "Derogada", clase: "bg-slate-200 text-slate-600" };
  if (p.vigenciaHasta && p.vigenciaHasta < hoy) return { texto: "Vencida", clase: "bg-red-100 text-red-700" };
  if (p.vigenciaDesde && p.vigenciaDesde > hoy) return { texto: "Próxima", clase: "bg-blue-100 text-blue-700" };
  return { texto: "Vigente", clase: "bg-emerald-100 text-emerald-700" };
}

/** Vigente hoy, pide acuse y quien consulta todavía no la marcó leída. */
export const pendienteDeLeer = (
  p: { estado: string; vigenciaDesde: string | null; vigenciaHasta: string | null; requiereAcuse: boolean; leidaEl: string | null },
) => p.requiereAcuse && !p.leidaEl && situacionPolitica(p).texto === "Vigente";

/** 0 = todas las sedes. */
export const SEDES_POLITICA: Record<number, string> = { 0: "Todas las sedes", 9: "Valencia", 10: "Caracas", 7: "Panamá" };
