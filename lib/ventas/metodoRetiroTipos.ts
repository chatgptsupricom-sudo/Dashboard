import type { TipoEntrega } from "@/lib/seguridad/egresoFlujo";

/**
 * Tipos y etiquetas del método de retiro de un pedido, sin dependencias de
 * servidor: los usan las pantallas y lib/ventas/metodoRetiro.ts.
 */
/**
 * transporte: transporte externo que manda el cliente (su propio flete o una
 * empresa que contrata). Va con la empresa (en `agencia`) y una descripción
 * opcional (en `nota`).
 */
export const METODOS_RETIRO = ["sucursal", "ruta", "encomienda", "transporte"] as const;
export type MetodoRetiro = (typeof METODOS_RETIRO)[number];

export function esMetodoRetiro(v: unknown): v is MetodoRetiro {
  return typeof v === "string" && (METODOS_RETIRO as readonly string[]).includes(v);
}

/**
 * El tipo de entrega del egreso (lib/seguridad/egresoFlujo) que le corresponde.
 * El transporte externo retira en la sucursal como el cliente: "puerta" (sin
 * vehículo propio ni empaquetado).
 */
export function tipoEntregaDeMetodo(m: MetodoRetiro): TipoEntrega {
  return m === "sucursal" || m === "transporte" ? "puerta" : m;
}

export type FilaMetodo = {
  odoo_sale_id: number;
  metodo: MetodoRetiro;
  ruta_id: number | null;
  ruta_nombre: string | null;
  agencia: string | null;
  nota: string | null;
  registrado_por: string | null;
  updated_at: string;
  /** Solo ruta en Valencia y Panamá: 1 = gratis, 0 = el cliente paga el flete, null = no aplica. */
  ruta_gratis?: number | null;
  /** Monto sin IVA (USD) con el que se decidió `ruta_gratis`. */
  monto_base?: number | string | null;
  /** Lo que marcó el vendedor al guardar, antes de recalcular con lo facturado. */
  ruta_gratis_vendedor?: number | null;
  /** Facturado sin IVA (facturas menos notas de crédito), si ya hay factura. */
  monto_facturado?: number | string | null;
  /** Aviso para Almacén / Ventas (ruta gratis perdida, ruta que no es la del cliente). */
  alerta?: string | null;
  /** Lo que decidió el primer egreso (ver fijarRutaGratisFinal). */
  ruta_gratis_final?: number | null;
  /** Cuándo se fijó `ruta_gratis_final`; con valor, ya no se recalcula. */
  recalculado_at?: string | null;
};

/**
 * Con qué monto se decide la ruta gratis:
 *  - sin factura: el pedido;
 *  - con todo facturado, o con alguna nota de crédito: lo facturado (menos
 *    las NC). Es el control contra bajar el pedido después de marcarlo;
 *  - facturado en parte y sin NC: el pedido. Un pedido que se despacha en
 *    dos entregas se factura por partes, y con lo facturado la primera orden
 *    perdía la ruta gratis (400 $ de un pedido de 1.200 $).
 */
export function montoRutaGratis(d: {
  base_pedido: number;
  facturado: number | null;
  por_facturar?: boolean;
  con_nota_credito?: boolean;
}): { monto: number; fuente: "pedido" | "facturado" } {
  if (d.facturado === null) return { monto: d.base_pedido, fuente: "pedido" };
  if (d.por_facturar && !d.con_nota_credito) return { monto: d.base_pedido, fuente: "pedido" };
  return { monto: d.facturado, fuente: "facturado" };
}

/** Sedes con monto mínimo de ruta gratis: Valencia (9) y Panamá (7). */
export const CIDS_VALENCIA = 9;
export const CIDS_PANAMA = 7;

/**
 * De qué sede es una ruta o agencia (`cids` de sql/panama_rutas_agencias.sql):
 * NULL = las de Venezuela (Valencia y Caracas), 7 = Panamá. Un pedido de
 * Panamá solo ve las suyas, y uno de Venezuela solo las de NULL.
 */
export function esDeLaSede(cidsOpcion: number | null | undefined, companyId: number | null | undefined): boolean {
  const deOpcion = cidsOpcion === null || cidsOpcion === undefined ? null : Number(cidsOpcion);
  return companyId === CIDS_PANAMA ? deOpcion === CIDS_PANAMA : deOpcion === null;
}

/** El impuesto que se descuenta para el mínimo: ITBMS en Panamá, IVA en Venezuela. */
export function nombreImpuesto(companyId: number | null | undefined): string {
  return companyId === CIDS_PANAMA ? "ITBMS" : "IVA";
}

/**
 * Monto mínimo del pedido, sin impuesto y en USD, para que la ruta sea
 * gratis. Debajo del mínimo el pedido igual va por ruta, pero el cliente
 * paga el flete. null = no aplica (otra sucursal o sin ruta).
 *  - Valencia: ruta Valencia (Carabobo) 300 $; cualquier otra ruta 1000 $.
 *  - Panamá (Gabriel Camacho, 29/9/2026): 200 $; el viaje a Colón o a La
 *    Chorrera, 2.500 $. Sale del nombre de la ruta.
 */
