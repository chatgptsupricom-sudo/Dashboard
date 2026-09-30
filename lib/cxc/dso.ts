import { callOdooRPC } from "@/lib/odoo";
import { facturasDelPeriodo } from "@/lib/cxc/efectividad";
import type { SeriesCxC } from "@/lib/cxc/seriesSemanales";

/**
 * KPI "DSO" (días promedio de cobro) del mes, en su forma estándar:
 *
 *   DSO = CxC a crédito al cierre del mes ÷ ventas a crédito del mes × días del mes
 *
 * Los tres términos son del MISMO período (mezclar ventas de un año con días
 * de un mes da un número sin sentido). Mes en curso: corte y días a hoy.
 *
 *   CxC al cierre   = la CxC final del CEI (seriesSemanales.ts → carteraCEI):
 *                     saldo contable de la cuenta por cobrar, sin contado,
 *                     cartera vieja, Supricom ni SUPER TECHNO.
 *   ventas crédito  = las del CEI (efectividad.ts → facturasDelPeriodo):
 *                     facturas − notas de crédito a crédito del mes, con IVA.
 *
 * Así la tarjeta usa exactamente las cifras de Efectividad. Medido en
 * sep-2026: Valencia 37 días, igual que el tiempo real que tardaron en pagar
 * (Tiempo de Cobro, 37,6).
 *
 * ── Historia ──
 * Antes era un DSO por cliente (saldo ÷ ventas desde su 1ª factura × días,
 * luego 12 meses con Smartbit) promediado ponderando por saldo. Ese promedio
 * le da más peso a quien más debe respecto de lo que compra y salía 58-88 días
 * contra ~37 reales, además de no seguir el mes elegido.
 *
 * El detalle por cliente usa la misma fórmula con su saldo a crédito al cierre
 * (por factura) y sus ventas a crédito del mes. Un cliente sin ventas en el
 * mes queda sin DSO (no hay contra qué dividir). La suma de saldos por cliente
 * no es exactamente la CxC de la tarjeta: la del libro además resta los pagos
 * sin aplicar, que no son de ninguna factura.
 *
 * Antes de abril 2026 Odoo no tiene las ventas (están en Smartbit), así que
 * esos meses salen sin DSO, igual que el CEI.
 */

export interface DsoCliente {
  partnerId: number;
  partnerName: string;
  /** Saldo a crédito del cliente al cierre (facturas − NC abiertas). */
  saldo: number;
  /** Ventas a crédito del cliente en el mes. */
  ventasNetas: number;
  dias: number;
  /** `null` si no tuvo ventas a crédito en el mes. */
  dso: number | null;
}

export interface DsoResultado {
  /** DSO del mes. `null` si no hubo ventas a crédito. */
  value: number | null;
  /** CxC a crédito al cierre (la CxC final del CEI). */
  carteraAbierta: number;
  /** Ventas a crédito del mes. */
  ventasNetas: number;
  /** Días del período (del 1 al cierre, o a hoy en el mes en curso). */
  dias: number;
  /** Nº de clientes con saldo a crédito al cierre. */
  clientesIncluidos: number;
  /** Clientes con saldo a crédito al cierre, ordenados por saldo. */
  clientes: DsoCliente[];
}

const DIA_MS = 24 * 60 * 60 * 1000;
const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v || undefined);
const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export async function calcularDSO(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  hoy: Date,
  series: Pick<SeriesCxC, "carteraCEI" | "saldosEn">,
): Promise<DsoResultado> {
  const finDia = new Date(monthEnd);
  finDia.setHours(23, 59, 59, 999);
  const corte = finDia < hoy ? finDia : hoy;
  const inicio = new Date(monthStart);
  inicio.setHours(0, 0, 0, 0);
  const dias = Math.max(1, Math.floor((corte.getTime() - inicio.getTime()) / DIA_MS) + 1);

  const [cxc, ventasMes] = await Promise.all([
    series.carteraCEI(corte),
    facturasDelPeriodo(companyIds, fechaLocal(inicio), fechaLocal(corte)),
  ]);
  const ventas = ventasMes.reduce((s, f) => s + (Number(f.amount_total_signed) || 0), 0);

  // ── Detalle por cliente (empresa) ──
  const { saldos, credito } = series.saldosEn(corte);
  const ids = [...saldos.keys()].filter((id) => credito.has(id));
  const moves: any[] = [];
  for (let i = 0; i < ids.length; i += 5000) {
    moves.push(...((await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 5000)], { fields: ["id", "commercial_partner_id"] })) || []));
  }
  const porCliente = new Map<number, { name: string; saldo: number; ventas: number }>();
  const cliente = (v: any) => {
    const pid = idDe(v) || 0;
    if (!porCliente.has(pid)) porCliente.set(pid, { name: v?.[1] || "Sin cliente", saldo: 0, ventas: 0 });
    return porCliente.get(pid)!;
  };
  for (const m of moves) cliente(m.commercial_partner_id).saldo += saldos.get(m.id) || 0;
  for (const f of ventasMes) cliente(f.commercial_partner_id).ventas += Number(f.amount_total_signed) || 0;

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const clientes: DsoCliente[] = [...porCliente]
    .filter(([pid, c]) => pid && c.saldo >= 0.005)
    .map(([pid, c]) => ({
      partnerId: pid,
      partnerName: c.name,
      saldo: r2(c.saldo),
      ventasNetas: r2(c.ventas),
      dias,
      dso: c.ventas > 0 ? Math.round((c.saldo / c.ventas) * dias) : null,
    }))
    .sort((a, b) => b.saldo - a.saldo);

  return {
    value: ventas > 0 ? Math.round((cxc.total / ventas) * dias) : null,
    carteraAbierta: r2(cxc.total),
    ventasNetas: r2(ventas),
    dias,
    clientesIncluidos: clientes.length,
    clientes,
  };
}
