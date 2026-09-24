import { callOdooRPC } from "@/lib/odoo";
import { fechasDePagos } from "@/lib/cxc/fechaConfirmacion";

/**
 * Fuente ÚNICA de "cobrado" para todo Cuentas por Cobrar.
 *
 * Un cobro es una conciliación (`account.partial.reconcile`) entre una factura
 * o nota de crédito de cliente y un asiento que NO es factura, en un diario de
 * banco/caja real, fechada por la CONFIRMACIÓN del pago. Es la lógica de
 * "Cobrado" de Contado/Crédito, que se validó centavo a centavo contra el
 * export real de cobranza, llevada a un solo lugar para que Contado/Crédito,
 * Integración de Pagos, Clasificación de clientes, Efectividad y Recuperación
 * sumen exactamente lo mismo:
 *
 *   Cobrado del período = vencidas al inicio   (numerador de Recuperación)
 *                       + vencen en el período (Efectividad, parte del mes)
 *                       + adelantado           (vencen después)
 *                       + internos             (partner Supricom, fuera de KPIs)
 *
 * Reglas:
 *  - Fecha: `payment_registration_date` del pago (fallback `create_date`). Si
 *    el asiento no es un `account.payment` (p.ej. un movimiento bancario
 *    cargado a mano) se usa la fecha del asiento. Ver lib/cxc/fechaConfirmacion.ts.
 *  - Diario: tipo bank/cash y sin "retenido" en el nombre. Retenciones de IVA,
 *    descuentos, ajustes y notas de crédito aplicadas NO son cobro: bajan el
 *    saldo, pero no entró dinero. Tampoco los pagos del 25% de IVA ("25%" en
 *    la descripción del pago): somos agentes de retención. Solo lo aplica el
 *    dominio con `soloBanco` (el único modo que se usa hoy).
 *  - Nada se filtra por vendedor ni por partner: cada pantalla decide (los KPIs
 *    sacan a los internos, Contado/Crédito tiene su toggle de asistentes).
 *
 * ── Por qué es rápido ──
 *
 * Todo el filtro va en el dominio de Odoo (fecha de confirmación, diario, tipo
 * de asiento), así que solo viajan las conciliaciones del período: agosto 2026
 * son ~3.000 filas en ~2,5 s, contra el historial completo de conciliaciones y
 * asientos que leían antes Contado/Crédito e Integración de Pagos (~100 s).
 *
 * Solo se consulta el lado "factura en débito / pago en crédito". El caso
 * inverso (nota de crédito devuelta con un pago saliente) es plata que sale,
 * no un cobro, y además no aparece en los datos.
 */

export interface Cobro {
  reconcileId: number;
  monto: number;
  /** Fecha de confirmación (YYYY-MM-DD). */
  fecha: string;
  esBanco: boolean;
  journalId?: number;
  journalName: string;
  pagoMoveId?: number;
  pagoMoveName: string;
  pagoEstado: string;
  paymentId?: number;
  facturaId: number;
  facturaNombre: string;
  facturaTipo: string;
  partnerId?: number;
  partnerName: string;
  /** Partner interno (Supricom): cuenta como cobrado pero no en los KPIs. */
  interno: boolean;
  vendedorId?: number;
  vendedorName: string;
  companyId?: number;
  fechaFactura: string | null;
  vencimiento: string | null;
  plazoId?: number;
  /** create_date de la conciliación. */
  conciliadoEl: string | null;
}

export interface OpcionesCobros {
  /** Inclusive. Sin `desde` = todo lo confirmado hasta `hasta`. */
  desde?: Date | string;
  hasta: Date | string;
  /** true (default): solo diarios de banco/caja. false: también retenciones y ajustes. */
  soloBanco?: boolean;
  /**
   * Desglose de `soloBanco` para los checks de Contado/Crédito. Sin valor
   * heredan `soloBanco`. excluirRetenciones: fuera diarios que no son
   * banco/caja o dicen "retenido". excluirIva25: fuera pagos del 25% de IVA.
   */
  excluirRetenciones?: boolean;
  excluirIva25?: boolean;
  /** Dominio extra sobre la FACTURA (`account.move`), p.ej. vencimiento o partner. */
  dominioFactura?: any[];
}

const PAGE = 5000;
const TIPOS_FACTURA = ["out_invoice", "out_refund"];
const TIPOS_DOCUMENTO = ["out_invoice", "out_refund", "in_invoice", "in_refund"];

