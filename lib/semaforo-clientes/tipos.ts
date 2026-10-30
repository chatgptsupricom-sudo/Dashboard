/**
 * Semáforo de clientes (pedido de la dirección comercial, oct-2026): el
 * estado de cada cliente de la cartera según su propio historial de compras,
 * para atender a tiempo al que está comprando menos o dejó de comprar.
 *
 * Todo lo de este archivo es puro (sin Odoo ni MySQL) para que la pantalla
 * explique con las mismas reglas por qué un cliente salió de un color.
 *
 * Reglas (umbrales ajustables por el SuperAdmin, `ConfigSemaforo`):
 *
 * - Ritmo actual = lo comprado en la ventana (30/60/90 días) llevado a mes.
 * - Base = promedio mensual de los 12 meses anteriores a la ventana, contado
 *   desde su primera compra si empezó a comprar dentro de esos 12 meses (un
 *   cliente de 5 meses no se diluye entre 12).
 * - Variación = ritmo actual ÷ base − 1. Solo se juzga por monto si en la
 *   ventana le tocaban al menos 1,5 compras según su frecuencia: a un
 *   cliente que compra cada 3 meses, 30 días sin comprar no dicen nada.
 * - Frecuencia habitual = mediana de los días entre sus compras.
 * - Días sin comprar contra la frecuencia: amarillo pasado 1,5 veces su
 *   frecuencia (nunca antes de 21 días), rojo pasado 2 veces (nunca antes de
 *   42 días).
 * - Rojo: cayó 60 % o más, o lleva más del doble de su frecuencia sin comprar.
 * - Amarillo: cayó entre 30 % y 59 %, compró la mitad o menos de las veces
 *   que le tocaban (sin comprar más plata), o lleva más de 1,5 veces su
 *   frecuencia sin comprar.
 * - Si en el período compró su promedio o más, los días sin comprar pesan un
 *   nivel menos (puede estar abastecido).
 * - Estacional: si el año pasado, en las mismas fechas, también compró poco
 *   y después volvió, baja un nivel (rojo → amarillo, amarillo → verde).
 * - Nuevo / sin historial: menos de 3 días de compra o primera compra hace
 *   menos de 90 días. No se clasifica como riesgo.
 * - Sin compras: está en la cartera pero no compró en los últimos 18 meses.
 *
 * Venta = la misma de Compras y de los reportes de BI (`dominioVentas`): USD
 * sin IVA, notas de crédito restando, sin servicios ni intercompañía; antes
 * del corte de Odoo, Smartbit por RIF.
 */

export type EstadoSemaforo = "verde" | "amarillo" | "rojo" | "nuevo" | "sin_compras";

export const ESTADOS: { value: EstadoSemaforo; label: string; corto: string; color: string; fondo: string }[] = [
  { value: "verde", label: "Activo", corto: "Verde", color: "#16a34a", fondo: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "amarillo", label: "En riesgo", corto: "Amarillo", color: "#eab308", fondo: "bg-amber-50 text-amber-800 border-amber-200" },
  { value: "rojo", label: "En alerta", corto: "Rojo", color: "#dc2626", fondo: "bg-red-50 text-red-700 border-red-200" },
  { value: "nuevo", label: "Nuevo / sin historial", corto: "Nuevo", color: "#3b82f6", fondo: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "sin_compras", label: "Sin compras (18 meses)", corto: "Sin compras", color: "#94a3b8", fondo: "bg-slate-50 text-slate-600 border-slate-200" },
];

export const ESTADO = Object.fromEntries(ESTADOS.map((e) => [e.value, e])) as Record<EstadoSemaforo, (typeof ESTADOS)[number]>;

export const VENTANAS = [30, 60, 90] as const;
export type Ventana = (typeof VENTANAS)[number];

export interface ConfigSemaforo {
  /** Ventana con la que se guarda la foto semanal y abre la pantalla. */
  ventanaDias: Ventana;
  /** % de caída del ritmo contra la base para amarillo / rojo. */
  caidaAmarillo: number;
  caidaRojo: number;
  /** % de compras de menos (contra las que le tocaban) para amarillo. */
  caidaFrecuencia: number;
  /** Veces su frecuencia habitual sin comprar para amarillo / rojo. */
  factorAmarillo: number;
  factorRojo: number;
  /** Días sin comprar antes de los cuales nunca hay alerta (rojo: el doble). */
  diasMinimos: number;
  /** Días de compra distintos para tener historial. */
  minCompras: number;
  /** Días desde la primera compra para dejar de ser nuevo. */
  diasNuevo: number;
  detectarEstacional: boolean;
}

