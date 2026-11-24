/**
 * Pagos fijos del calendario de Cuentas por Pagar (lo puro: sin base ni Odoo).
 * Chequeo: node scripts/check-pagos-fijos.cjs
 *
 * Un pago fijo es algo que se paga todos los meses al mismo proveedor (alquiler,
 * internet, vigilancia...). Se da por pagado cuando en Odoo hay un pago a ese
 * proveedor, de esa sede, dentro del mes: no hace falta marcarlo a mano.
 */

export interface PagoFijo {
  id: number;
  sede: string;
  nombre: string;
  proveedorId: number;
  proveedor: string;
  monto: number;
  /** Dia del mes (1-31); en un mes mas corto cae el ultimo dia. */
  dia: number;
  notas: string;
  /** YYYY-MM: sale desde ese mes y, si hay `hastaMes`, hasta ese mes. */
  desdeMes: string;
  hastaMes: string | null;
}

/** Lo minimo de un pago de Odoo para cruzarlo. */
export interface PagoParaCruce {
  id: number;
  fecha: string;
  proveedorId: number | null;
  monto: number;
  sede: string;
}

export type EstadoPagoFijo = "pagado" | "pendiente" | "vencido";

export interface PagoFijoDelMes extends PagoFijo {
  /** Dia que le toca en el mes (YYYY-MM-DD). */
  fecha: string;
  estado: EstadoPagoFijo;
  pagoId: number | null;
  pagadoEl: string | null;
  montoPagado: number | null;
}

/** Dia `dia` del mes `mes` (YYYY-MM); si el mes no lo tiene, el ultimo. */
export function fechaEnMes(mes: string, dia: number): string {
  const [a, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, "0")}`;
}

export function vigenteEnMes(f: PagoFijo, mes: string): boolean {
  return f.desdeMes <= mes && (!f.hastaMes || f.hastaMes >= mes);
}

/**
 * Pagos fijos del mes con su estado. Cada pago de Odoo cuenta para un solo
 * pago fijo: si hay dos fijos al mismo proveedor, cada uno toma el pago de
 * monto mas parecido.
 * shortcut: asignacion voraz por dia del mes, no optima; basta mientras haya
 * pocos fijos por proveedor.
 */
export function cruzarPagosFijos(
  fijos: PagoFijo[],
  pagos: PagoParaCruce[],
  mes: string,
  hoy: string,
): PagoFijoDelMes[] {
  const usados = new Set<number>();
  return fijos
    .filter((f) => vigenteEnMes(f, mes))
    .sort((a, b) => a.dia - b.dia || a.id - b.id)
    .map((f) => {
      const fecha = fechaEnMes(mes, f.dia);
      const candidato = pagos
        .filter((p) => !usados.has(p.id) && p.sede === f.sede && p.proveedorId === f.proveedorId)
        .sort((a, b) => Math.abs(a.monto - f.monto) - Math.abs(b.monto - f.monto) || a.fecha.localeCompare(b.fecha))[0];
      if (candidato) usados.add(candidato.id);
      return {
        ...f,
        fecha,
        estado: candidato ? "pagado" : fecha < hoy ? "vencido" : "pendiente",
        pagoId: candidato?.id ?? null,
        pagadoEl: candidato?.fecha ?? null,
        montoPagado: candidato?.monto ?? null,
      };
    });
}
