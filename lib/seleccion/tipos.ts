/**
 * Matriz de rastreo de selección de personal (RRHH, /recursos_humanos/seleccion).
 *
 * Diseño de la directora de RRHH (oct-2026), sobre el flujograma de
 * captación, reclutamiento y selección (`ejemploReclutamiento` de
 * lib/flujogramas/tipos.ts). Cuatro bloques: datos de la vacante
 * (requisición), datos del candidato, seguimiento de fases y cierre. Una
 * requisición tiene varios candidatos; la matriz es una fila por candidato.
 *
 * Todo lo de aquí es puro (sin base): lo usan la API para validar y la
 * pantalla para pintar e indicadores.
 */

/** Rol que trabaja la matriz (el SuperAdmin entra siempre por requireRoles). */
export const ROLES_SELECCION = ["recursos humanos"];

export const SEDES_SELECCION: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

export const FUENTES = [
  "LinkedIn",
  "Computrabajo",
  "Bumeran",
  "Indeed",
  "Portal interno",
  "Referido",
  "Redes sociales",
  "Otro",
];

/** Meta de tiempo de cobertura por defecto (días calendario). */
export const META_DIAS_DEFECTO = 30;

export type Tono = "verde" | "rojo" | "ambar" | "azul" | "gris";
export type Opcion = { valor: string; etiqueta: string; tono: Tono };

const SONDEO: Opcion[] = [
  { valor: "cumple", etiqueta: "Cumple", tono: "verde" },
  { valor: "no_cumple", etiqueta: "No cumple", tono: "rojo" },
  { valor: "pendiente", etiqueta: "Pendiente", tono: "ambar" },
];
const APTO: Opcion[] = [
  { valor: "apto", etiqueta: "Apto", tono: "verde" },
  { valor: "no_apto", etiqueta: "No apto", tono: "rojo" },
];
const FAVORABLE: Opcion[] = [
  { valor: "favorable", etiqueta: "Favorable", tono: "verde" },
  { valor: "no_favorable", etiqueta: "No favorable", tono: "rojo" },
];
const REFERENCIAS: Opcion[] = [
  { valor: "verificado", etiqueta: "Verificado (OK)", tono: "verde" },
  { valor: "con_observaciones", etiqueta: "Con observaciones", tono: "ambar" },
];
const TERNA: Opcion[] = [
  { valor: "si", etiqueta: "Sí", tono: "verde" },
  { valor: "no", etiqueta: "No", tono: "gris" },
];
const OFERTA: Opcion[] = [
  { valor: "aceptada", etiqueta: "Aceptada", tono: "verde" },
  { valor: "negociacion", etiqueta: "En negociación", tono: "ambar" },
  { valor: "rechazada", etiqueta: "Rechazada", tono: "rojo" },
];
const EXAMENES: Opcion[] = [
  { valor: "apto", etiqueta: "Apto", tono: "verde" },
  { valor: "apto_restricciones", etiqueta: "Apto con restricciones", tono: "ambar" },
  { valor: "no_apto", etiqueta: "No apto", tono: "rojo" },
];
export const ESTATUS_FINAL: Opcion[] = [
  { valor: "en_proceso", etiqueta: "En proceso", tono: "azul" },
  { valor: "contratado", etiqueta: "Contratado", tono: "verde" },
  { valor: "descalificado", etiqueta: "Descalificado", tono: "rojo" },
  { valor: "banco_elegibles", etiqueta: "Banco de elegibles", tono: "ambar" },
];
/** "Cubierta" no se guarda: sale de los contratados (ver estadoRequisicion). */
export const ESTADOS_REQUISICION: Opcion[] = [
  { valor: "abierta", etiqueta: "Abierta", tono: "azul" },
  { valor: "pausada", etiqueta: "En pausa", tono: "ambar" },
  { valor: "cancelada", etiqueta: "Cancelada", tono: "gris" },
];