export const CONFIG_INICIAL: ConfigSemaforo = {
  ventanaDias: 90,
  caidaAmarillo: 30,
  caidaRojo: 60,
  caidaFrecuencia: 50,
  factorAmarillo: 1.5,
  factorRojo: 2,
  diasMinimos: 21,
  minCompras: 3,
  diasNuevo: 90,
  detectarEstacional: true,
};

/** Lo que se acepta de un PUT de configuración: fuera de rango vuelve al valor inicial. */
export function normalizarConfig(c: Partial<ConfigSemaforo> | null | undefined): ConfigSemaforo {
  const num = (v: unknown, min: number, max: number, def: number) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= min && n <= max ? n : def;
  };
  const i = CONFIG_INICIAL;
  const caidaAmarillo = num(c?.caidaAmarillo, 1, 99, i.caidaAmarillo);
  const factorAmarillo = num(c?.factorAmarillo, 1, 10, i.factorAmarillo);
  return {
    ventanaDias: (VENTANAS as readonly number[]).includes(Number(c?.ventanaDias)) ? (Number(c!.ventanaDias) as Ventana) : i.ventanaDias,
    caidaAmarillo,
    caidaRojo: Math.max(caidaAmarillo + 1, num(c?.caidaRojo, 2, 100, i.caidaRojo)),
    caidaFrecuencia: num(c?.caidaFrecuencia, 1, 100, i.caidaFrecuencia),
    factorAmarillo,
    factorRojo: Math.max(factorAmarillo, num(c?.factorRojo, 1, 20, i.factorRojo)),
    diasMinimos: Math.round(num(c?.diasMinimos, 0, 365, i.diasMinimos)),
    minCompras: Math.round(num(c?.minCompras, 2, 50, i.minCompras)),
    diasNuevo: Math.round(num(c?.diasNuevo, 0, 365, i.diasNuevo)),
    detectarEstacional: c?.detectarEstacional === undefined ? i.detectarEstacional : Boolean(c.detectarEstacional),
  };
}

/**
 * Días de historia que se leen (~18 meses): la base (12 meses) + la ventana
 * más larga, y otra ventana antes del mismo período del año pasado para saber
 * si el cliente ya compraba entonces (estacional).
 */
export const DIAS_HISTORIA = 365 + 2 * 90;
export const MESES_HISTORIA = 18;
const MESES_BASE = 12;
const DIAS_MES = 365 / 12;

/** Movimiento de un día: lo facturado y lo devuelto (notas de crédito), USD sin IVA. */
export interface DiaCompra {
  dia: string; // YYYY-MM-DD
  compra: number;
  devolucion: number;
}

export interface Clasificacion {
  estado: EstadoSemaforo;
  /** Por qué salió de ese color, en palabras. */
  motivos: string[];
  estacional: boolean;
  dejoDeComprar: boolean;
  venta30: number;
  venta60: number;
  venta90: number;
  /** Promedio mensual de los últimos 6 meses (lo pidió la dirección). */
  promedio6m: number;
  /** Promedio mensual de la base y ritmo mensual de la ventana. */
  base: number;
  ritmo: number;
  /** % contra la base (−45 = cayó 45 %); null sin base. */
  variacion: number | null;
  primeraCompra: string | null;
  ultimaCompra: string | null;
  diasSinComprar: number | null;
  /** Mediana de días entre compras; null con menos de 2 compras. */
  frecuencia: number | null;
  comprasVentana: number;
  comprasEsperadas: number | null;
  /** Lo que deja de comprar por mes contra su base (solo amarillo y rojo). */
  enRiesgo: number;
  /** Neto por mes "YYYY-MM" en la historia leída. */
  meses: Record<string, number>;
}

const MS_DIA = 86_400_000;
const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / MS_DIA);
export function sumarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const r2 = (n: number) => Math.round(n * 100) / 100;

