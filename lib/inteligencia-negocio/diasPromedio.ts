import { callOdooRPCEstricto } from "@/lib/odoo";
import { calcularDSO } from "@/lib/cxc/dso";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { obtenerSemanasDelMes } from "@/lib/feriados";
import { terminosSinIC } from "@/lib/intercompania";

/**
 * Días promedio de cobro, de inventario y de pago de un mes (Inteligencia de
 * Negocio). Los tres con la misma forma, del mismo período:
 *
 *   días = saldo al cierre ÷ movimiento del mes × días del mes
 *
 * - Cobro (DSO): exactamente el de la tarjeta de CxC (lib/cxc/dso.ts): CxC a
 *   crédito al cierre ÷ ventas a crédito del mes, con IVA.
 * - Inventario (DIO): valor del inventario al cierre (suma de
 *   stock.valuation.layer hasta esa fecha) ÷ costo de lo que salió a clientes
 *   en el mes (capas de los movimientos Existencias → Cliente, menos las
 *   devoluciones). Se usa el costo de las salidas y no la cuenta de costo de
 *   venta porque esa trae ajustes (Panamá, sep-2026: −3,0 M).
 * - Pago (DPO): saldo de cuentas por pagar al cierre (libro, liability_payable)
 *   ÷ facturas de proveedor del mes menos sus notas de crédito, con IVA (los
 *   dos lados con impuesto, como el DSO).
 *
 * Mes en curso: el cierre es hoy y los días son del 1 a hoy. Montos en la
 * moneda de cada empresa (USD; Caracas documenta en bolívares pero su moneda
 * es USD), con los campos *_signed / balance / value.
 *
 * Con sesión de BI todo va sin intercompañía (la ruta envuelve con
 * conSinIntercompaniaParaBI): el DSO por las librerías de CxC, el resto por
 * terminosSinIC. Sin intercompañía Caracas casi no le compra a terceros (le
 * compra a Valencia), así que su DPO puede quedar sin dato.
 *
 * Ciclo de caja = DSO + DIO − DPO: cuántos días tarda en volver a caja lo
 * que se paga a un proveedor.
 */

export interface Indicador {
  /** null = sin dato (ver `motivo`). */
  dias: number | null;
  /** Saldo al cierre (CxC, inventario o CxP). */
  saldo: number;
  /** Movimiento del mes (ventas, costo de lo vendido o compras). */
  movimiento: number;
  motivo?: string;
}

export interface DiasPromedio {
  mes: string;
  desde: string;
  corte: string;
  diasPeriodo: number;
  cobro: Indicador;
  inventario: Indicador;
  pago: Indicador;
  ciclo: number | null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const fecha = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Fin del día en Caracas (UTC−4) en UTC, para comparar con create_date. */
const finDiaUtc = (dia: string) =>
  new Date(new Date(`${dia}T00:00:00-04:00`).getTime() + 24 * 3_600_000).toISOString().replace("T", " ").slice(0, 19);

async function suma(model: string, domain: any[], campo: string): Promise<number> {
  const g = await callOdooRPCEstricto<any[]>(model, "read_group", [domain, [`${campo}:sum`], []], { lazy: false });
  if (!Array.isArray(g)) throw new Error(`Odoo no respondió ${model}`);
  return Number(g[0]?.[campo]) || 0;
}

function indicador(saldo: number, movimiento: number, dias: number, sinMovimiento: string, saldoNoPositivo: string): Indicador {
  if (movimiento <= 0) return { dias: null, saldo: r2(saldo), movimiento: r2(movimiento), motivo: sinMovimiento };
  if (saldo <= 0) return { dias: null, saldo: r2(saldo), movimiento: r2(movimiento), motivo: saldoNoPositivo };
  return { dias: Math.round((saldo / movimiento) * dias), saldo: r2(saldo), movimiento: r2(movimiento) };
}

export async function diasPromedio(companyIds: number[], mes: string): Promise<DiasPromedio> {
  const [anio, m] = mes.split("-").map(Number);
  const inicio = new Date(anio, m - 1, 1);
  const finMes = new Date(anio, m, 0);
  finMes.setHours(23, 59, 59, 999);
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const corte = finMes < hoy ? finMes : hoy;
  const desde = fecha(inicio);
  const corteDia = fecha(corte);
  const dias = Math.max(1, Math.round((new Date(corteDia).getTime() - new Date(desde).getTime()) / 86_400_000) + 1);

  const empresa = ["company_id", "in", companyIds];
  const salidas: any[] = [
    "|",
    "&", ["stock_move_id.location_id.usage", "=", "internal"], ["stock_move_id.location_dest_id.usage", "=", "customer"],
    "&", ["stock_move_id.location_id.usage", "=", "customer"], ["stock_move_id.location_dest_id.usage", "=", "internal"],
  ];

  const [series, inventario, costoVendido, cxp, compras] = await Promise.all([
    calcularSeriesCxC(companyIds, obtenerSemanasDelMes(anio, m), hoy, corte),
    suma("stock.valuation.layer", [empresa, ["create_date", "<", finDiaUtc(corteDia)]], "value"),
    suma("stock.valuation.layer", [
      empresa,
      ["create_date", ">=", finDiaUtc(fecha(new Date(anio, m - 1, 0)))],
      ["create_date", "<", finDiaUtc(corteDia)],
      ...salidas,
      ...terminosSinIC("stock_move_id.picking_id.partner_id.commercial_partner_id"),
    ], "value"),
    suma("account.move.line", [
      empresa,
      ["parent_state", "=", "posted"],
      ["account_id.account_type", "=", "liability_payable"],
      ["date", "<=", corteDia],
      ...terminosSinIC("partner_id.commercial_partner_id"),
    ], "balance"),
    suma("account.move", [
      empresa,
      ["state", "=", "posted"],
      ["move_type", "in", ["in_invoice", "in_refund"]],
      ["invoice_date", ">=", desde],
      ["invoice_date", "<=", corteDia],
      ...terminosSinIC(),
    ], "amount_total_signed"),
  ]);
  const dso = await calcularDSO(companyIds, inicio, finMes, hoy, series);

  const cobro: Indicador = dso.value === null
    ? { dias: null, saldo: dso.carteraAbierta, movimiento: dso.ventasNetas, motivo: "Sin ventas a crédito en el período" }
    : { dias: dso.value, saldo: dso.carteraAbierta, movimiento: dso.ventasNetas };
  // Las capas de salida restan valor (negativas) y las de pagos/facturas
  // de proveedor tienen saldo acreedor (negativo): se les cambia el signo.
  const inv = indicador(inventario, -costoVendido, dias, "Sin salidas de inventario a clientes en el período", "Sin inventario valorizado al cierre");
  const pago = indicador(-cxp, -compras, dias, "Sin compras a proveedores en el período", "Sin saldo por pagar a proveedores al cierre");

  return {
    mes,
    desde,
    corte: corteDia,
    diasPeriodo: dias,
    cobro,
    inventario: inv,
    pago,
    ciclo: cobro.dias !== null && inv.dias !== null && pago.dias !== null ? cobro.dias + inv.dias - pago.dias : null,
  };
}
