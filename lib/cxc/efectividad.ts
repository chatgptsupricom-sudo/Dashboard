import { obtenerCobros, esRelacionada, RELACIONADA } from "@/lib/cxc/cobros";
import type { CarteraCEI } from "@/lib/cxc/seriesSemanales";
import { callOdooRPC } from "@/lib/odoo";
import { fechaDePago } from "@/lib/cxc/fechaConfirmacion";
import { idsACredito } from "@/lib/cxc/credito";

/**
 * KPI "Efectividad Cobranza" — criterio ESTRICTO (issue #188).
 *
 *   Efectividad = cobrado HASTA EL CIERRE del mes
 *               ÷ exigible de las facturas que vencen en el mes
 *
 * ── Mes en curso: solo lo que ya venció ──
 *
 * Durante el mes en curso el denominador se limita a las facturas que YA
 * vencieron. Si no, el KPI divide entre todo el exigible del mes, incluidas
 * facturas que todavía no se podían cobrar, y sale siempre bajo: medido en
 * Valencia al 17-sep, 38,3% contra todo el mes y 64,0% contra lo ya vencido,
 * mientras las celdas semanales (que solo muestran semanas ya iniciadas) daban
 * 68/46/24%. Al cerrar el mes el denominador ya es el mes completo, así que los
 * meses cerrados no cambian y siguen siendo comparables entre sí.
 *
 * "Cobrado" sale de lib/cxc/cobros.ts, la misma fuente que "Cobrado" de
 * Contado/Crédito: dinero que entró a banco/caja, fechado por la CONFIRMACIÓN
 * del pago. Así cuadra con esa pantalla:
 *
 *   cobradoEnElMes = tramo "vencen en el período" de Contado/Crédito (sin internos)
 *   cobradoAntes   = lo que esas facturas ya habían cobrado como "adelantado"
 *                    en meses anteriores
 *   cobradoAlCierre = cobradoEnElMes + cobradoAntes
 *
 * Notas de crédito, retenciones y descuentos NO son cobro: bajan el saldo pero
 * no entró dinero. Las notas de crédito del mes ya restan del exigible; el
 * resto queda visible en `ajustes` (exigible − cobrado a hoy − pendiente).
 *
 * ── Por qué estricto ──
 *
 * Derivar lo cobrado de `amount_total − amount_residual` usa el saldo de HOY:
 * un pago que entró dos meses tarde contaba en el mes en que la factura vencía
 * y los meses cerrados salían casi perfectos (mayo 99,3% cuando dentro del mes
 * se cobró 81,4%). `value` (estricta) va al semáforo y un mes cerrado ya no
 * cambia; `valueAcumulado` ("cobrado a hoy") queda como dato secundario.
 */

export interface EfectividadResultado {
  /** % estricto — el del semáforo. `null` si no hay exigible. */
  value: number | null;
  /** Cobrado hasta el último día del mes (= cobradoEnElMes + cobradoAntes). */
  cobradoAlCierre: number;
  /** Cobrado dentro del mes. */
  cobradoEnElMes: number;
  /** Cobrado antes de empezar el mes (pagos adelantados). */
  cobradoAntes: number;
  /** Exigible que ya venció (en el mes en curso) o del mes completo si ya cerró. */
  exigibleMes: number;
  /** Exigible del mes completo, incluso lo que aún no vence. */
  exigibleMesCompleto: number;
  /** true mientras el mes no cierre: `exigibleMes` es solo lo ya vencido. */
  parcial: boolean;
  /** % "cobrado a hoy". Dato secundario. */
  valueAcumulado: number | null;
  /** Cobrado a hoy, incluidos pagos posteriores al cierre. */
  cobradoAHoy: number;
  /** Saldo que aún queda de esas facturas. */
  pendiente: number;
  /** Retenciones, descuentos y otros ajustes: bajaron el saldo sin ser cobro. */
  ajustes: number;
  /** true cuando el mes ya terminó: recién ahí las dos cifras se separan. */
  mesCerrado: boolean;
  /** Fila semanal con el mismo criterio estricto. */
  semana: (string | null)[];
}

