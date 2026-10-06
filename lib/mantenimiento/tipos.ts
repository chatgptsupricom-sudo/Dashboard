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
 *
 * Además, un camión puede estar "en ruta": sale del despacho de mercancía
 * (un egreso por ruta con su placa, aprobado en el portón) y vuelve cuando
 * Almacén marca el regreso, o solo a las HORAS_EN_RUTA horas.
 *
 * El preventivo se lleva con un plan por equipo: cada cuántos días y cada
 * cuántos km (u horas, en un montacargas) le toca servicio.
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

/** Un camión que salió a ruta y no se marcó de regreso vuelve solo a estas horas. */
export const HORAS_EN_RUTA = 18;
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
  /** Plan preventivo: cada cuántos días y cada cuántos km (u horas) toca servicio. */
  intervalo_dias: number | null;
  intervalo_medidor: number | null;
  /** El último preventivo cerrado: cuándo y con qué medidor. */
  ultimo_servicio_at: string | null;
  ultimo_servicio_medidor: number | null;
  /** La orden en curso, si tiene. */
  orden: Orden | null;
  /** Solo camiones: el despacho por ruta que lo tiene ocupado, si hay. */
  ruta: Ruta | null;
  /** Rutas despachadas con este camión en los últimos 30 días. */
  rutas_30d: number;
};

/** Lo que el despacho de mercancía dice de un camión. */
export type Ruta = {
  /** cargando: en el portón, esperando a Seguridad. en_ruta: ya salió. */
  estado: "cargando" | "en_ruta";
  desde: string | null;
  chofer: string | null;
  ordenes: Array<{ orden: string; cliente: string | null }>;
};

/** Dónde está el equipo: operativo, en ruta, o la etapa de su orden abierta. */
export type Situacion = "operativo" | "en_ruta" | Exclude<Estado, "cerrado">;

/**
 * En el taller (o listo) manda la orden: ahí está físicamente. Si no, un
 * camión que salió a ruta está en ruta aunque tenga algo reportado.
 */
export function situacionDe(e: Pick<Equipo, "orden"> & { ruta?: Ruta | null }): Situacion {
  const estado = e.orden && e.orden.estado !== "cerrado" ? e.orden.estado : null;
  if (estado === "en_taller" || estado === "listo") return estado;
  if (e.ruta?.estado === "en_ruta") return "en_ruta";
  return estado || "operativo";
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

/**
 * Si ya toca avisar del preventivo: por fecha (faltan DIAS_AVISO_SERVICIO o
 * menos, o está vencido) o por medidor (ya recorrió el intervalo desde el
 * último servicio). null si todavía no toca.
 */
export function servicioPendiente(
  e: Pick<Equipo, "proximo_servicio" | "medidor" | "intervalo_medidor" | "ultimo_servicio_medidor">,
  ahora: number,
): { dias: number | null; porMedidor: boolean } | null {
  const d = diasParaServicio(e.proximo_servicio, ahora);
  const dias = d !== null && d <= DIAS_AVISO_SERVICIO ? d : null;
  const porMedidor =
    !!e.intervalo_medidor &&
    e.medidor !== null &&
    e.ultimo_servicio_medidor !== null &&
    e.medidor >= e.ultimo_servicio_medidor + e.intervalo_medidor;
  return dias !== null || porMedidor ? { dias, porMedidor } : null;
}
