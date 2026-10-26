/**
 * Solicitudes de personal (/solicitudes-personal).
 *
 * Un gerente pide un colaborador nuevo con su urgencia → el SuperAdmin la
 * aprueba o la rechaza → al aprobarla nace sola la requisición en la matriz
 * de Selección de RRHH (lib/seleccion/), donde RRHH hace la búsqueda. El
 * avance que ve el gerente sale de esa requisición (no hay etapas propias).
 *
 * Archivo puro (sin base): lo usan el middleware, la API y la pantalla.
 */

import type { Tono } from "@/lib/seleccion/tipos";

export const normRol = (r: unknown) => String(r ?? "").toLowerCase().trim();

/** Crean solicitudes y ven solo las suyas (por correo). */
export const ROLES_SOLICITAN = [
  "gerencia de ventas",
  "gerente de operaciones",
  "administración",
  "administracion",
  "administración y finanzas",
  "administracion y finanzas",
  "compras",
];
/** Ve las aprobadas de todas las sedes, como en la matriz de Selección. */
export const ROL_RRHH = "recursos humanos";
/** El SuperAdmin entra siempre (requireRoles); decide y ve todo. */
export const ROLES_SOLICITUDES_PERSONAL = [...ROLES_SOLICITAN, ROL_RRHH];

export const puedeVerSolicitudesPersonal = (r: unknown) =>
  normRol(r) === "superadmin" || ROLES_SOLICITUDES_PERSONAL.includes(normRol(r));

export type Urgencia = "alta" | "media" | "baja";
/** `dias` = meta de cobertura de la requisición que nace al aprobar. */
export const URGENCIAS: Record<Urgencia, { etiqueta: string; dias: number; tono: Tono; orden: number }> = {
  alta: { etiqueta: "Alta", dias: 15, tono: "rojo", orden: 0 },
  media: { etiqueta: "Media", dias: 30, tono: "ambar", orden: 1 },
  baja: { etiqueta: "Baja", dias: 60, tono: "gris", orden: 2 },
};

export type Motivo = "nuevo" | "reemplazo";
export const MOTIVOS: Record<Motivo, string> = { nuevo: "Puesto nuevo", reemplazo: "Reemplazo" };

export type EstadoSolicitud = "pendiente" | "aprobada" | "rechazada" | "retirada";
export const ESTADOS: Record<EstadoSolicitud, { etiqueta: string; tono: Tono }> = {
  pendiente: { etiqueta: "Por aprobar", tono: "ambar" },
  aprobada: { etiqueta: "Aprobada", tono: "verde" },
  rechazada: { etiqueta: "Rechazada", tono: "rojo" },
  retirada: { etiqueta: "Retirada", tono: "gris" },
};

/** Cómo va la búsqueda en Selección. Sin nombres de candidatos: el gerente solo ve conteos. */
export type Avance = {
  codigo: string;
  etiqueta: string; // Abierta / En pausa / Cancelada / Cubierta
  tono: Tono;
  vacantes: number;
  contratados: number;
  candidatos: number; // en proceso
  fase: string | null; // la más avanzada entre los que siguen en proceso
  dias: number | null; // desde que RRHH la recibió
  meta: number;
};

export type Solicitud = {
  id: number;
  cargo: string;
  area: string;
  sede: number;
  cantidad: number;
  motivo: Motivo;
  reemplaza: string;
  urgencia: Urgencia;
  fecha_deseada: string | null; // YYYY-MM-DD
  perfil: string;
  requisitos: string;
  salario: string;
  estado: EstadoSolicitud;
  solicitante_email: string;
  solicitante_nombre: string;
  solicitante_rol: string;
  decidido_por_email: string | null;
  decidido_por_nombre: string | null;
  decidido_at: string | null;
  motivo_rechazo: string;
  requisicion_id: number | null;
  created_at: string | null;
  avance: Avance | null;
};

export type Evento = { id: number; accion: string; detalle: string; usuario: string; created_at: string | null };

/** Para la vista de RRHH: urgencia primero, después la más vieja. */
export function ordenRRHH(a: Solicitud, b: Solicitud): number {
  return (
    URGENCIAS[a.urgencia].orden - URGENCIAS[b.urgencia].orden ||
    String(a.decidido_at ?? a.created_at).localeCompare(String(b.decidido_at ?? b.created_at))
  );
}

/** Días desde una fecha ISO hasta hoy. */
export const diasDesde = (iso: string | null) =>
  iso ? Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)) : null;
