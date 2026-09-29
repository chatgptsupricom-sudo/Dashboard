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
};

/** Texto corto para mostrar el método ("Ruta · Valencia", "Encomienda · MRW"). */
export function describirMetodo(m: Pick<FilaMetodo, "metodo" | "ruta_nombre" | "agencia">): string {
  if (m.metodo === "ruta") return `Ruta${m.ruta_nombre ? ` · ${m.ruta_nombre}` : ""}`;
  if (m.metodo === "encomienda") return `Encomienda${m.agencia ? ` · ${m.agencia}` : ""}`;
  return "Retiro en sucursal";
}
