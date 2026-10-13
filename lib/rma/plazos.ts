/**
 * Plazos del taller de RMA y sus alertas.
 *
 * Un caso pasa por estas etapas (sql/rma_estados_plazos.sql):
 *
 *   por_llegar      el cliente abrió el ticket y el equipo todavía no llegó.
 *                   Termina cuando Seguridad registra el ingreso (lo firma RMA).
 *   en_diagnostico  RMA tiene el equipo: 48 horas hábiles para diagnosticarlo.
 *   en_reparacion   después del diagnóstico.
 *   reparado / nota_credito / no_procesado   resuelto, falta que salga.
 *
 * Y el equipo no puede pasar una semana en las instalaciones: tiene que salir
 * (despacho de Seguridad o entrega marcada por RMA) ANTES del 7.º día hábil
 * contado desde el ingreso. El día del ingreso es el día 1.
 *
 * "Hábil" = lunes a viernes, hora de Caracas. No descuenta feriados.
 *
 * Sin dependencias del servidor: lo usan las APIs y las pantallas.
 */

export const PLAZOS = {
  /** Ticket abierto sin que llegue el equipo, en días hábiles desde el ticket. */
  porLlegar: { aviso: 3, limite: 5 },
  /** Diagnóstico, en horas hábiles desde que el equipo entró al taller. */
  diagnostico: { aviso: 36, limite: 48 },
  /** Día hábil en las instalaciones: aviso desde el 5.º; el 7.º ya es tarde. */
  taller: { aviso: 5, limite: 7 },
} as const;

/**
 * Un ticket del portal que sigue "recibido" sin ingreso (casos de antes de los
 * estados nuevos) solo cuenta como por llegar si es de los últimos 30 días:
 * más viejo, el cliente no llevó el equipo. Mismo corte que Seguridad
 * (app/api/seguridad/tickets-sin-ingreso).
 */
export const DIAS_TICKET_VIGENTE = 30;

export type Etapa = "por_llegar" | "diagnostico" | "reparacion" | "listo";
export type Nivel = "ok" | "aviso" | "vencido";

/** Lo que hace falta de un caso para calcular sus plazos (ver lib/rma/plazosCasos.ts). */
export type DatosPlazo = {
  status: string;
  origen?: string | null;
  created_at: string | Date;
  despachado_at?: string | Date | null;
  /** Ingreso de Seguridad del envío. */
  ingreso_at?: string | Date | null;
  /** Último paso al estado actual, según el historial. */
  estado_desde?: string | Date | null;
  /** Último paso a "reingresado": el equipo volvió y el reloj empieza otra vez. */
  reingreso_at?: string | Date | null;
  /** Primera salida de "por_llegar" en el historial (llegada sin ingreso registrado). */
  llegada_at?: string | Date | null;
};

export type Plazo = {
  etapa: Etapa;
  /** El peor de los plazos que corren. */
  nivel: Nivel;
  porLlegar?: { desde: string; dias: number; nivel: Nivel };
  diagnostico?: { desde: string; horas: number; vence: string; nivel: Nivel };
  taller?: { desde: string; dia: number; saleAntesDe: string; nivel: Nivel };
};

const ETAPA: Record<string, Etapa> = {
  por_llegar: "por_llegar",
  en_diagnostico: "diagnostico",
  recibido: "diagnostico",
  reingresado: "diagnostico",
  en_reparacion: "reparacion",
  nc_revision: "reparacion",
  reparado: "listo",
  nota_credito: "listo",
  no_procesado: "listo",
};

const HORA = 3_600_000;
const DIA = 24 * HORA;
// Caracas es UTC-4 todo el año (sin horario de verano).
const OFFSET = -4 * HORA;

const aLocal = (t: number) => t + OFFSET;
const desdeLocal = (t: number) => t - OFFSET;
/** `t` en ms "locales" (Caracas corrida a UTC). */
const esHabil = (t: number) => {
  const d = new Date(t).getUTCDay();
  return d !== 0 && d !== 6;
};
// Tope de vueltas: un caso de hace años no puede colgar el cálculo.
const MAX_DIAS = 4000;

