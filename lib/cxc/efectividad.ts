import { obtenerCobros } from "@/lib/cxc/cobros";
import { callOdooRPC } from "@/lib/odoo";
import { fechaDePago } from "@/lib/cxc/fechaConfirmacion";

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
// Efectividad de cobranza = Índice de Efectividad de Cobranza (CEI) (2026-09-24)
// ═══════════════════════════════════════════════════════════════════════════
//
//              cobrado del período
//   CEI = ─────────────────────────────────────────────────────────── × 100
//         CxC al inicio + facturado del período − CxC final NO vencida
//
// El denominador es lo que se PODÍA cobrar en el período: toda la cartera que
// había al empezar más lo facturado, menos lo que al cerrar todavía no vencía
// (eso no era exigible). 100% = se cobró todo lo exigible. Reemplaza a
// "cobrado ÷ facturado", que dependía de cuánto se facturó en el mes (un mes de
// mucha facturación bajaba el % aunque la cobranza fuera igual de buena).
//
//  - Cobrado: PAGOS REGISTRADOS en Odoo (`account.payment` de cliente,
//    confirmados), fechados por la confirmación (`payment_registration_date`,
//    ver lib/cxc/fechaConfirmacion.ts), en diarios de banco/caja sin
//    "retenido", sin los pagos del 25% de IVA ("25%" en la descripción).
//    Es el "Recibido" de la pestaña Cobros de Pago de Clientes:
//    incluye anticipos aún no aplicados a facturas, así que puede pasar de 100%.
//  - Facturado: facturas − notas de crédito con `invoice_date` en el período
//    (`amount_total_signed`, con IVA).
//  - CxC al inicio / al final: cartera reconstruida en el corte
//    (lib/cxc/seriesSemanales.ts → carteraEn), mismo método que Cartera Vencida.
//  - Mes en curso: el corte final es hoy.
//  - El cliente interno Supricom queda fuera de todo.
//
// `calcularEfectividad` (arriba: cobrado ÷ lo que VENCÍA en el mes) sigue
// existiendo para "Cobros esperados vs realizados" de Salud financiera.

export interface CEIResultado {
  /** CEI en %. `null` si no había nada exigible. */
  value: number | null;
  /** Pagos registrados en el período. */
  cobrado: number;
  facturado: number;
  carteraInicial: number;
  carteraFinal: number;
  /** Parte de la cartera final que todavía no vencía en el corte. */
  carteraFinalNoVencida: number;
  /** Denominador: carteraInicial + facturado − carteraFinalNoVencida. */
  exigible: number;
  /** Cantidad de pagos registrados. */
  pagos: number;
  /** Cantidad de facturas (sin notas de crédito) del período. */
  facturas: number;
  /** true mientras el mes no cierra: el corte final es hoy. */
  parcial: boolean;
  semana: (string | null)[];
}

type CarteraEn = (corte: Date) => { total: number; vencido: number };

const esSupricom = (nombre: string) => nombre.toLowerCase().includes("supricom");

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
      { fields: ["id", "name", "partner_id", "invoice_user_id", "move_type", "invoice_date", "amount_total_signed"], order: "id asc", limit: 5000, offset },
    )) || [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out.filter((f) => f.partner_id && !esSupricom(f.partner_id[1] || ""));
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
    .filter((p) => !esSupricom(p.partner_id?.[1] || ""))
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
export function cei(cobrado: number, carteraInicial: number, facturado: number, finalNoVencida: number) {
  const exigible = carteraInicial + facturado - finalNoVencida;
  return { exigible, value: exigible > 0 ? Math.round((cobrado / exigible) * 10000) / 100 : null };
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
  carteraEn: CarteraEn,
): Promise<CEIResultado> {
  return (await detalleCEI(companyIds, monthStart, monthEnd, semanas, hoy, carteraEn)).resumen;
}

export async function detalleCEI(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  semanas: Semana[],
  hoy: Date,
  carteraEn: CarteraEn,
): Promise<DetalleCEI> {
  const desde = iso(monthStart);
  const hasta = iso(monthEnd);
  const [facturas, pagos] = await Promise.all([
    facturasDelPeriodo(companyIds, desde, hasta),
    pagosRegistrados(companyIds, desde, hasta),
  ]);

  const sumaFacturado = (a: string, b: string) => facturas
    .filter((f) => f.invoice_date >= a && f.invoice_date <= b)
    .reduce((s, f) => s + (Number(f.amount_total_signed) || 0), 0);
  const sumaPagos = (a: string, b: string) => pagos
    .filter((p) => p.fecha >= a && p.fecha <= b)
    .reduce((s, p) => s + p.monto, 0);

  const cobrado = sumaPagos(desde, hasta);
  const facturado = sumaFacturado(desde, hasta);
  const inicial = carteraEn(antesDe(monthStart));
  const final = carteraEn(hoy < monthEnd ? hoy : monthEnd);
  const finalNoVencida = final.total - final.vencido;
  const { exigible, value } = cei(cobrado, inicial.total, facturado, finalNoVencida);

  // Fila semanal: el mismo CEI con la semana como período.
  const semana: (string | null)[] = semanas.map((s) => {
    if (s.inicio > hoy) return null;
    const a = iso(s.inicio), b = iso(s.fin);
    const fin = carteraEn(hoy < s.fin ? hoy : s.fin);
    const r = cei(sumaPagos(a, b), carteraEn(antesDe(s.inicio)).total, sumaFacturado(a, b), fin.total - fin.vencido);
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
      cobrado: r2(cobrado),
      facturado: r2(facturado),
      carteraInicial: r2(inicial.total),
      carteraFinal: r2(final.total),
      carteraFinalNoVencida: r2(finalNoVencida),
      exigible: r2(exigible),
      pagos: pagos.length,
      facturas: facturas.filter((f) => f.move_type === "out_invoice").length,
      parcial: hoy <= monthEnd,
      semana,
    },
    clientes: [...porCliente.values()]
      .map((c) => ({ ...c, facturado: r2(c.facturado), cobrado: r2(c.cobrado) }))
      .sort((a, b) => b.facturado + b.cobrado - (a.facturado + a.cobrado)),
  };
}
