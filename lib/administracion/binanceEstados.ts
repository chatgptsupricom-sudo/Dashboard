import type { EstadoComprobante } from "@/lib/administracion/binance";

// Aparte de binance.ts para que la pantalla lo importe sin traerse la base ni sharp.
export const ETIQUETA_ESTADO: Record<EstadoComprobante, string> = {
  conciliado: "Conciliado",
  manual: "Conciliado a mano",
  por_monto_hora: "Coincide solo por monto (revisar)",
  monto_distinto: "Monto distinto",
  no_encontrado: "No está en Binance",
  sin_verificar: "Sin verificar",
};
