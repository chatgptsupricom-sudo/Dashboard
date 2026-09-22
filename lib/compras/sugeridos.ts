/**
 * Calculo de la sugerencia de compra, calcado de la hoja ANALISIS del Excel
 * con el que trabaja el comprador ("Tintas y toner Canon.xlsx"). Cada campo
 * lleva al lado la columna de la hoja de donde sale, para poder revisarlo
 * contra el Excel celda por celda.
 *
 * Es codigo puro (sin Odoo ni MySQL): lo usa la pantalla para recalcular al
 * instante cuando el comprador cambia el ETA o la compra manual.
 */

/** ETA (dias hasta que llega la compra) cuando el comprador no cargo uno. */
export const ETA_DEFAULT = 15;
export const ETA_MAX = 365;
export const COMPRA_MANUAL_MAX = 1_000_000;

export type ClaseABC = "A" | "B" | "C";

/** % de crecimiento que se le suma a la compra, por clase (hoja MAESTRO E:F). */
export const CRECIMIENTO_POR_CLASE: Record<ClaseABC, number> = { A: 0, B: 0.05, C: 0 };

/** Dias de inventario que se quieren tener despues de la compra (columna N). */
export const DIAS_INVENTARIO_DESEADO: Record<ClaseABC, number> = { A: 45, B: 30, C: 20 };

/** Factor z del nivel de servicio para el stock de seguridad (columna O). */
const Z_SERVICIO: Record<ClaseABC, number> = { A: 2.33, B: 1.65, C: 1.28 };

export type EntradaSugerido = {
  fisico: number; // C
  reservado: number; // D
  transito: number; // E: ordenado y aun no recibido
  ventas45d: number; // G
  ventas365d: number; // H: ultimos 365 dias (incluye los 45)
  moq: number; // K
  costo: number; // L
  /** M. null = no cargado, se usa ETA_DEFAULT. */
  eta: number | null;
  /** T. null = sin compra manual; 0 = bloqueo manual. */
  compraManual: number | null;
};

export type Accion =
  | "pico"
  | "baja_rotacion"
  | "disponible"
  | "riesgo"
  | "urgente"
  | "ordenar"
  | "ok";

export type Revision = "bloqueo_manual" | "revision_manual" | null;

export type ResultadoSugerido = {
  stockDisponible: number; // F
  /**
   * F + E, lo que la hoja compara contra el punto de reorden. OJO: F ya
   * incluye el transito y aca se vuelve a sumar; es asi en el Excel y se
   * dejo igual a pedido de Compras para que los numeros coincidan.
   */
  stockEfectivo: number;
  demandaDiaria: number; // I
  abc: ClaseABC; // J
  eta: number; // M
  diasInventarioDeseado: number; // N
  stockSeguridad: number; // O
  puntoReorden: number; // P
  stockObjetivo: number; // Q
  /** R. null si no hay demanda. */
  diasInventarioActual: number | null;
  /** S sin la compra manual: lo que recomienda la formula. */
  compraRecomendada: number;
  /** S: la manual si hay, si no la recomendada. */
  compraFinal: number;
  valorAComprar: number; // U
  revision: Revision; // V
  accion: Accion; // W
  /** X: dias desde hoy hasta quedarse sin stock (730 si no hay demanda). */
  diasHastaQuiebre: number;
  esPico: boolean;
};

/**
 * ROUNDUP de Excel para positivos. Excel redondea a 15 cifras antes, asi que
 * un 2.0000000000000004 que sale de la aritmetica en coma flotante es 2 y no
 * 3; se imita recortando el ruido antes del ceil.
 */
function redondearArriba(x: number): number {
  return Math.ceil(Number(x.toFixed(9)));
}

export function demandaDiaria(ventas45d: number, ventas365d: number): number {
  const d45 = ventas45d / 45;
  const d365 = ventas365d / 365;
  // Si el ultimo mes y medio vende mas del doble que el promedio del ano, se
  // toma solo lo reciente; si no, 70% reciente + 30% anual.
  return d365 < d45 * 0.5 ? d45 : d45 * 0.7 + d365 * 0.3;
}

