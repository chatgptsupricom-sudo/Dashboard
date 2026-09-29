import type { TipoEntrega } from "@/lib/seguridad/egresoFlujo";

/**
 * Tipos y etiquetas del método de retiro de un pedido, sin dependencias de
 * servidor: los usan las pantallas y lib/ventas/metodoRetiro.ts.
 */
export const METODOS_RETIRO = ["sucursal", "ruta", "encomienda"] as const;
export type MetodoRetiro = (typeof METODOS_RETIRO)[number];

export function esMetodoRetiro(v: unknown): v is MetodoRetiro {
  return typeof v === "string" && (METODOS_RETIRO as readonly string[]).includes(v);
}

/** El tipo de entrega del egreso (lib/seguridad/egresoFlujo) que le corresponde. */
export function tipoEntregaDeMetodo(m: MetodoRetiro): TipoEntrega {
  return m === "sucursal" ? "puerta" : m;
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
  /** Solo ruta en Valencia: 1 = gratis, 0 = el cliente paga el flete, null = no aplica. */
  ruta_gratis?: number | null;
  /** Monto sin IVA (USD) con el que se decidió `ruta_gratis`. */
  monto_base?: number | string | null;
  /** Lo que marcó el vendedor al guardar, antes de recalcular con lo facturado. */
  ruta_gratis_vendedor?: number | null;
  /** Facturado sin IVA (facturas menos notas de crédito), si ya hay factura. */
  monto_facturado?: number | string | null;
  /** Aviso para Almacén / Ventas (ruta gratis perdida, ruta que no es la del cliente). */
  alerta?: string | null;
};

/** Sucursal Valencia (cids 9): la única con monto mínimo de ruta gratis por ahora. */
export const CIDS_VALENCIA = 9;

/**
 * Monto mínimo del pedido, sin IVA y en USD, para que la ruta sea gratis
 * (pedidos de la sucursal Valencia):
 *  - ruta Valencia (Carabobo): 300 $
 *  - cualquier otra ruta: 1000 $
 * Debajo del mínimo el pedido igual va por ruta, pero el cliente paga el
 * flete. null = no aplica (otra sucursal o sin ruta).
 */
export function minimoRutaGratis(companyId: number | null | undefined, rutaNombre: string | null | undefined): number | null {
  if (companyId !== CIDS_VALENCIA || !rutaNombre) return null;
  return /valencia/i.test(rutaNombre) ? 300 : 1000;
}

export type EvaluacionRuta = {
  /** 1 gratis, 0 paga flete, null no aplica o no se puede calcular (moneda distinta de USD). */
  gratis: number | null;
  minimo: number | null;
  alerta: string | null;
};

/**
 * Si la ruta es gratis, con dos controles contra la viveza:
 *  - el monto es lo FACTURADO sin IVA (facturas menos notas de crédito)
 *    cuando ya hay factura; antes, el del pedido;
 *  - la ruta Valencia (300 $) es solo para clientes de Carabobo: si la
 *    dirección de entrega es de otro estado, se exige el mínimo general.
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
  }
  if (o.moneda && o.moneda.toUpperCase() !== "USD") return { gratis: null, minimo, alerta };
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
  return "Retiro en sucursal";
}
