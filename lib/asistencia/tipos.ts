/**
 * Asistencia por biométrico (RRHH, /recursos_humanos/asistencia).
 *
 * RRHH sube el Excel que exporta el biométrico de cada sede; las marcas se
 * guardan (sin repetir) y el reporte se calcula con el horario de la empresa:
 * lunes a viernes de 8:00 a. m. a 4:30 p. m., y los sábados que haya
 * inventario con el mismo horario (los marca RRHH en el calendario, igual que
 * los feriados). Todo lo de aquí es puro: lo usan la API y la pantalla.
 */

export const ROLES_ASISTENCIA = ["recursos humanos"];

export const SEDES_ASISTENCIA: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

export const HORARIO = { entrada: "08:00", salida: "16:30" };
/** Minutos después de la entrada que todavía no cuentan como retardo. */
export const TOLERANCIA_MIN = 0;
/**
 * Dos marcas más juntas que esto son la misma (el empleado marcó dos veces
 * seguidas): no se toma la segunda como salida.
 */
export const MIN_ENTRE_MARCAS = 60;
/** Una sola marca antes de esta hora es la entrada; después, la salida. */
export const MEDIODIA = "12:00";
/** Días máximos de un reporte. */
export const MAX_DIAS_REPORTE = 93;

export type TipoDia = "inventario" | "feriado";
export type DiaEspecial = { id: number; fecha: string; sede: number; tipo: TipoDia; nota: string };

export type Empleado = {
  sede: number;
  codigo: string;
  nombre: string;
  activo: boolean;
  /** Primer y último día con marcas (de todo lo cargado, no solo del rango). */
  primera_fecha: string | null;
  ultima_fecha: string | null;
};

export type EstadoDia = "puntual" | "retardo" | "sin_entrada" | "ausente" | "no_laborable";

export type Dia = {
  fecha: string;
  laborable: boolean;
  /** Por qué el día cambió: sábado de inventario o feriado. */
  especial: TipoDia | null;
  marcas: string[];
  entrada: string | null;
  salida: string | null;
  estado: EstadoDia;
  retardoMin: number;
  /** Minutos que se fue antes de las 4:30 (0 si no hay salida). */
  salidaAnticipadaMin: number;
  /** Laborable con entrada pero sin marca de salida. */
  sinSalida: boolean;
  horas: number | null;
};

export type ResumenEmpleado = {
  codigo: string;
  nombre: string;
  activo: boolean;
  laborables: number;
  asistencias: number;
  retardos: number;
  minutosRetardo: number;
  ausencias: number;
  salidasAnticipadas: number;
  sinMarca: number;
  horas: number;
  dias: Dia[];
};

export type Reporte = {
  sede: number;
  desde: string;
  hasta: string;
  /** Último día con marcas cargadas en la sede: después de ahí no se evalúa. */
  cobertura: string | null;
  empleados: ResumenEmpleado[];
};

export const ETIQUETA_ESTADO: Record<EstadoDia, { texto: string; tono: "verde" | "rojo" | "ambar" | "azul" | "gris" }> = {
  puntual: { texto: "Puntual", tono: "verde" },
  retardo: { texto: "Retardo", tono: "ambar" },
  sin_entrada: { texto: "Sin marca de entrada", tono: "ambar" },
  ausente: { texto: "Ausente", tono: "rojo" },
  no_laborable: { texto: "Marcó en día no laborable", tono: "azul" },
};

export const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/* ------------------------------------------------------------------ fechas */

export const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number);
  return h * 60 + (m || 0);
};

export const aHora = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

export const diaSemana = (fecha: string) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

export function sumarDias(fecha: string, n: number): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function diasDelRango(desde: string, hasta: string): string[] {
  const out: string[] = [];
  for (let f = desde; f <= hasta && out.length <= 400; f = sumarDias(f, 1)) out.push(f);
  return out;
}

export function hoyCaracas(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
}

/* ------------------------------------------------------------------- reglas */

/**
 * Laborable: lunes a viernes salvo feriado; sábado solo si es de inventario.
 * Un día especial con sede 0 vale para todas las sedes; el de la sede manda.
 */
export function esLaborable(fecha: string, sede: number, especiales: DiaEspecial[]): { laborable: boolean; especial: TipoDia | null } {
  const delDia = especiales.filter((e) => e.fecha === fecha && (e.sede === sede || e.sede === 0));
  const especial = (delDia.find((e) => e.sede === sede) ?? delDia[0])?.tipo ?? null;
  const dow = diaSemana(fecha);
  if (especial === "feriado") return { laborable: false, especial };
  if (dow === 6) return { laborable: especial === "inventario", especial };
  if (dow === 0) return { laborable: false, especial: null };
  return { laborable: true, especial: null };
}