function fecha(v: string | Date | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const masTarde = (...fechas: (Date | null)[]) =>
  fechas.reduce<Date | null>((m, f) => (f && (!m || f > m) ? f : m), null);

/** Horas de lunes a viernes entre dos momentos. */
export function horasHabiles(desde: Date, hasta: Date): number {
  let a = aLocal(desde.getTime());
  const b = aLocal(hasta.getTime());
  let ms = 0;
  for (let i = 0; a < b && i < MAX_DIAS; i++) {
    const finDia = Math.floor(a / DIA) * DIA + DIA;
    if (esHabil(a)) ms += Math.min(finDia, b) - a;
    a = finDia;
  }
  return ms / HORA;
}

/** El momento en que se cumplen `horas` hábiles desde `desde`. */
export function sumarHorasHabiles(desde: Date, horas: number): Date {
  let a = aLocal(desde.getTime());
  let resta = horas * HORA;
  for (let i = 0; i < MAX_DIAS; i++) {
    const finDia = Math.floor(a / DIA) * DIA + DIA;
    if (esHabil(a)) {
      if (resta <= finDia - a) return new Date(desdeLocal(a + resta));
      resta -= finDia - a;
    }
    a = finDia;
  }
  return new Date(desdeLocal(a));
}

/**
 * Qué día hábil es `ahora` contando desde `desde` (que es el día 1 si es
 * hábil; si cae en fin de semana, el día 1 es el lunes siguiente). 0 si todavía
 * no llegó el primer día hábil.
 */
export function diaHabil(desde: Date, ahora: Date): number {
  let d = Math.floor(aLocal(desde.getTime()) / DIA);
  const fin = Math.floor(aLocal(ahora.getTime()) / DIA);
  let n = 0;
  for (let i = 0; d <= fin && i < MAX_DIAS; i++, d++) if (esHabil(d * DIA)) n++;
  return n;
}

/** Medianoche (Caracas) del día hábil número `n` contando desde `desde`. */
export function inicioDiaHabil(desde: Date, n: number): Date {
  let d = Math.floor(aLocal(desde.getTime()) / DIA);
  let c = 0;
  for (let i = 0; i < MAX_DIAS; i++, d++) {
    if (esHabil(d * DIA) && ++c === n) break;
  }
  return new Date(desdeLocal(d * DIA));
}

const nivelDe = (valor: number, p: { aviso: number; limite: number }): Nivel =>
  valor >= p.limite ? "vencido" : valor >= p.aviso ? "aviso" : "ok";

const PESO: Record<Nivel, number> = { ok: 0, aviso: 1, vencido: 2 };
export const peorNivel = (...n: (Nivel | undefined)[]): Nivel =>
  n.reduce<Nivel>((m, x) => (x && PESO[x] > PESO[m] ? x : m), "ok");

/** La etapa del caso, o null si ya salió, o si es un ticket viejo que nunca llegó. */
export function etapaDe(c: DatosPlazo, ahora = new Date()): Etapa | null {
  if (c.despachado_at) return null;
  const etapa = ETAPA[c.status];
  if (!etapa) return null;
  // "recibido" sin ingreso en un ticket del portal: de antes de "por_llegar".
  if (c.status === "recibido" && c.origen === "portal" && !c.ingreso_at && !c.llegada_at) {
    const creado = fecha(c.created_at);
    if (!creado || ahora.getTime() - creado.getTime() > DIAS_TICKET_VIGENTE * DIA) return null;
    return "por_llegar";
  }
  return etapa;
}

/**
 * Desde cuándo está el equipo en las instalaciones: el ingreso de Seguridad
 * (o, sin ingreso registrado, cuando dejó de estar por llegar; o el alta del
 * caso, que es como entran los casos que RMA crea con el equipo en la mano).
 * Si volvió (reingresado), desde la vuelta.
 */
function enTallerDesde(c: DatosPlazo): Date | null {
  const llegada = fecha(c.ingreso_at) || fecha(c.llegada_at) || fecha(c.created_at);
  return masTarde(llegada, fecha(c.reingreso_at));
}

/** Los plazos que corren para el caso, o null si no le corre ninguno. */
export function calcularPlazo(c: DatosPlazo, ahora = new Date()): Plazo | null {
  const etapa = etapaDe(c, ahora);
  if (!etapa) return null;

  if (etapa === "por_llegar") {
    const desde = fecha(c.created_at);
    if (!desde) return null;
    const dias = Math.floor(horasHabiles(desde, ahora) / 24);
    const nivel = nivelDe(dias, PLAZOS.porLlegar);
    return { etapa, nivel, porLlegar: { desde: desde.toISOString(), dias, nivel } };
  }

  const taller = enTallerDesde(c);
  if (!taller) return null;
  const dia = diaHabil(taller, ahora);
  const nivelTaller = nivelDe(dia, PLAZOS.taller);
  const plazo: Plazo = {
    etapa,
    nivel: nivelTaller,
    taller: {
      desde: taller.toISOString(),
      dia,
      saleAntesDe: inicioDiaHabil(taller, PLAZOS.taller.limite).toISOString(),
      nivel: nivelTaller,
    },
  };

  if (etapa === "diagnostico") {
    const desde = masTarde(fecha(c.estado_desde), taller)!;
    const horas = horasHabiles(desde, ahora);
    const nivel = nivelDe(horas, PLAZOS.diagnostico);
    plazo.diagnostico = {
      desde: desde.toISOString(),
      horas: Math.floor(horas),
      vence: sumarHorasHabiles(desde, PLAZOS.diagnostico.limite).toISOString(),
      nivel,
    };
    plazo.nivel = peorNivel(nivelTaller, nivel);
  }
  return plazo;
}