export type Bloque = "vacante" | "candidato" | "fases" | "cierre";
export const BLOQUES: { clave: Bloque; titulo: string }[] = [
  { clave: "vacante", titulo: "1. Aspectos básicos de la vacante" },
  { clave: "candidato", titulo: "2. Aspectos básicos del candidato" },
  { clave: "fases", titulo: "3. Seguimiento de fases (flujograma)" },
  { clave: "cierre", titulo: "4. Cierre y control" },
];

export type Requisicion = {
  id: number;
  codigo: string;
  fecha_recepcion: string; // YYYY-MM-DD
  unidad_solicitante: string;
  cargo: string;
  sede: number;
  vacantes: number;
  meta_dias: number;
  estado: string;
  notas: string;
  created_by: string | null;
  created_at: string | null;
};

export type Candidato = {
  id: number;
  requisicion_id: number;
  nombre: string;
  telefono: string;
  correo: string;
  fuente: string;
  sondeo: string | null;
  entrevista_rrhh_fecha: string | null;
  entrevista_rrhh: string | null;
  evaluacion: string | null;
  evaluacion_puntaje: string;
  entrevista_tecnica_fecha: string | null;
  entrevista_tecnica: string | null;
  entrevista_tecnica_concepto: string;
  referencias: string | null;
  referencias_nota: string;
  terna: string | null;
  oferta: string | null;
  examenes: string | null;
  estatus: string;
  fecha_ingreso: string | null;
  notas: string;
  updated_by: string | null;
  updated_at: string | null;
};

export type TipoCampo = "texto" | "textoLargo" | "fecha" | "opcion" | "fuente";
export type CampoCandidato = {
  clave: keyof Candidato;
  etiqueta: string;
  bloque: Bloque;
  tipo: TipoCampo;
  opciones?: Opcion[];
  max?: number;
  /** Descripción de la columna en el diseño de RRHH (ayuda en el formulario). */
  ayuda?: string;
  /** Va en la matriz como columna (los textos largos solo en el detalle). */
  enMatriz?: boolean;
};

/** Campos editables del candidato, en el orden de la matriz. */
export const CAMPOS_CANDIDATO: CampoCandidato[] = [
  { clave: "nombre", etiqueta: "Nombre del candidato", bloque: "candidato", tipo: "texto", max: 160, enMatriz: true },
  { clave: "telefono", etiqueta: "Teléfono", bloque: "candidato", tipo: "texto", max: 40, enMatriz: true },
  { clave: "correo", etiqueta: "Correo", bloque: "candidato", tipo: "texto", max: 160, enMatriz: true },
  { clave: "fuente", etiqueta: "Fuente de reclutamiento", bloque: "candidato", tipo: "fuente", max: 60, enMatriz: true, ayuda: "Permite evaluar qué portal de empleo es más efectivo." },
  { clave: "sondeo", etiqueta: "Sondeo telefónico", bloque: "fases", tipo: "opcion", opciones: SONDEO, enMatriz: true, ayuda: "Filtro inicial tras la preselección curricular." },
  { clave: "entrevista_rrhh_fecha", etiqueta: "Entrevista RRHH (fecha)", bloque: "fases", tipo: "fecha", enMatriz: true },
  { clave: "entrevista_rrhh", etiqueta: "Entrevista RRHH", bloque: "fases", tipo: "opcion", opciones: APTO, enMatriz: true, ayuda: "Entrevista presencial u online." },
  { clave: "evaluacion", etiqueta: "Evaluaciones / Test", bloque: "fases", tipo: "opcion", opciones: FAVORABLE, enMatriz: true, ayuda: "Resultado de los test proyectivos." },
  { clave: "evaluacion_puntaje", etiqueta: "Puntuación / diagnóstico", bloque: "fases", tipo: "texto", max: 120, enMatriz: true },
  { clave: "entrevista_tecnica_fecha", etiqueta: "Entrevista técnica (fecha)", bloque: "fases", tipo: "fecha", enMatriz: true },
  { clave: "entrevista_tecnica", etiqueta: "Entrevista técnica", bloque: "fases", tipo: "opcion", opciones: APTO, enMatriz: true, ayuda: "Validación de competencias con la unidad solicitante." },
  { clave: "entrevista_tecnica_concepto", etiqueta: "Concepto del jefe inmediato", bloque: "fases", tipo: "textoLargo", max: 2000 },
  { clave: "referencias", etiqueta: "Chequeo de referencias", bloque: "fases", tipo: "opcion", opciones: REFERENCIAS, enMatriz: true, ayuda: "Referencias laborales y otros datos." },
  { clave: "referencias_nota", etiqueta: "Observaciones de referencias", bloque: "fases", tipo: "textoLargo", max: 2000 },
  { clave: "terna", etiqueta: "Terna (top 3)", bloque: "fases", tipo: "opcion", opciones: TERNA, enMatriz: true, ayuda: "Si entra al grupo de los 3 finalistas." },
  { clave: "oferta", etiqueta: "Oferta salarial", bloque: "fases", tipo: "opcion", opciones: OFERTA, enMatriz: true },
  { clave: "examenes", etiqueta: "Exámenes médicos", bloque: "fases", tipo: "opcion", opciones: EXAMENES, enMatriz: true, ayuda: "Evaluaciones médicas pre-empleo." },
  { clave: "estatus", etiqueta: "Estatus final", bloque: "cierre", tipo: "opcion", opciones: ESTATUS_FINAL, enMatriz: true },
  { clave: "fecha_ingreso", etiqueta: "Fecha de ingreso", bloque: "cierre", tipo: "fecha", enMatriz: true, ayuda: "Fecha efectiva de contratación; detona el onboarding." },
  { clave: "notas", etiqueta: "Notas", bloque: "cierre", tipo: "textoLargo", max: 4000 },
];