/** Entrada, salida y estado de un día con sus marcas (HH:MM, cualquier orden). */
export function evaluarDia(fecha: string, marcasDelDia: string[], laborable: boolean, especial: TipoDia | null): Dia {
  const marcas = [...new Set(marcasDelDia.map((m) => m.slice(0, 5)))].sort();
  const base: Dia = {
    fecha,
    laborable,
    especial,
    marcas,
    entrada: null,
    salida: null,
    estado: laborable ? "ausente" : "no_laborable",
    retardoMin: 0,
    salidaAnticipadaMin: 0,
    sinSalida: false,
    horas: null,
  };
  if (!marcas.length) return base;

  const primera = marcas[0];
  const ultima = marcas[marcas.length - 1];
  if (minutos(ultima) - minutos(primera) >= MIN_ENTRE_MARCAS) {
    base.entrada = primera;
    base.salida = ultima;
    base.horas = Math.round(((minutos(ultima) - minutos(primera)) / 60) * 100) / 100;
  } else if (primera < MEDIODIA) {
    base.entrada = primera;
  } else {
    base.salida = ultima;
  }
  if (!laborable) return base;

  if (base.entrada) {
    // Pasada la tolerancia, el retardo se cuenta desde las 8:00.
    const tarde = minutos(base.entrada) - minutos(HORARIO.entrada);
    base.retardoMin = tarde > TOLERANCIA_MIN ? tarde : 0;
    base.estado = base.retardoMin > 0 ? "retardo" : "puntual";
  } else {
    base.estado = "sin_entrada";
  }
  if (base.salida) base.salidaAnticipadaMin = Math.max(0, minutos(HORARIO.salida) - minutos(base.salida));
  else base.sinSalida = true;
  return base;
}

/**
 * Reporte de una sede en un rango. A cada empleado se le evalúan los días
 * desde su primera marca (no estaba antes) hasta la cobertura de la sede (no
 * hay datos después); a uno inactivo, hasta su última marca.
 */
export function calcularReporte({
  sede,
  desde,
  hasta,
  empleados,
  marcas,
  especiales,
  cobertura,
}: {
  sede: number;
  desde: string;
  hasta: string;
  empleados: Empleado[];
  marcas: { codigo: string; fecha: string; hora: string }[];
  especiales: DiaEspecial[];
  cobertura: string | null;
}): Reporte {
  const porEmpleado = new Map<string, Map<string, string[]>>();
  for (const m of marcas) {
    const dias = porEmpleado.get(m.codigo) ?? new Map<string, string[]>();
    dias.set(m.fecha, [...(dias.get(m.fecha) ?? []), m.hora]);
    porEmpleado.set(m.codigo, dias);
  }
  const fin = cobertura && cobertura < hasta ? cobertura : hasta;
  const fechas = cobertura ? diasDelRango(desde, fin) : [];
  const laborables = new Map(fechas.map((f) => [f, esLaborable(f, sede, especiales)]));

  const resumenes = empleados.map((e): ResumenEmpleado => {
    const marcasEmp = porEmpleado.get(e.codigo) ?? new Map<string, string[]>();
    const finEmp = !e.activo && e.ultima_fecha && e.ultima_fecha < fin ? e.ultima_fecha : fin;
    const dias = fechas
      .filter((f) => (!e.primera_fecha || f >= e.primera_fecha) && f <= finEmp)
      .map((f) => {
        const l = laborables.get(f)!;
        return evaluarDia(f, marcasEmp.get(f) ?? [], l.laborable, l.especial);
      })
      .filter((d) => d.laborable || d.marcas.length);
    const lab = dias.filter((d) => d.laborable);
    return {
      codigo: e.codigo,
      nombre: e.nombre,
      activo: e.activo,
      laborables: lab.length,
      asistencias: lab.filter((d) => d.marcas.length).length,
      retardos: lab.filter((d) => d.estado === "retardo").length,
      minutosRetardo: lab.reduce((s, d) => s + d.retardoMin, 0),
      ausencias: lab.filter((d) => d.estado === "ausente").length,
      salidasAnticipadas: lab.filter((d) => d.salidaAnticipadaMin > 0).length,
      sinMarca: lab.filter((d) => d.sinSalida || d.estado === "sin_entrada").length,
      horas: Math.round(dias.reduce((s, d) => s + (d.horas ?? 0), 0) * 100) / 100,
      dias,
    };
  });

  return {
    sede,
    desde,
    hasta,
    cobertura,
    empleados: resumenes.filter((r) => r.dias.length).sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
  };
}

export const formatoMin = (min: number) => (min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`);
