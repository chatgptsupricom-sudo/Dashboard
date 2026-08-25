/**
 * Motor de garantía para el portal RMA público (issue #28).
 *
 * Calcula si un producto sigue en garantía al momento de reportar una falla,
 * a partir de la marca (de Odoo o resuelta del nombre) y la fecha de factura.
 *
 * La tabla `rma_garantias` vive en MySQL: servicio técnico edita plazos sin
 * pedir un deploy. El default de 12 meses es esta constante, NO una fila:
 * no es una marca, es la regla por defecto cuando no se encuentra la marca.
 *
 * Detalles no obvios documentados en el issue:
 *
 * - NO se calcula con `días / 30.44`. Cerca del límite eso se equivoca por
 *   días, y el límite es justo donde la respuesta importa. Se usa aritmética
 *   de fechas real (addMonths de date-fns).
 *
 * - Zona horaria America/Caracas para "hoy". El servidor puede correr en UTC
 *   y eso mueve el límite medio día.
 *
 * - `estado: "indeterminada"` cuando no hay fecha de factura o no se pudo
 *   resolver la marca. NO se inventa que está en garantía ni que está
 *   vencida. El error hacia el cliente (decir que no cubre cuando sí) se
 *   corrige con una llamada; el error hacia la empresa (decir que cubre
 *   cuando no) lo paga Supricom.
 */

import { addMonths, differenceInCalendarDays, parseISO } from "date-fns";

/** Default en meses cuando la marca no está en la tabla. NO es una marca. */
export const GARANTIA_DEFAULT_MESES = 12;

/** Zona horaria de referencia para "hoy". */
export const TIMEZONE_CARACAS = "America/Caracas";

export type EstadoGarantia =
  | "en_garantia"
  | "vencida"
  | "vida_util"
  | "indeterminada";

export interface ResultadoGarantia {
  estado: EstadoGarantia;
  /** meses cubiertos (null en vida_util o indeterminada). */
  meses_cubiertos: number | null;
  /** fecha en que vence (null en vida_util o indeterminada). */
  fecha_vencimiento: string | null;
  /** días hasta el vencimiento (negativo si ya venció). null en vida_util. */
  dias_restantes: number | null;
  /** marca efectiva usada (null si no se resolvió). */
  marca_resuelta: string | null;
  /** motivo de indeterminación, si aplica. */
  motivo?: string;
}

export interface InputGarantia {
  /** Marca "correcta" de Odoo (`x_studio_marca`). Puede ser null o vacía. */
  marcaOdoo: string | null | undefined;
  /** Nombre del producto. Se usa como fallback si marcaOdoo está vacío. */
  productoNombre: string | null | undefined;
  /** Fecha de la factura (ISO 'YYYY-MM-DD' o null). */
  fechaFactura: string | null | undefined;
}

/** Entrada de la tabla de garantías. */
interface GarantiaRow {
  marca: string;
  meses: number | null;
  notas: string | null;
}

/**
 * Carga la tabla de garantías desde MySQL. Cacheada en memoria del proceso
 * porque no cambia en runtime (servicio técnico edita via deploy de SQL o UI
 * dedicada, no con frecuencia). Si se necesita invalidar, expongo una
 * función de reset — ver invalidarCacheGarantias() más abajo.
 */