export const CAMPO_POR_CLAVE = new Map(CAMPOS_CANDIDATO.map((c) => [c.clave as string, c]));

export function opcion(campo: CampoCandidato | undefined, valor: string | null | undefined): Opcion | null {
  if (!valor) return null;
  return campo?.opciones?.find((o) => o.valor === valor) ?? null;
}

/* ------------------------------------------------------------------ fases */

type Fase = {
  clave: string;
  etiqueta: string;
  /** null = todavía no se hizo; true = la pasó; false = se cayó ahí. */
  resultado: (c: Candidato) => boolean | null;
};

/** El recorrido del candidato en el orden de la matriz. */
export const FASES: Fase[] = [
  { clave: "sondeo", etiqueta: "Sondeo telefónico", resultado: (c) => (c.sondeo === "cumple" ? true : c.sondeo === "no_cumple" ? false : null) },
  { clave: "entrevista_rrhh", etiqueta: "Entrevista RRHH", resultado: (c) => (c.entrevista_rrhh ? c.entrevista_rrhh === "apto" : null) },
  { clave: "evaluacion", etiqueta: "Evaluaciones", resultado: (c) => (c.evaluacion ? c.evaluacion === "favorable" : null) },
  { clave: "entrevista_tecnica", etiqueta: "Entrevista técnica", resultado: (c) => (c.entrevista_tecnica ? c.entrevista_tecnica === "apto" : null) },
  { clave: "referencias", etiqueta: "Referencias", resultado: (c) => (c.referencias ? true : null) },
  { clave: "terna", etiqueta: "Terna", resultado: (c) => (c.terna ? c.terna === "si" : null) },
  { clave: "oferta", etiqueta: "Oferta salarial", resultado: (c) => (c.oferta === "aceptada" ? true : c.oferta === "rechazada" ? false : null) },
  { clave: "examenes", etiqueta: "Exámenes médicos", resultado: (c) => (c.examenes ? c.examenes !== "no_apto" : null) },
  { clave: "ingreso", etiqueta: "Ingreso", resultado: (c) => (c.fecha_ingreso && c.estatus === "contratado" ? true : null) },
];