const iso = (d: Date | string) =>
  typeof d === "string" ? d.slice(0, 10) : d.toISOString().split("T")[0];
const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v || undefined);
const nombreDe = (v: any): string => (Array.isArray(v) ? v[1] || "" : "");
const soloFecha = (v: any): string | null => (v ? String(v).split(/[ T]/)[0] : null);

export const esInterno = (partnerName: string) => partnerName.toLowerCase().includes("supricom");

/** Fecha de confirmación del lado pago (crédito) en notación polaca. */
function dominioFecha(op: ">=" | "<=", fecha: string): any[] {
  const ts = op === ">=" ? `${fecha} 00:00:00` : `${fecha} 23:59:59`;
  const pago = "credit_move_id.payment_id";
  return [
    "|", "|",
    [`${pago}.payment_registration_date`, op, fecha],
    "&", [`${pago}.payment_registration_date`, "=", false], [`${pago}.create_date`, op, ts],
    "&", [pago, "=", false], ["credit_move_id.date", op, fecha],
  ];
}

/** Antepone un prefijo a cada condición de un dominio, respetando los operadores. */
function prefijar(dominio: any[], prefijo: string): any[] {
  return dominio.map((t) => (Array.isArray(t) ? [`${prefijo}${t[0]}`, t[1], t[2]] : t));
}