export function minimoRutaGratis(companyId: number | null | undefined, rutaNombre: string | null | undefined): number | null {
  if (!rutaNombre) return null;
  if (companyId === CIDS_VALENCIA) return /valencia/i.test(rutaNombre) ? 300 : 1000;
  if (companyId === CIDS_PANAMA) return /col[oó]n|chorrera/i.test(rutaNombre) ? 2500 : 200;
  return null;
}

export type EvaluacionRuta = {
  /** 1 gratis, 0 paga flete, null no aplica o no se puede calcular (moneda distinta de USD). */
  gratis: number | null;
  minimo: number | null;
  alerta: string | null;
};

/**
 * Si la ruta es gratis, con dos controles contra la viveza:
 *  - el monto es el de `montoRutaGratis` (lo facturado sin impuesto, o el
 *    pedido mientras se factura por partes);
 *  - la ruta Valencia (300 $) es solo para clientes de Carabobo: si la
 *    dirección de entrega es de otro estado, se exige el mínimo general. En
 *    Panamá, igual: una entrega en la provincia de Colón por la ruta de la
 *    ciudad (200 $) es el viaje a Colón (2.500 $).
 */
export function evaluarRutaGratis(o: {
  companyId: number | null | undefined;
  rutaNombre: string | null | undefined;
  monto: number;
  moneda?: string | null;
  estadoCliente?: string | null;
}): EvaluacionRuta {
  let minimo = minimoRutaGratis(o.companyId, o.rutaNombre);
  let alerta: string | null = null;
  if (minimo === null) return { gratis: null, minimo: null, alerta: null };
  if (minimo === 300 && o.estadoCliente && !/carabobo/i.test(o.estadoCliente)) {
    minimo = 1000;
    alerta = `La dirección de entrega es de ${o.estadoCliente.replace(/\s*\(VE\)\s*$/i, "")}: la ruta Valencia (300 $) es solo para Carabobo, se exige el mínimo de 1000 $`;
  } else if (minimo === 300 && !o.estadoCliente) {
    // Sin estado no se puede confirmar que sea de Carabobo: se deja el
    // mínimo de 300 $ (el dato falta en Odoo, no es culpa del cliente), pero
    // se avisa en vez de pasarlo callado.
    alerta = "La dirección de entrega no tiene estado en Odoo: no se pudo confirmar que sea de Carabobo (ruta Valencia, 300 $)";
  } else if (o.companyId === CIDS_PANAMA && minimo === 200 && o.estadoCliente && /col[oó]n/i.test(o.estadoCliente)) {
    minimo = 2500;
    alerta = `La dirección de entrega es de ${o.estadoCliente.replace(/\s*\(PA\)\s*$/i, "")}: es el viaje a Colón, se exige el mínimo de 2.500 $`;
  }
  // El balboa (PAB) va a la par del dólar: en Panamá no es "otra moneda".
  if (o.moneda && !["USD", "PAB"].includes(o.moneda.toUpperCase())) {
    // El mínimo es en USD. Con lo facturado (en la moneda de la compañía,
    // USD) el caller pasa "USD"; esto queda para un pedido en otra moneda
    // todavía sin facturar, que antes pasaba sin ningún aviso.
    const aviso = `El pedido está en ${o.moneda}: la ruta gratis se decide con lo facturado`;
    return { gratis: null, minimo, alerta: alerta ? `${alerta}. ${aviso}` : aviso };
  }
  return { gratis: o.monto >= minimo ? 1 : 0, minimo, alerta };
}

/** Atajo: solo el 1 / 0 / null de evaluarRutaGratis. */
export function rutaEsGratis(
  companyId: number | null | undefined,
  rutaNombre: string | null | undefined,
  montoBase: number,
  moneda: string | null | undefined,
  estadoCliente?: string | null,
): number | null {
  return evaluarRutaGratis({ companyId, rutaNombre, monto: montoBase, moneda, estadoCliente }).gratis;
}

/** Texto corto para mostrar el método ("Ruta · Valencia", "Encomienda · MRW"). */
export function describirMetodo(m: Pick<FilaMetodo, "metodo" | "ruta_nombre" | "agencia" | "ruta_gratis">): string {
  if (m.metodo === "ruta") {
    const flete = m.ruta_gratis === 1 ? " · gratis" : m.ruta_gratis === 0 ? " · flete a cargo del cliente" : "";
    return `Ruta${m.ruta_nombre ? ` · ${m.ruta_nombre}` : ""}${flete}`;
  }
  if (m.metodo === "encomienda") return `Encomienda${m.agencia ? ` · ${m.agencia}` : ""}`;
  if (m.metodo === "transporte") return `Transporte externo${m.agencia ? ` · ${m.agencia}` : ""}`;
  return "Retiro en sucursal";
}