export type Situacion = {
  texto: string;
  tono: Tono;
  /** Fases pasadas de FASES.length. */
  avance: number;
  /** Se cayó en una fase pero el estatus final sigue "en proceso". */
  porCerrar: boolean;
};

/** Dónde está el candidato: la primera fase sin pasar, o dónde se cayó. */
export function situacion(c: Candidato): Situacion {
  let avance = 0;
  for (const f of FASES) {
    const r = f.resultado(c);
    if (r === true) {
      avance++;
      continue;
    }
    if (r === false) {
      if (c.estatus === "en_proceso") return { texto: `No pasó: ${f.etiqueta}`, tono: "rojo", avance, porCerrar: true };
      break;
    }
    break;
  }
  if (c.estatus === "contratado") return { texto: "Contratado", tono: "verde", avance, porCerrar: false };
  if (c.estatus === "descalificado") return { texto: "Descalificado", tono: "rojo", avance, porCerrar: false };
  if (c.estatus === "banco_elegibles") return { texto: "Banco de elegibles", tono: "ambar", avance, porCerrar: false };
  const siguiente = FASES[avance];
  return { texto: siguiente ? `En ${siguiente.etiqueta.toLowerCase()}` : "Listo para ingresar", tono: "azul", avance, porCerrar: false };
}

/* ----------------------------------------------------------------- tiempos */

/** Días calendario entre dos fechas YYYY-MM-DD (b − a). */
export function diasEntre(a: string | null, b: string | null): number | null {
  if (!a || !b) return null;
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86_400_000) : null;
}

/** Hoy en Caracas (YYYY-MM-DD). */
export function hoyCaracas(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Caracas" });
}

/** SLA del candidato: Fecha de ingreso − Fecha de recepción de la requisición. */
export function slaCandidato(c: Candidato, r: Requisicion | undefined): number | null {
  return r ? diasEntre(r.fecha_recepcion, c.fecha_ingreso) : null;
}

export type EstadoReq = {
  estado: "abierta" | "pausada" | "cancelada" | "cubierta";
  etiqueta: string;
  tono: Tono;
  contratados: number;
  /** Días de la requisición: hasta el último ingreso si está cubierta, si no hasta hoy. */
  dias: number | null;
  /** verde = dentro de la meta, ambar = pasó el 80 %, rojo = la pasó. */
  semaforo: Tono;
};

export function estadoRequisicion(r: Requisicion, candidatos: Candidato[], hoy = hoyCaracas()): EstadoReq {
  const contratados = candidatos.filter((c) => c.requisicion_id === r.id && c.estatus === "contratado");
  const cubierta = contratados.length >= Math.max(1, r.vacantes);
  const ingresos = contratados.map((c) => c.fecha_ingreso).filter(Boolean).sort() as string[];
  const hasta = cubierta ? (ingresos[ingresos.length - 1] ?? null) : r.estado === "cancelada" ? null : hoy;
  const dias = diasEntre(r.fecha_recepcion, hasta);
  const meta = r.meta_dias || META_DIAS_DEFECTO;
  let semaforo: Tono = "gris";
  if (dias != null) semaforo = dias > meta ? "rojo" : !cubierta && dias > meta * 0.8 ? "ambar" : "verde";
  if (cubierta) return { estado: "cubierta", etiqueta: "Cubierta", tono: "verde", contratados: contratados.length, dias, semaforo };
  const o = ESTADOS_REQUISICION.find((e) => e.valor === r.estado) ?? ESTADOS_REQUISICION[0];
  return { estado: o.valor as EstadoReq["estado"], etiqueta: o.etiqueta, tono: o.tono, contratados: contratados.length, dias, semaforo };
}

/* -------------------------------------------------------------- indicadores */