async function paginar(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields, order: "id asc", limit: PAGE, offset,
    });
    if (!page || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

async function leerPorIds(model: string, ids: number[], fields: string[]): Promise<any[]> {
  const unicos = Array.from(new Set(ids.filter(Boolean)));
  const out: any[] = [];
  for (let i = 0; i < unicos.length; i += PAGE) {
    out.push(...(await paginar(model, [["id", "in", unicos.slice(i, i + PAGE)]], fields)));
  }
  return out;
}

export async function obtenerCobros(companyIds: number[], opts: OpcionesCobros): Promise<Cobro[]> {
  const soloBanco = opts.soloBanco !== false;
  const excluirRetenciones = opts.excluirRetenciones ?? soloBanco;
  const excluirIva25 = opts.excluirIva25 ?? soloBanco;
  const dominio: any[] = [
    ["company_id", "in", companyIds],
    ["debit_move_id.move_id.move_type", "in", TIPOS_FACTURA],
    ["credit_move_id.move_id.move_type", "not in", TIPOS_DOCUMENTO],
    ...dominioFecha("<=", iso(opts.hasta)),
  ];
  if (opts.desde) dominio.push(...dominioFecha(">=", iso(opts.desde)));
  if (excluirRetenciones) {
    dominio.push(
      ["credit_move_id.journal_id.type", "in", ["bank", "cash"]],
      ["credit_move_id.journal_id.name", "not ilike", "retenido"],
    );
  }
  if (excluirIva25) {
    dominio.push(
      // Pagos del 25% de IVA ("25% de iva factura …"): lo que el cliente paga
      // aparte porque retiene el 75%. Somos agentes de retención, no es cobro.
      // `\%` = % literal. Los asientos que no son un pago pasan.
      "|", ["credit_move_id.payment_id", "=", false],
      ["credit_move_id.payment_id.payment_description", "not ilike", "25\\%"],
    );
  }
  if (opts.dominioFactura?.length) dominio.push(...prefijar(opts.dominioFactura, "debit_move_id.move_id."));

  const conciliaciones = await paginar("account.partial.reconcile", dominio, [
    "id", "amount", "debit_move_id", "credit_move_id", "create_date",
  ]);
  if (conciliaciones.length === 0) return [];

  const lineas = await leerPorIds(
    "account.move.line",
    conciliaciones.flatMap((c) => [idDe(c.debit_move_id), idDe(c.credit_move_id)]) as number[],
    ["id", "move_id", "payment_id", "journal_id", "date"],
  );
  const linea = new Map<number, any>(lineas.map((l) => [l.id, l]));

  const facturaIds = new Set<number>();
  const pagoMoveIds = new Set<number>();
  for (const c of conciliaciones) {
    const d = linea.get(idDe(c.debit_move_id)!);
    const cr = linea.get(idDe(c.credit_move_id)!);
    if (idDe(d?.move_id)) facturaIds.add(idDe(d.move_id)!);
    if (idDe(cr?.move_id)) pagoMoveIds.add(idDe(cr.move_id)!);
  }

  const [facturas, pagoMoves, fechaPago, diarios] = await Promise.all([
    leerPorIds("account.move", Array.from(facturaIds), [
      "id", "name", "move_type", "partner_id", "invoice_user_id", "company_id",
      "invoice_date", "invoice_date_due", "invoice_payment_term_id",
    ]),
    leerPorIds("account.move", Array.from(pagoMoveIds), ["id", "name", "state"]),
    fechasDePagos(lineas.map((l) => idDe(l.payment_id)).filter(Boolean) as number[]),
    excluirRetenciones
      ? Promise.resolve([] as any[])
      : leerPorIds("account.journal", lineas.map((l) => idDe(l.journal_id)) as number[], ["id", "type", "name"]),
  ]);
  const factura = new Map<number, any>(facturas.map((f) => [f.id, f]));
  const pagoMove = new Map<number, any>(pagoMoves.map((m) => [m.id, m]));
  const diario = new Map<number, any>(diarios.map((j) => [j.id, j]));

  const cobros: Cobro[] = [];
  for (const c of conciliaciones) {
    const d = linea.get(idDe(c.debit_move_id)!);
    const cr = linea.get(idDe(c.credit_move_id)!);
    const f = factura.get(idDe(d?.move_id)!);
    if (!f || !cr) continue;

    const paymentId = idDe(cr.payment_id);
    const fecha = (paymentId !== undefined ? fechaPago.get(paymentId) : undefined) ?? soloFecha(cr.date);
    if (!fecha) continue;

    const journalId = idDe(cr.journal_id);
    const journalName = nombreDe(cr.journal_id) || "Sin diario";
    let esBanco = true;
    if (!excluirRetenciones) {
      const j = journalId !== undefined ? diario.get(journalId) : undefined;
      esBanco = !!j && (j.type === "bank" || j.type === "cash") && !journalName.toLowerCase().includes("retenido");
    }

    const pm = pagoMove.get(idDe(cr.move_id)!);
    const partnerName = nombreDe(f.partner_id);
    cobros.push({
      reconcileId: c.id,
      monto: Number(c.amount || 0),
      fecha,
      esBanco,
      journalId,
      journalName,
      pagoMoveId: idDe(cr.move_id),
      pagoMoveName: pm?.name || nombreDe(cr.move_id),
      pagoEstado: pm?.state || "",
      paymentId,
      facturaId: f.id,
      facturaNombre: f.name || "",
      facturaTipo: f.move_type,
      partnerId: idDe(f.partner_id),
      partnerName,
      interno: esInterno(partnerName),
      vendedorId: idDe(f.invoice_user_id),
      vendedorName: nombreDe(f.invoice_user_id) || "Sin vendedor",
      companyId: idDe(f.company_id),
      fechaFactura: soloFecha(f.invoice_date),
      vencimiento: soloFecha(f.invoice_date_due),
      plazoId: idDe(f.invoice_payment_term_id),
      conciliadoEl: c.create_date || null,
    });
  }
  return cobros;
}

export interface TramoCuadre {
  monto: number;
  facturas: number;
}

export interface Cuadre {
  /** Facturas ya vencidas al iniciar el período → numerador de Recuperación. */
  vencidasAlInicio: TramoCuadre;
  /** Facturas que vencen dentro del período → parte del mes de Efectividad. */
  vencenEnPeriodo: TramoCuadre;
  /** Facturas que vencen después (o sin vencimiento). */
  adelantado: TramoCuadre;
  /** Partner interno: dentro del total, fuera de los KPIs. */
  internos: TramoCuadre;
}

/** Reparte cobros en los tramos que, sumados, dan el total. */
export function cuadrarCobros(cobros: Pick<Cobro, "monto" | "vencimiento" | "interno">[], desde: string, hasta: string): Cuadre {
  const t = (): TramoCuadre => ({ monto: 0, facturas: 0 });
  const out: Cuadre = { vencidasAlInicio: t(), vencenEnPeriodo: t(), adelantado: t(), internos: t() };
  for (const c of cobros) {
    const tramo = c.interno
      ? out.internos
      : c.vencimiento && c.vencimiento < desde
        ? out.vencidasAlInicio
        : c.vencimiento && c.vencimiento <= hasta
          ? out.vencenEnPeriodo
          : out.adelantado;
    tramo.monto += c.monto;
    tramo.facturas += 1;
  }
  const r2 = (n: number) => Math.round(n * 100) / 100;
  for (const k of Object.keys(out) as (keyof Cuadre)[]) out[k].monto = r2(out[k].monto);
  return out;
}