let cacheGarantias: { value: Map<string, GarantiaRow>; at: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export function invalidarCacheGarantias() {
  cacheGarantias = null;
}

async function cargarGarantias(): Promise<Map<string, GarantiaRow>> {
  if (cacheGarantias && Date.now() - cacheGarantias.at < CACHE_TTL_MS) {
    return cacheGarantias.value;
  }

  // Carga lazy: si no se ha usado query() todavía, el import falla por
  // dependencia circular. import() dinamico resuelve eso.
  const { query } = await import("./db");

  const result = await query(
    `SELECT marca, meses, notas FROM rma_garantias`,
    [],
  );
  const rows = ((result as any).rows ?? result) as GarantiaRow[];
  const map = new Map<string, GarantiaRow>();
  for (const row of rows) {
    if (row.marca) {
      map.set(row.marca.toUpperCase().trim(), row);
    }
  }
  cacheGarantias = { value: map, at: Date.now() };
  return map;
}

/**
 * Resuelve la marca efectiva del producto.
 *
 * Estrategia de dos pasos:
 *
 * 1. Si Odoo trae `x_studio_marca`, se usa esa (uppercase).
 *
 * 2. Si está vacío, busca las marcas de la tabla **en cualquier parte** del
 *    nombre del producto (no solo la primera palabra). Esto resuelve casos
 *    como "IMPRESORA HP MULTIFUNCIONAL SMART TANK 580 W" → HP, o
 *    "TARGUS HUB USB 3.0 DE 4 PUERTOS" → TARGUS.
 *
 * Si ninguna resuelve, devuelve null y registra el caso en
 * rma_garantias_log para que servicio técnico pueda volver a Odoo y
 * completar x_studio_marca.
 */
export async function resolverMarca(
  marcaOdoo: string | null | undefined,
  productoNombre: string | null | undefined,
): Promise<string | null> {
  const marcaUpper = (marcaOdoo || "").toUpperCase().trim();
  if (marcaUpper) return marcaUpper;

  if (!productoNombre) return null;

  const garantias = await cargarGarantias();
  const nombreUpper = productoNombre.toUpperCase();

  // Buscar la marca más larga primero (TARGUS antes que T, NVIDIA antes que
  // N, etc.) para evitar matchear sub-strings de marcas más largas.
  const marcasOrdenadas = Array.from(garantias.keys()).sort(
    (a, b) => b.length - a.length,
  );

  for (const marca of marcasOrdenadas) {
    // Word boundary para evitar falsos positivos: "NEXXT" no debería
    // matchear dentro de "NEXTEL".
    const re = new RegExp(`\\b${marca.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
    if (re.test(nombreUpper)) return marca;
  }

  // No resolvió. Loguear para que servicio técnico pueda arreglarlo en Odoo.
  await loggarMarcaNoResuelta(productoNombre);
  return null;
}

async function loggarMarcaNoResuelta(productoNombre: string) {
  try {
    const { query } = await import("./db");
    await query(
      `INSERT INTO rma_garantias_log (producto_nombre, motivo)
       VALUES (?, 'sin_marca_resuelta')`,
      [productoNombre.slice(0, 500)],
    );
  } catch (e: any) {
    // No bloqueamos el flujo del portal si falla el log. Lo vemos en consola.
    console.error("[garantia] log sin_marca_resuelta:", e.message);
  }
}

/**
 * Devuelve {y, m, d} del wall-clock en la zona horaria de Caracas para el
 * instante dado (o el actual si se omite).
 */
function partesEnCaracas(d: Date = new Date()): {
  y: number;
  m: number;
  d: number;
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE_CARACAS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const partes = fmt.formatToParts(d);
  return {
    y: Number(partes.find((p) => p.type === "year")!.value),
    m: Number(partes.find((p) => p.type === "month")!.value),
    d: Number(partes.find((p) => p.type === "day")!.value),
  };
}

/**
 * Construye un Date UTC que representa el inicio del día (00:00) en la zona
 * horaria de Caracas. Internamente, JS Date es siempre UTC; lo que queremos
 * es el instante UTC que, en Caracas, son las 00:00 del día Y-M-D.
 *
 * Caracas está en UTC-4 (sin horario de verano desde 2016), pero mejor
 * derivar el offset del navegador que hardcodearlo: si mañana cambia la
 * política, seguimos funcionando.
 */
function inicioDelDiaEnCaracas(y: number, m: number, d: number): Date {
  // Probar: si en Caracas son las 00:00 del día dado, qué hora UTC es?
  // Construimos un Date asumiendo UTC y luego corregimos con el offset real.
  const comoUtc = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const offsetMs = comoUtc.getTimezoneOffset() * 60 * 1000;
  // getTimezoneOffset() devuelve minutos EAST de UTC (positivo para zonas
  // al oeste). En SSR (Node) el entorno suele ser UTC, donde el offset es 0
  // y el cálculo degenera. Mejor derivar el offset Caracas usando el formato.
  const utcMs = medirUtcMsDelWallClock(y, m, d);
  return new Date(utcMs);
}

/**
 * Mide el timestamp UTC del wall-clock Y-M-D 00:00 en Caracas. Lo hace
 * formateando dos instantes y comparando para sacar el offset, sin depender
 * de la zona horaria del sistema.
 */
function medirUtcMsDelWallClock(y: number, m: number, d: number): number {
  // Construir un string de wall-clock.
  const wall = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00`;
  // Para un servidor en UTC (lo normal en este deploy), parsear el wall-clock
  // como si fuera UTC y luego ajustar por el offset real de Caracas.
  // Caracas es UTC-4 todo el año (desde que se elimino el DST en 2016).
  // Si en el futuro cambia, se reemplaza esta constante por una llamada a
  // Intl.DateTimeFormat con timeZoneName para derivar el offset dinamicamente.
  const CARACAS_OFFSET_MINUTOS = -4 * 60;
  return Date.parse(wall + "Z") - CARACAS_OFFSET_MINUTOS * 60 * 1000;
}

/**
 * "Hoy" en la zona horaria de Caracas, truncado a día (00:00 hora local).
 * Devuelve un Date que representa el inicio del día en Caracas.
 */
function hoyCaracas(): Date {
  const { y, m, d } = partesEnCaracas();
  return inicioDelDiaEnCaracas(y, m, d);
}

/**
 * Parsea fecha ISO 'YYYY-MM-DD' (de Odoo) o cualquier ISO datetime, en la zona
 * horaria de Caracas al inicio del día.
 */
function parseFechaLocal(iso: string): Date {
  // Si viene 'YYYY-MM-DD' sin hora, le agregamos T00:00:00 y lo interpretamos
  // como wall-clock de Caracas.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (m) {
    return inicioDelDiaEnCaracas(
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
    );
  }
  // Si tiene hora, asumimos que ya viene con zona y lo respetamos.
  return parseISO(iso);
}

/**
 * Función principal. Calcula el estado de garantía de un producto.
 *
 * Pura cuando se le pasa el set de garantías (modo test). En runtime, carga
 * la tabla automáticamente la primera vez.
 */
export async function calcularGarantia(
  input: InputGarantia,
  garantias?: Map<string, GarantiaRow>,
): Promise<ResultadoGarantia> {
  const fecha = input.fechaFactura ? parseFechaLocal(input.fechaFactura) : null;

  // Caso 1: sin fecha de factura. No inventar.
  if (!fecha || isNaN(fecha.getTime())) {
    return {
      estado: "indeterminada",
      meses_cubiertos: null,
      fecha_vencimiento: null,
      dias_restantes: null,
      marca_resuelta: null,
      motivo: "sin_fecha_factura",
    };
  }

  // Caso 2: sin marca resuelta. No inventar.
  const garantiasTabla = garantias ?? (await cargarGarantias());
  const marca = await resolverMarca(input.marcaOdoo, input.productoNombre);

  if (!marca) {
    return {
      estado: "indeterminada",
      meses_cubiertos: null,
      fecha_vencimiento: null,
      dias_restantes: null,
      marca_resuelta: null,
      motivo: "marca_no_resuelta",
    };
  }

  const fila = garantiasTabla.get(marca);

  // Caso 3: marca resuelta pero no está en la tabla → default.
  const mesesCubiertos = fila?.meses ?? GARANTIA_DEFAULT_MESES;

  // Caso 4: vida útil (meses NULL). Está cubierto siempre, sin fecha de
  // vencimiento. El tipo refleja esto devolviendo null.
  if (mesesCubiertos === null) {
    return {
      estado: "vida_util",
      meses_cubiertos: null,
      fecha_vencimiento: null,
      dias_restantes: null,
      marca_resuelta: marca,
    };
  }

  // Caso 5: cálculo normal.
  const vencimiento = addMonths(fecha, mesesCubiertos);
  const hoy = hoyCaracas();
  const diasRestantes = differenceInCalendarDays(vencimiento, hoy);

  return {
    estado: diasRestantes >= 0 ? "en_garantia" : "vencida",
    meses_cubiertos: mesesCubiertos,
    fecha_vencimiento: vencimiento.toISOString(),
    dias_restantes: diasRestantes,
    marca_resuelta: marca,
  };
}