export type Indicadores = {
  requisiciones: number;
  abiertas: number;
  cubiertas: number;
  vencidas: number;
  candidatos: number;
  enProceso: number;
  contratados: number;
  /** Promedio de días de cobertura de las requisiciones cubiertas. */
  promedioCobertura: number | null;
  /** % de cubiertas dentro de su meta. */
  dentroDeMeta: number | null;
  embudo: { etiqueta: string; cantidad: number }[];
  porFuente: { fuente: string; candidatos: number; terna: number; contratados: number; efectividad: number }[];
  porUnidad: { unidad: string; requisiciones: number; cubiertas: number; promedio: number | null }[];
  porCerrar: number;
};

const prom = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export function indicadores(reqs: Requisicion[], cands: Candidato[], hoy = hoyCaracas()): Indicadores {
  const estados = new Map(reqs.map((r) => [r.id, estadoRequisicion(r, cands, hoy)]));
  const ids = new Set(reqs.map((r) => r.id));
  const cs = cands.filter((c) => ids.has(c.requisicion_id));
  const cubiertas = reqs.filter((r) => estados.get(r.id)!.estado === "cubierta");
  const diasCubiertas = cubiertas.map((r) => estados.get(r.id)!.dias).filter((d): d is number => d != null);
  const enMeta = cubiertas.filter((r) => {
    const d = estados.get(r.id)!.dias;
    return d != null && d <= (r.meta_dias || META_DIAS_DEFECTO);
  });

  // Embudo: cuántos llegaron a pasar cada fase (cada uno cuenta en todas las anteriores).
  const avances = cs.map((c) => situacion(c).avance);
  const embudo = [
    { etiqueta: "Candidatos", cantidad: cs.length },
    ...FASES.map((f, i) => ({ etiqueta: f.etiqueta, cantidad: avances.filter((a) => a > i).length })),
  ];

  const fuentes = new Map<string, { candidatos: number; terna: number; contratados: number }>();
  for (const c of cs) {
    const k = c.fuente || "Sin fuente";
    const f = fuentes.get(k) ?? { candidatos: 0, terna: 0, contratados: 0 };
    f.candidatos++;
    if (c.terna === "si") f.terna++;
    if (c.estatus === "contratado") f.contratados++;
    fuentes.set(k, f);
  }

  const unidades = new Map<string, Requisicion[]>();
  for (const r of reqs) {
    const k = r.unidad_solicitante || "Sin unidad";
    unidades.set(k, [...(unidades.get(k) ?? []), r]);
  }

  return {
    requisiciones: reqs.length,
    abiertas: reqs.filter((r) => ["abierta", "pausada"].includes(estados.get(r.id)!.estado)).length,
    cubiertas: cubiertas.length,
    vencidas: reqs.filter((r) => {
      const e = estados.get(r.id)!;
      return e.estado === "abierta" && e.semaforo === "rojo";
    }).length,
    candidatos: cs.length,
    enProceso: cs.filter((c) => c.estatus === "en_proceso").length,
    contratados: cs.filter((c) => c.estatus === "contratado").length,
    promedioCobertura: prom(diasCubiertas),
    dentroDeMeta: cubiertas.length ? Math.round((enMeta.length / cubiertas.length) * 100) : null,
    embudo,
    porFuente: [...fuentes.entries()]
      .map(([fuente, f]) => ({ fuente, ...f, efectividad: f.candidatos ? Math.round((f.contratados / f.candidatos) * 100) : 0 }))
      .sort((a, b) => b.contratados - a.contratados || b.candidatos - a.candidatos),
    porUnidad: [...unidades.entries()]
      .map(([unidad, rs]) => {
        const cub = rs.filter((r) => estados.get(r.id)!.estado === "cubierta");
        return {
          unidad,
          requisiciones: rs.length,
          cubiertas: cub.length,
          promedio: prom(cub.map((r) => estados.get(r.id)!.dias).filter((d): d is number => d != null)),
        };
      })
      .sort((a, b) => b.requisiciones - a.requisiciones),
    porCerrar: cs.filter((c) => situacion(c).porCerrar).length,
  };
}