function mediana(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Neto (compra − devolución) de los días en (desde, hasta]; `bruto` = sin restar las devoluciones. */
function netoEntre(dias: DiaCompra[], desde: string, hasta: string, bruto = false): number {
  let t = 0;
  for (const d of dias) if (d.dia > desde && d.dia <= hasta) t += d.compra - (bruto ? 0 : d.devolucion);
  return t;
}

const BAJAR: Partial<Record<EstadoSemaforo, EstadoSemaforo>> = { rojo: "amarillo", amarillo: "verde" };

/**
 * Estado de un cliente a la fecha `hoy` con sus movimientos de los últimos
 * `DIAS_HISTORIA` días (los de antes se ignoran).
 */
export function clasificar(movimientos: DiaCompra[], hoy: string, ventana: Ventana, cfg: ConfigSemaforo): Clasificacion {
  const inicio = sumarDias(hoy, -DIAS_HISTORIA);
  const dias = movimientos.filter((d) => d.dia > inicio && d.dia <= hoy).sort((a, b) => a.dia.localeCompare(b.dia));
  const compras = dias.filter((d) => d.compra > 0).map((d) => d.dia);

  const meses: Record<string, number> = {};
  for (const d of dias) meses[d.dia.slice(0, 7)] = r2((meses[d.dia.slice(0, 7)] ?? 0) + d.compra - d.devolucion);

  const venta = (n: number) => r2(netoEntre(dias, sumarDias(hoy, -n), hoy));
  const inicioVentana = sumarDias(hoy, -ventana);
  const inicioBase = sumarDias(inicioVentana, -Math.round(MESES_BASE * DIAS_MES));
  const primeraCompra = compras[0] ?? null;
  const ultimaCompra = compras[compras.length - 1] ?? null;

  // Base: desde su primera compra si empezó dentro de los 12 meses.
  const desdeBase = primeraCompra && primeraCompra > inicioBase ? sumarDias(primeraCompra, -1) : inicioBase;
  const mesesBase = Math.max(0, diasEntre(desdeBase, inicioVentana) / DIAS_MES);
  const mesesVentana = ventana / DIAS_MES;
  const base = mesesBase >= 1 ? Math.max(0, netoEntre(dias, inicioBase, inicioVentana) / mesesBase) : 0;
  const ritmo = Math.max(0, netoEntre(dias, inicioVentana, hoy) / mesesVentana);
  // Lo mismo sin las notas de crédito: una devolución grande de una compra
  // vieja no puede poner en rojo a un cliente que sigue comprando.
  const baseBruta = mesesBase >= 1 ? netoEntre(dias, inicioBase, inicioVentana, true) / mesesBase : 0;
  const ritmoBruto = netoEntre(dias, inicioVentana, hoy, true) / mesesVentana;

  const huecos = compras.slice(1).map((d, i) => diasEntre(compras[i], d));
  const frecuencia = huecos.length ? Math.max(1, mediana(huecos)) : null;
  const comprasVentana = compras.filter((d) => d > inicioVentana).length;
  const comprasEsperadas = frecuencia ? ventana / frecuencia : null;
  const diasSinComprar = ultimaCompra ? diasEntre(ultimaCompra, hoy) : null;
  const variacion = base > 0 ? ((ritmo - base) / base) * 100 : null;

  const salida: Clasificacion = {
    estado: "verde",
    motivos: [],
    estacional: false,
    dejoDeComprar: false,
    venta30: venta(30),
    venta60: venta(60),
    venta90: venta(90),
    promedio6m: r2(netoEntre(dias, sumarDias(hoy, -183), hoy) / 6),
    base: r2(base),
    ritmo: r2(ritmo),
    variacion: variacion === null ? null : Math.round(variacion * 10) / 10,
    primeraCompra,
    ultimaCompra,
    diasSinComprar,
    frecuencia: frecuencia === null ? null : Math.round(frecuencia),
    comprasVentana,
    comprasEsperadas: comprasEsperadas === null ? null : Math.round(comprasEsperadas * 10) / 10,
    enRiesgo: 0,
    meses,
  };

  if (!ultimaCompra) {
    salida.estado = "sin_compras";
    salida.motivos.push(`No compró en los últimos ${MESES_HISTORIA} meses.`);
    return salida;
  }
  if (compras.length < cfg.minCompras || diasEntre(primeraCompra!, hoy) < cfg.diasNuevo || base === 0) {
    salida.estado = "nuevo";
    salida.motivos.push(
      compras.length < cfg.minCompras
        ? `Solo ${compras.length} ${compras.length === 1 ? "compra" : "compras"} en ${MESES_HISTORIA} meses: no hay historial para compararlo.`
        : diasEntre(primeraCompra!, hoy) < cfg.diasNuevo
          ? `Primera compra hace ${diasEntre(primeraCompra!, hoy)} días: cliente nuevo.`
          : `No compró en los 12 meses anteriores a los últimos ${ventana} días: no hay con qué compararlo.`,
    );
    return salida;
  }

  const rojos: string[] = [];
  const amarillos: string[] = [];
  const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

  // Monto: solo si en la ventana le tocaban al menos 1,5 compras.
  const notas: string[] = [];
  if (variacion !== null && (comprasEsperadas ?? 0) >= 1.5) {
    const nivel = (v: number) => (v <= -cfg.caidaRojo ? 2 : v <= -cfg.caidaAmarillo ? 1 : 0);
    const variacionBruta = baseBruta > 0 ? ((ritmoBruto - baseBruta) / baseBruta) * 100 : variacion;
    const texto = `Compra ${fmt(ritmo)} al mes en los últimos ${ventana} días contra ${fmt(base)} de su promedio (${Math.round(variacion)} %).`;
    // Si sin las notas de crédito la caída es menor, manda la facturación.
    const n = Math.min(nivel(variacion), nivel(variacionBruta));
    if (n === 2) rojos.push(texto);
    else if (n === 1) amarillos.push(texto);
    if (nivel(variacion) > n) {
      notas.push(`Neto compra ${fmt(ritmo)} al mes (${Math.round(variacion)} %), pero es por notas de crédito: lo facturado va en ${fmt(ritmoBruto)} al mes contra ${fmt(baseBruta)}.`);
    }
  }
  // Frecuencia: compró muchas menos veces de las que le tocaban, y no más
  // plata (menos pedidos pero más grandes no es riesgo).
  const compraMas = variacion !== null && variacion >= 0;
  if (
    !compraMas &&
    comprasEsperadas !== null &&
    comprasEsperadas >= 3 &&
    comprasVentana <= comprasEsperadas * (1 - cfg.caidaFrecuencia / 100)
  ) {
    amarillos.push(`Compró ${comprasVentana} ${comprasVentana === 1 ? "vez" : "veces"} en ${ventana} días; por su frecuencia le tocaban unas ${Math.round(comprasEsperadas)}.`);
  }
  // Días sin comprar contra su frecuencia habitual.
  if (frecuencia !== null && diasSinComprar !== null) {
    const limiteRojo = Math.max(frecuencia * cfg.factorRojo, cfg.diasMinimos * 2);
    const limiteAmarillo = Math.max(frecuencia * cfg.factorAmarillo, cfg.diasMinimos);
    // Si en el período compró su promedio o más, puede estar abastecido: un nivel menos.
    const texto = `Lleva ${diasSinComprar} días sin comprar; suele comprar cada ${Math.round(frecuencia)} días${compraMas ? " (en el período compró más que su promedio: puede estar abastecido)" : ""}.`;
    const n = (diasSinComprar > limiteRojo ? 2 : diasSinComprar > limiteAmarillo ? 1 : 0) - (compraMas ? 1 : 0);
    if (n === 2) rojos.push(texto);
    else if (n === 1) amarillos.push(texto);
  }

  salida.estado = rojos.length ? "rojo" : amarillos.length ? "amarillo" : "verde";
  salida.motivos = [...rojos, ...amarillos, ...notas];
  salida.dejoDeComprar = comprasVentana === 0 && rojos.length > 0;

  // Estacional: el año pasado, en las mismas fechas, también compró poco y después volvió.
  if (cfg.detectarEstacional && salida.estado !== "verde" && primeraCompra! <= sumarDias(hoy, -365 - ventana)) {
    const hace1 = sumarDias(hoy, -365);
    const ritmoAnterior = Math.max(0, netoEntre(dias, sumarDias(hace1, -ventana), hace1) / (ventana / DIAS_MES));
    const volvio = compras.some((d) => d > hace1 && d <= inicioVentana);
    if (ritmoAnterior <= base * (1 - cfg.caidaAmarillo / 100) && volvio) {
      salida.estacional = true;
      salida.estado = BAJAR[salida.estado] ?? salida.estado;
      salida.motivos.push(`Estacional: en estas mismas fechas del año pasado compró ${fmt(ritmoAnterior)} al mes y después volvió a comprar.`);
    }
  }

  if (salida.estado === "verde" && !rojos.length && !amarillos.length && !salida.estacional) salida.motivos.unshift("Compra dentro de su ritmo y frecuencia habituales.");
  if (salida.estado === "amarillo" || salida.estado === "rojo") salida.enRiesgo = r2(Math.max(0, base - ritmo));
  return salida;
}

// ---------------------------------------------------------------------------
// Filas de la API
// ---------------------------------------------------------------------------

export interface FilaSemaforo extends Clasificacion {
  /** `res.partner` (empresa) de la sede. */
  id: number;
  companyId: number;
  cliente: string;
  rif: string;
  vendedorId: number | null;
  vendedor: string;
  ultimoContacto: string | null;
  /** De dónde salió el último contacto (cotización, nota, actividad…). */
  contactoOrigen: string | null;
  /** Estado de la última foto semanal anterior a esta semana (null si no hay). */
  estadoAnterior: EstadoSemaforo | null;
}

export interface RespuestaSemaforo {
  hoy: string;
  ventana: Ventana;
  config: ConfigSemaforo;
  sedes: number[];
  filas: FilaSemaforo[];
  /** Semana (lunes) de la foto con la que se compara `estadoAnterior`. */
  fotoAnterior: string | null;
  /** La foto de esta semana está guardada (false si la MySQL no respondió o es otra ventana). */
  fotoEstaSemana: boolean;
  /** Smartbit no respondió: la historia antes del corte de Odoo no está. */
  sinSmartbit: boolean;
  /** Puede cambiar los umbrales (SuperAdmin). */
  puedeConfigurar: boolean;
  /** Solo ve su cartera (vendedor). */
  soloCartera: boolean;
  /** Elige sede (SuperAdmin y BI). */
  eligeSede: boolean;
}

export const NOMBRE_SEDE: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

/** Peor a mejor, para ordenar. */
export const ORDEN_ESTADO: Record<EstadoSemaforo, number> = { rojo: 0, amarillo: 1, verde: 2, nuevo: 3, sin_compras: 4 };

/** Resumen por vendedor para la gerencia. */
export interface ResumenVendedor {
  vendedorId: number | null;
  vendedor: string;
  companyId: number;
  total: number;
  verde: number;
  amarillo: number;
  rojo: number;
  nuevo: number;
  sinCompras: number;
  dejaronDeComprar: number;
  /** Facturación mensual en riesgo (base − ritmo de amarillos y rojos). */
  enRiesgo: number;
  /** Rojos + amarillos sobre los clasificables (verde + amarillo + rojo). */
  pctRiesgo: number;
  /** Venta de los últimos 90 días de toda su cartera. */
  venta90: number;
  mejoraron: number;
  empeoraron: number;
}

export function resumenPorVendedor(filas: FilaSemaforo[]): ResumenVendedor[] {
  const mapa = new Map<string, ResumenVendedor>();
  for (const f of filas) {
    const llave = `${f.companyId}|${f.vendedorId ?? 0}`;
    let r = mapa.get(llave);
    if (!r) {
      r = {
        vendedorId: f.vendedorId,
        vendedor: f.vendedor,
        companyId: f.companyId,
        total: 0, verde: 0, amarillo: 0, rojo: 0, nuevo: 0, sinCompras: 0,
        dejaronDeComprar: 0, enRiesgo: 0, pctRiesgo: 0, venta90: 0, mejoraron: 0, empeoraron: 0,
      };
      mapa.set(llave, r);
    }
    r.total++;
    if (f.estado === "sin_compras") r.sinCompras++;
    else r[f.estado]++;
    if (f.dejoDeComprar) r.dejaronDeComprar++;
    r.enRiesgo += f.enRiesgo;
    r.venta90 += f.venta90;
    const cambio = cambioDeEstado(f);
    if (cambio === "mejoro") r.mejoraron++;
    if (cambio === "empeoro") r.empeoraron++;
  }
  return [...mapa.values()]
    .map((r) => {
      const clasificables = r.verde + r.amarillo + r.rojo;
      return {
        ...r,
        enRiesgo: r2(r.enRiesgo),
        venta90: r2(r.venta90),
        pctRiesgo: clasificables ? Math.round(((r.amarillo + r.rojo) / clasificables) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.enRiesgo - a.enRiesgo);
}

/** Si el cliente subió o bajó de color contra la foto anterior (solo entre verde, amarillo y rojo). */
export function cambioDeEstado(f: Pick<FilaSemaforo, "estado" | "estadoAnterior">): "mejoro" | "empeoro" | null {
  const nivel: Partial<Record<EstadoSemaforo, number>> = { verde: 0, amarillo: 1, rojo: 2 };
  const antes = f.estadoAnterior ? nivel[f.estadoAnterior] : undefined;
  const ahora = nivel[f.estado];
  if (antes === undefined || ahora === undefined || antes === ahora) return null;
  return ahora < antes ? "mejoro" : "empeoro";
}