export interface FacturaExigible {
  id: number;
  amountTotal: number;
  amountResidual: number;
  dueDate: Date | null;
}

export interface Semana {
  inicio: Date;
  fin: Date;
}

const iso = (d: Date) => d.toISOString().split("T")[0];

export async function calcularEfectividad(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  facturas: FacturaExigible[],
  semanas: Semana[],
  hoy: Date,
): Promise<EfectividadResultado> {
  const desde = iso(monthStart);
  const hasta = iso(monthEnd);
  const hoyStr = iso(hoy);

  const mesCerrado = hoy > monthEnd;
  // Mes en curso: el denominador solo cuenta lo que ya venció (ver cabecera).
  const vigentes = mesCerrado ? facturas : facturas.filter((f) => !f.dueDate || f.dueDate <= hoy);

  const exigibleMes = vigentes.reduce((s, f) => s + f.amountTotal, 0);
  const exigibleMesCompleto = facturas.reduce((s, f) => s + f.amountTotal, 0);
  const pendiente = vigentes.reduce((s, f) => s + f.amountResidual, 0);

  // Cobros de EXACTAMENTE las facturas del exigible (mismo universo que el
  // denominador), hasta hoy o hasta el cierre si el mes aún no terminó.
  const idsFacturas = vigentes.map((f) => f.id);
  const cobros = idsFacturas.length
    ? await obtenerCobros(companyIds, {
        hasta: hoyStr > hasta ? hoyStr : hasta,
        dominioFactura: [["id", "in", idsFacturas]],
      })
    : [];

  let cobradoAntes = 0;
  let cobradoEnElMes = 0;
  let cobradoAHoy = 0;
  for (const c of cobros) {
    cobradoAHoy += c.monto;
    if (c.fecha < desde) cobradoAntes += c.monto;
    else if (c.fecha <= hasta) cobradoEnElMes += c.monto;
  }
  const cobradoAlCierre = cobradoAntes + cobradoEnElMes;

  // ── Fila semanal, mismo criterio estricto ──
  const semana: (string | null)[] = semanas.map(() => null);
  if (semanas.length > 0 && vigentes.length > 0) {
    const semanaDeFactura = new Map<number, number>();
    const acc = semanas.map(() => ({ exigible: 0, cobrado: 0 }));
    vigentes.forEach((f) => {
      if (!f.dueDate) return;
      const w = semanas.findIndex((s) => f.dueDate! >= s.inicio && f.dueDate! <= s.fin);
      if (w < 0) return;
      semanaDeFactura.set(f.id, w);
      acc[w].exigible += f.amountTotal;
    });
    for (const c of cobros) {
      const w = semanaDeFactura.get(c.facturaId);
      if (w === undefined) continue;
      // Estricto también por semana: solo cuenta si se cobró antes de que esa
      // semana cerrara.
      if (c.fecha > iso(semanas[w].fin)) continue;
      acc[w].cobrado += c.monto;
    }
    acc.forEach((s, i) => {
      if (semanas[i].inicio > hoy) return; // semana futura: nada que medir
      if (s.exigible <= 0) return;
      semana[i] = `${Math.round((s.cobrado / s.exigible) * 100)}%`;
    });
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const pct = (num: number) =>
    exigibleMes > 0 ? Math.round((num / exigibleMes) * 10000) / 100 : null;

  return {
    value: pct(cobradoAlCierre),
    cobradoAlCierre: r2(cobradoAlCierre),
    cobradoEnElMes: r2(cobradoEnElMes),
    cobradoAntes: r2(cobradoAntes),
    exigibleMes: r2(exigibleMes),
    exigibleMesCompleto: r2(exigibleMesCompleto),
    parcial: !mesCerrado,
    valueAcumulado: pct(cobradoAHoy),
    cobradoAHoy: r2(cobradoAHoy),
    pendiente: r2(pendiente),
    ajustes: r2(exigibleMes - cobradoAHoy - pendiente),
    mesCerrado,
    semana,
  };
}


// ═══════════════════════════════════════════════════════════════════════════
// Efectividad de cobranza = Índice de Efectividad de Cobranza (CEI) estándar
// ═══════════════════════════════════════════════════════════════════════════
//
//         CxC inicial + ventas a crédito − CxC final
//   CEI = ──────────────────────────────────────────────────── × 100
//         CxC inicial + ventas a crédito − CxC final NO vencida
//
// Numerador: lo que salió de la cartera en el período (recuperado). Incluye
// pagos (aplicados o no a una factura), retenciones y descuentos, que también
// bajan el saldo. Un anticipo grande puede llevar el CEI por encima de 100%.
// Denominador: lo que se PODÍA cobrar: la cartera al empezar
// más lo vendido a crédito, menos lo que al cerrar todavía no vencía.
//
// Hasta 2026-09-28 el numerador eran los pagos registrados en banco/caja; se
// pasó al CEI estándar a pedido de CxC. Los pagos siguen como dato
// (`pagosRegistrados`, lib/cxc/cobros.ts), fuera de la fórmula.
//
//  - Solo CRÉDITO en los tres términos (lib/cxc/credito.ts). Ventas a
//    crédito = facturas − notas de crédito a crédito con `invoice_date` en el
//    período (`amount_total_signed`, con IVA); a la CxC inicial y final se le
//    resta la parte de contado (los pagos sin aplicar y los asientos manuales
//    de la cuenta por cobrar sí quedan). Si la cartera incluyera contado y las
//    ventas no, una factura de contado sin cobrar al cierre restaría como
//    "cobro negativo".
//  - CxC al inicio / al final: saldo contable de la cuenta por cobrar a la
//    fecha (lib/cxc/seriesSemanales.ts → carteraCEI), sin contado ni cartera
//    vieja (vencida antes de 2025).
//  - Mes en curso: el corte final es hoy.
//  - El cliente interno Supricom queda fuera de todo. La empresa relacionada
//    SUPER TECHNO también, pero su saldo se informa en `relacionadas`.
//
// `calcularEfectividad` (arriba: cobrado ÷ lo que VENCÍA en el mes) sigue
// existiendo para "Cobros esperados vs realizados" de Salud financiera.

export interface CEIResultado {
  /** CEI en %. `null` si no había nada exigible. */
  value: number | null;
  /** Numerador: carteraInicial + ventasCredito − carteraFinal. */
  recuperado: number;
  /** Facturas − notas de crédito a crédito del período. */
  ventasCredito: number;
  carteraInicial: number;
  carteraFinal: number;
  /** Parte de la cartera final que todavía no vencía en el corte. */
  carteraFinalNoVencida: number;
  /** Denominador: carteraInicial + ventasCredito − carteraFinalNoVencida. */
  exigible: number;
  /** Dinero que entró a banco/caja en el período (informativo). */
  pagosRegistrados: number;
  /** Cantidad de pagos registrados. */
  pagos: number;
  /** Cantidad de facturas a crédito (sin notas de crédito) del período. */
  facturas: number;
  /** true mientras el mes no cierra: el corte final es hoy. */
  parcial: boolean;
  /** Saldo de hoy de la empresa relacionada (SUPER TECHNO): se muestra, no entra al CEI. */
  relacionadas: number;
  semana: (string | null)[];
}

const esSupricom = (nombre: string) => nombre.toLowerCase().includes("supricom");

/** Saldo contable de hoy de la empresa relacionada (SUPER TECHNO): se muestra, no entra a los KPIs. */
export async function saldoRelacionada(companyIds: number[]): Promise<number> {
  const g = await callOdooRPC<any[]>(
    "account.move.line",
    "read_group",
    [[
      ["account_id.account_type", "=", "asset_receivable"],
      ["parent_state", "=", "posted"],
      ["company_id", "in", companyIds],
      ["partner_id.commercial_partner_id.name", "ilike", RELACIONADA],
    ], ["balance:sum"], []],
    { lazy: false },
  );
  return Number(g?.[0]?.balance || 0);
}

async function facturasDelPeriodo(companyIds: number[], desde: string, hasta: string) {
  const out: any[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = (await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [[
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["invoice_date", ">=", desde],
        ["invoice_date", "<=", hasta],
      ]],
      { fields: ["id", "name", "partner_id", "commercial_partner_id", "invoice_user_id", "move_type", "invoice_date", "amount_total_signed", "invoice_payment_term_id", "reversed_entry_id"], order: "id asc", limit: 5000, offset },
    )) || [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  // Solo ventas a crédito (lib/cxc/credito.ts), sin internos ni relacionadas.
  const propias = out.filter((f) =>
    f.partner_id && !esSupricom(f.partner_id[1] || "") && !esRelacionada(f.commercial_partner_id?.[1] || ""));
  const aCredito = await idsACredito(propias);
  return propias.filter((f) => aCredito.has(f.id));
}

/** Pagos de cliente confirmados en banco/caja, con su fecha de confirmación. */
async function pagosRegistrados(companyIds: number[], desde: string, hasta: string) {
  const out: any[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = (await callOdooRPC<any[]>(
      "account.payment",
      "search_read",
      [[
        ["payment_type", "=", "inbound"],
        ["partner_type", "=", "customer"],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["journal_id.type", "in", ["bank", "cash"]],
        ["journal_id.name", "not ilike", "retenido"],
        // "25% de iva factura …": el 25% del IVA que el cliente paga aparte en
        // Bs porque retiene el 75%. Somos agentes de retención y no cuenta
        // como cobro. `\%` = % literal (en ilike un % suelto es comodín).
        ["payment_description", "not ilike", "25\\%"],
        // Confirmación en rango; sin confirmación, create_date en rango.
        "|",
        "&", ["payment_registration_date", ">=", desde], ["payment_registration_date", "<=", hasta],
        "&", "&", ["payment_registration_date", "=", false],
        ["create_date", ">=", `${desde} 00:00:00`], ["create_date", "<=", `${hasta} 23:59:59`],
      ]],
      { fields: ["id", "partner_id", "salesperson_id", "payment_registration_date", "create_date", "amount_company_currency_signed"], order: "id asc", limit: 5000, offset },
    )) || [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out
    .filter((p) => !esSupricom(p.partner_id?.[1] || "") && !esRelacionada(p.partner_id?.[1] || ""))
    .map((p) => ({
      fecha: fechaDePago(p) || desde,
      monto: Math.abs(Number(p.amount_company_currency_signed) || 0),
      partnerId: p.partner_id?.[0] as number | undefined,
      partnerName: p.partner_id?.[1] || "",
      vendedor: p.salesperson_id?.[1] || "",
    }));
}

/** Fin del día anterior: la cartera "al inicio" de `d`. */
const antesDe = (d: Date) => new Date(d.getTime() - 1);

/** CEI con sus componentes. Exportado para probarlo sin Odoo. */
export function cei(carteraInicial: number, ventasCredito: number, carteraFinal: number, finalNoVencida: number) {
  const recuperado = carteraInicial + ventasCredito - carteraFinal;
  const exigible = carteraInicial + ventasCredito - finalNoVencida;
  return { recuperado, exigible, value: exigible > 0 ? Math.round((recuperado / exigible) * 10000) / 100 : null };
}

export interface DetalleCEI {
  resumen: CEIResultado;
  /** Por cliente: facturado y pagos registrados del período. */
  clientes: { partnerId: number; nombre: string; vendedor: string; facturado: number; cobrado: number }[];
}

export async function calcularCEI(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  semanas: Semana[],
  hoy: Date,
  carteraCEI: CarteraCEI,
): Promise<CEIResultado> {
  return (await detalleCEI(companyIds, monthStart, monthEnd, semanas, hoy, carteraCEI)).resumen;
}

export async function detalleCEI(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  semanas: Semana[],
  hoy: Date,
  carteraCEI: CarteraCEI,
): Promise<DetalleCEI> {
  const desde = iso(monthStart);
  const hasta = iso(monthEnd);
  const corteFinal = (fin: Date) => (hoy < fin ? hoy : fin);
  const [facturas, pagos, inicial, final, relacionadas, carteraSemanas] = await Promise.all([
    facturasDelPeriodo(companyIds, desde, hasta),
    pagosRegistrados(companyIds, desde, hasta),
    carteraCEI(antesDe(monthStart)),
    carteraCEI(corteFinal(monthEnd)),
    saldoRelacionada(companyIds),
    Promise.all(semanas.map((s) =>
      s.inicio > hoy ? null : Promise.all([carteraCEI(antesDe(s.inicio)), carteraCEI(corteFinal(s.fin))]),
    )),
  ]);

  const sumaFacturado = (a: string, b: string) => facturas
    .filter((f) => f.invoice_date >= a && f.invoice_date <= b)
    .reduce((s, f) => s + (Number(f.amount_total_signed) || 0), 0);
  const sumaPagos = (a: string, b: string) => pagos
    .filter((p) => p.fecha >= a && p.fecha <= b)
    .reduce((s, p) => s + p.monto, 0);

  const montoPagos = sumaPagos(desde, hasta);
  const ventasCredito = sumaFacturado(desde, hasta);
  const finalNoVencida = final.noVencida;
  const { recuperado, exigible, value } = cei(inicial.total, ventasCredito, final.total, finalNoVencida);

  // Fila semanal: el mismo CEI con la semana como período.
  const semana: (string | null)[] = semanas.map((s, i) => {
    const cortes = carteraSemanas[i];
    if (!cortes) return null;
    const [ini, fin] = cortes;
    const r = cei(ini.total, sumaFacturado(iso(s.inicio), iso(s.fin)), fin.total, fin.noVencida);
    return r.value === null ? null : `${Math.round(r.value)}%`;
  });

  // Por cliente.
  const porCliente = new Map<number, { partnerId: number; nombre: string; vendedor: string; facturado: number; cobrado: number }>();
  const cliente = (id: number, nombre: string, vendedor: string) => {
    if (!porCliente.has(id)) porCliente.set(id, { partnerId: id, nombre, vendedor, facturado: 0, cobrado: 0 });
    const c = porCliente.get(id)!;
    if (!c.vendedor && vendedor) c.vendedor = vendedor;
    return c;
  };
  facturas.forEach((f) => { cliente(f.partner_id[0], f.partner_id[1] || "", f.invoice_user_id?.[1] || "").facturado += Number(f.amount_total_signed) || 0; });
  pagos.forEach((p) => { if (p.partnerId) cliente(p.partnerId, p.partnerName, p.vendedor).cobrado += p.monto; });

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    resumen: {
      value,
      recuperado: r2(recuperado),
      ventasCredito: r2(ventasCredito),
      carteraInicial: r2(inicial.total),
      carteraFinal: r2(final.total),
      carteraFinalNoVencida: r2(finalNoVencida),
      exigible: r2(exigible),
      pagosRegistrados: r2(montoPagos),
      pagos: pagos.length,
      facturas: facturas.filter((f) => f.move_type === "out_invoice").length,
      parcial: hoy <= monthEnd,
      relacionadas: r2(relacionadas),
      semana,
    },
    clientes: [...porCliente.values()]
      .map((c) => ({ ...c, facturado: r2(c.facturado), cobrado: r2(c.cobrado) }))
      .sort((a, b) => b.facturado + b.cobrado - (a.facturado + a.cobrado)),
  };
}
