/**
 * Mantenimiento de unidades de Almacén (camiones y montacargas): tipos y
 * reglas del flujo, sin dependencias de servidor. Los usan la API y la
 * pantalla por igual.
 *
 * Una orden de mantenimiento recorre cuatro etapas:
 *   reportado → en_taller → listo → cerrado
 *  - reportado: alguien avisó (una falla, o el servicio que toca). El equipo
 *    sigue en el patio, pero marcado.
 *  - en_taller: se está trabajando, con responsable (taller o mecánico) y una
 *    lista de tareas que se van marcando.
 *  - listo: todas las tareas hechas; falta recibirlo y devolverlo al servicio.
 *  - cerrado: de vuelta en operación, con el costo y las notas del trabajo.
 * Un equipo tiene como mucho una orden abierta a la vez.
 */

export const TIPOS_EQUIPO = ["camion", "montacargas"] as const;
export type TipoEquipo = (typeof TIPOS_EQUIPO)[number];

export const TIPOS_ORDEN = ["preventivo", "correctivo"] as const;
export type TipoOrden = (typeof TIPOS_ORDEN)[number];

export const PRIORIDADES = ["baja", "media", "alta"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];

export const ESTADOS = ["reportado", "en_taller", "listo", "cerrado"] as const;
export type Estado = (typeof ESTADOS)[number];

export const ACCIONES = ["iniciar", "tarea", "agregar_tarea", "terminar", "cerrar"] as const;
export type Accion = (typeof ACCIONES)[number];

export function esUno<T extends string>(lista: readonly T[], v: unknown): v is T {
  return typeof v === "string" && (lista as readonly string[]).includes(v);
}

export type Tarea = { texto: string; hecha: boolean; por?: string | null; at?: string | null };

export type Orden = {
  id: number;
  equipo_id: number;
  tipo: TipoOrden;
  prioridad: Prioridad;
  titulo: string;
  detalle: string | null;
  estado: Estado;
  /** Kilometraje (camión) u horas de uso (montacargas) al reportar. */
  medidor: number | null;
  tareas: Tarea[];
  responsable: string | null;
  costo: number | null;
  notas_cierre: string | null;
  reportado_por: string | null;
  created_at: string;
  iniciado_por: string | null;
  iniciado_at: string | null;
  terminado_por: string | null;
  terminado_at: string | null;
  cerrado_por: string | null;
  cerrado_at: string | null;
  /** Solo en el historial: de qué equipo fue. */
  equipo_codigo?: string;
  equipo_tipo?: TipoEquipo;
};

export type Equipo = {
  id: number;
  tipo: TipoEquipo;
  /** Placa del camión o código interno del montacargas. */
  codigo: string;
  descripcion: string | null;
  medidor: number | null;
  /** Fecha del próximo servicio preventivo (YYYY-MM-DD). */
  proximo_servicio: string | null;
  /** La orden en curso, si tiene. */
  orden: Orden | null;
};

/** Dónde está el equipo: operativo, o la etapa de su orden abierta. */
export type Situacion = "operativo" | Exclude<Estado, "cerrado">;

export function situacionDe(e: Pick<Equipo, "orden">): Situacion {
  return e.orden && e.orden.estado !== "cerrado" ? e.orden.estado : "operativo";
}

/** La unidad del medidor: los camiones cuentan kilómetros; los montacargas, horas. */
export function unidadMedidor(tipo: TipoEquipo): "km" | "h" {
  return tipo === "camion" ? "km" : "h";
}

/** Lo habitual de un servicio, para no escribirlo cada vez. Se puede editar. */
export const TAREAS_SUGERIDAS: Record<TipoEquipo, Record<TipoOrden, string[]>> = {
  camion: {
    preventivo: [
      "Cambio de aceite y filtro de aceite",
      "Filtro de aire y de combustible",
      "Revisión de frenos",
      "Presión y estado de cauchos",
      "Luces, batería y niveles",
    ],
    correctivo: ["Diagnóstico de la falla", "Reparación", "Prueba de manejo"],
  },
  montacargas: {
    preventivo: [
      "Aceite hidráulico y mangueras",
      "Cadenas, mástil y horquillas",
      "Frenos y dirección",
      "Batería o gas, según el equipo",
      "Bocina, luces y alarma de retroceso",
    ],
    correctivo: ["Diagnóstico de la falla", "Reparación", "Prueba de carga"],
  },
};

/** Todas las tareas hechas (y hay al menos una): se puede dar por terminado. */
export function tareasCompletas(tareas: Tarea[]): boolean {
  return tareas.length > 0 && tareas.every((t) => t.hecha);
}

/**
 * Días que faltan para el próximo servicio (negativo = vencido), contados en
 * la fecha de Caracas. null si no tiene fecha.
 */
export function diasParaServicio(proximo: string | null | undefined, ahora: number): number | null {
  const iso = String(proximo || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!iso) return null;
  const caracas = new Date(ahora - 4 * 60 * 60 * 1000);
  const hoy = Date.UTC(caracas.getUTCFullYear(), caracas.getUTCMonth(), caracas.getUTCDate());
  return Math.round((Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])) - hoy) / 86_400_000);
}

/** Con cuántos días de anticipación se avisa que toca servicio. */
export const DIAS_AVISO_SERVICIO = 7;
