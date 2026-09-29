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
  /** Monto del pedido sin IVA (USD) con el que se decidió `ruta_gratis`. */
  monto_base?: number | string | null;
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

/** 1 gratis, 0 paga flete, null si no aplica o no se puede calcular (moneda distinta de USD). */
export function rutaEsGratis(
  companyId: number | null | undefined,
  rutaNombre: string | null | undefined,
  montoBase: number,
  moneda: string | null | undefined,
): number | null {
  const minimo = minimoRutaGratis(companyId, rutaNombre);
  if (minimo === null || (moneda && moneda.toUpperCase() !== "USD")) return null;
  return montoBase >= minimo ? 1 : 0;
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