/** ABC por valor vendido en el ano (unidades 365d x costo). */
export function clasificarABC(ventas365d: number, costo: number): ClaseABC {
  const valor = ventas365d * costo;
  return valor >= 15000 ? "A" : valor >= 5000 ? "B" : "C";
}

export function calcularSugerido(e: EntradaSugerido): ResultadoSugerido {
  const G = e.ventas45d;
  const H = e.ventas365d;
  const K = e.moq > 0 ? e.moq : 1;
  const L = e.costo;
  const M = e.eta !== null && e.eta >= 0 ? e.eta : ETA_DEFAULT;

  const F = e.fisico + e.transito - e.reservado;
  const FE = F + e.transito;
  const I = demandaDiaria(G, H);
  const J = clasificarABC(H, L);
  const N = DIAS_INVENTARIO_DESEADO[J];
  const O = Math.round(Z_SERVICIO[J] * (I * 0.15) * Math.sqrt(M));
  const P = I * (M + 7) + O;
  const Q = I * (N + M) + O;
  const R = I === 0 ? null : FE / I;

  const esPico = (J === "C" && G > 50) || (J !== "C" && G > H * 0.4);
  const ventaAnualizada = (G / 45) * 365;

  let recomendada = 0;
  if (H === 0) {
    recomendada = 0;
  } else if (esPico) {
    // Pico inusual: se compra solo hasta el punto de reorden, no el objetivo.
    recomendada = redondearArriba(Math.max(0, P - FE) / K) * K;
  } else if (FE <= P && (H >= K || ventaAnualizada >= K)) {
    const q = redondearArriba(((Q - FE) * (1 + CRECIMIENTO_POR_CLASE[J])) / K) * K;
    recomendada = q < 2 ? 0 : q;
  }

  const manual = e.compraManual;
  const compraFinal = manual !== null ? manual : recomendada;

  let revision: Revision = null;
  if (manual === 0) revision = "bloqueo_manual";
  else if (FE < P && H < K && ventaAnualizada < K) revision = "revision_manual";

  const diasHastaQuiebre = I > 0 ? FE / I : 730;

  let accion: Accion;
  if (esPico) accion = "pico";
  else if (H === 0 || (FE <= P && H < K)) accion = "baja_rotacion";
  else if (FE > Q * 1.5) accion = "disponible";
  else if (diasHastaQuiebre < M) accion = "riesgo";
  else if (FE < O) accion = "urgente";
  else if (FE <= P) accion = "ordenar";
  else accion = "ok";

  return {
    stockDisponible: F,
    stockEfectivo: FE,
    demandaDiaria: I,
    abc: J,
    eta: M,
    diasInventarioDeseado: N,
    stockSeguridad: O,
    puntoReorden: P,
    stockObjetivo: Q,
    diasInventarioActual: R,
    compraRecomendada: recomendada,
    compraFinal,
    valorAComprar: compraFinal * L,
    revision,
    accion,
    diasHastaQuiebre,
    esPico,
  };
}

/** Texto y color de cada accion, en el orden de urgencia en que se muestran. */
export const ACCIONES: Record<Accion, { label: string; clase: string; orden: number }> = {
  riesgo: { label: "Riesgo: quiebre inminente", clase: "bg-red-100 text-red-800 border-red-300", orden: 0 },
  urgente: { label: "Urgente: seguridad vulnerada", clase: "bg-rose-100 text-rose-800 border-rose-300", orden: 1 },
  ordenar: { label: "Ordenar: reponer stock", clase: "bg-orange-100 text-orange-800 border-orange-300", orden: 2 },
  pico: { label: "Pico inusual: compra contenida", clase: "bg-amber-100 text-amber-800 border-amber-300", orden: 3 },
  ok: { label: "OK: saludable", clase: "bg-emerald-100 text-emerald-800 border-emerald-300", orden: 4 },
  disponible: { label: "Disponible: inventario extendido", clase: "bg-sky-100 text-sky-800 border-sky-300", orden: 5 },
  baja_rotacion: { label: "Baja rotación: no invertir", clase: "bg-slate-100 text-slate-700 border-slate-300", orden: 6 },
};
