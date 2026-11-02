import { obtenerCobros, esRelacionada, RELACIONADA } from "@/lib/cxc/cobros";
import { callOdooRPC } from "@/lib/odoo";
import { dominioFechaEfectiva, fechasEfectivas } from "@/lib/cxc/fechaConfirmacion";
import { VENCIMIENTO_DESDE } from "@/lib/cxc/carteraVieja";
import { idsIncobrablesManuales } from "@/lib/cxc/incobrablesManuales";
import { idsACredito } from "@/lib/cxc/credito";
import { esICExcluido, terminosSinIC } from "@/lib/intercompania";

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

/** Facturas y NC a crédito del período (sin internos ni relacionadas). También las usa el DSO. */
export async function facturasDelPeriodo(companyIds: number[], desde: string, hasta: string) {
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
      { fields: ["id", "name", "partner_id", "commercial_partner_id", "company_id", "invoice_user_id", "move_type", "invoice_date", "amount_total_signed", "invoice_payment_term_id", "reversed_entry_id"], order: "id asc", limit: 5000, offset },
    )) || [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  // Solo ventas a crédito (lib/cxc/credito.ts), sin internos ni relacionadas.
  const propias = out.filter((f) =>
    f.partner_id && !esSupricom(f.partner_id[1] || "") && !esRelacionada(f.commercial_partner_id?.[1] || "") &&
    !esICExcluido(f.commercial_partner_id?.[0]));
  const aCredito = await idsACredito(propias);
  return propias.filter((f) => aCredito.has(f.id));
}

// ═══════════════════════════════════════════════════════════════════════════
// Efectividad de cobranza (tarjeta de CxC y Stoplight), desde nov-2026
// ═══════════════════════════════════════════════════════════════════════════
//
//   Efectividad = cobrado en el mes ÷ lo que había que cobrar en el mes
//
// Lo que había que cobrar, factura por factura (solo crédito):
//   · lo que ya venía vencido: su saldo al empezar el mes;
//   · lo que se venció en el mes, se haya facturado antes o dentro del mes:
//     su saldo al empezar el mes (o el total si se facturó en el mes);
//   · menos las notas de crédito que se le aplicaron en el mes.
// Cobrado: lo que se le aplicó a ESAS facturas dentro del mes, en dinero
// (banco/caja) o retenciones. Con tope en lo que debía cada factura, así un
// pago adelantado o de otra factura no infla el número y nunca pasa de 100%.
//
//  - "Vencida" = desde el día siguiente al vencimiento, como en Cartera
//    Vencida (seriesSemanales.ts → vencidaEn). Una factura que vence el último
//    día del mes cuenta en el mes siguiente, como "ya venía vencido".
//  - Mes en curso: solo lo vencido hasta ayer y lo cobrado hasta hoy.
//  - Fechas de cobro: confirmación del pago (lib/cxc/fechaConfirmacion.ts).
//  - Fuera: contado, Supricom, SUPER TECHNO (su saldo se informa en
//    `relacionadas`), incobrables (vencidas antes de 2025 o marcadas a mano) y,
//    para Inteligencia de Negocio, la intercompañía.
//  - Fila semanal: el acumulado del mes al cierre de cada semana.
//  - Un mes cerrado se lee de su foto (lib/cxc/cierreEfectividad.ts).
//
// Reemplaza al CEI estándar ((CxC inicial + ventas − CxC final) ÷ (… − CxC
// final no vencida)), que contaba como recuperado todo lo que salía de la
// cartera, incluidos anticipos y pagos de facturas que todavía no vencían.
// Octubre 2026 en Valencia: CEI 78,27 %, esta 78,12 %.
//
// `calcularEfectividad` (arriba: cobrado ÷ lo que VENCÍA en el mes) sigue
// existiendo para "Cobros esperados vs realizados" de Salud financiera.

export interface EfectividadMes {
  /** % del mes. `null` si no había nada que cobrar. */
  value: number | null;
  /** Lo que había que cobrar = venciaAntes + vencioEnElMes − notasCredito. */
  porCobrar: number;
  /** Saldo al empezar el mes de lo que ya estaba vencido. */
  venciaAntes: number;
  /** Saldo de lo que se venció dentro del mes (hasta ayer, si el mes sigue). */
  vencioEnElMes: number;
  /** Notas de crédito aplicadas en el mes a esas facturas: bajan lo que había que cobrar. */
  notasCredito: number;
  /** Cobrado en el mes de esas facturas (dinero + retenciones). */
  cobrado: number;
  /** porCobrar − cobrado. */
  falta: number;
  facturas: number;
  /** Último día de vencimiento que cuenta (YYYY-MM-DD). */
  vencidasHasta: string;
  /** true mientras el mes no cierra. */
  parcial: boolean;
  /** Saldo de hoy de la empresa relacionada (SUPER TECHNO): se muestra, no entra. */
  relacionadas: number;
  /** % por sede (company_id); solo con más de una sede. */
  porSede: Record<number, number | null>;
  semana: (string | null)[];
}

export interface ClienteEfectividad {
  partnerId: number;
  nombre: string;
  vendedor: string;
  porCobrar: number;
  cobrado: number;
  falta: number;
}

export interface DetalleEfectividad {
  resumen: EfectividadMes;
  /** Por cliente, de mayor a menor lo que falta. */
  clientes: ClienteEfectividad[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** YYYY-MM-DD en hora local (los cortes vienen a las 23:59; toISOString los pasaría al día siguiente). */
const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const idDe = (v: any): number => (Array.isArray(v) ? v[0] : v) || 0;

async function paginar(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = (await callOdooRPC<any[]>(model, "search_read", [domain], { fields, order: "id asc", limit: 5000, offset })) || [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out;
}

interface FacturaMes {
  companyId: number;
  partnerId: number;
  nombre: string;
  vendedor: string;
  vence: string;
  /** Saldo al empezar el mes (o total, si se facturó en el mes). */
  saldoInicio: number;
  /** Lo aplicado desde el 1.º, con su fecha efectiva. */
  movs: { fecha: string; monto: number; nc: boolean }[];
}

export async function detalleEfectividad(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  semanas: Semana[],
  hoy: Date,
): Promise<DetalleEfectividad> {
  const desde = fechaLocal(monthStart);
  const parcial = hoy <= new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate(), 23, 59, 59, 999);
  // Corte: último día del mes o hoy. Vencida = vence ANTES del corte.
  const corte = fechaLocal(parcial ? hoy : monthEnd);

  // Facturas a crédito vencidas antes del corte que tenían saldo al empezar el
  // mes: las abiertas hoy y las que recibieron algo desde el 1.º.
  const factura: any[] = [
    ["move_type", "=", "out_invoice"],
    ["state", "=", "posted"],
    ["company_id", "in", companyIds],
    ["partner_id.name", "not ilike", "supricom"],
    ["commercial_partner_id.name", "not ilike", RELACIONADA],
    ["invoice_date_due", ">=", VENCIMIENTO_DESDE],
    ["invoice_date_due", "<", corte],
    ...terminosSinIC(),
  ];
  const enDebito = factura.map((t) => [`debit_move_id.move_id.${t[0]}`, t[1], t[2]]);
  const [abiertas, conciliaciones, manuales, relacionadas] = await Promise.all([
    paginar("account.move", [...factura, ["amount_residual", "!=", 0]], ["id"]),
    paginar("account.partial.reconcile", [...enDebito, ...dominioFechaEfectiva(">=", desde)],
      ["id", "amount", "max_date", "debit_move_id", "credit_move_id"]),
    idsIncobrablesManuales(companyIds),
    saldoRelacionada(companyIds),
  ]);

  // Línea por cobrar → factura, y tipo del lado acreedor (NC o cobro).
  const lineas = new Map<number, any>();
  const lineIds = [...new Set(conciliaciones.flatMap((c) => [idDe(c.debit_move_id), idDe(c.credit_move_id)]))];
  for (let i = 0; i < lineIds.length; i += 5000) {
    for (const l of await paginar("account.move.line", [["id", "in", lineIds.slice(i, i + 5000)]], ["id", "move_id", "move_type"])) {
      lineas.set(l.id, l);
    }
  }
  const fechas = await fechasEfectivas(conciliaciones);

  const ids = new Set<number>(abiertas.map((f) => f.id));
  for (const c of conciliaciones) ids.add(idDe(lineas.get(idDe(c.debit_move_id))?.move_id));
  ids.delete(0);
  const moves = ids.size
    ? await paginar("account.move", [["id", "in", [...ids]]], [
      "id", "move_type", "company_id", "commercial_partner_id", "invoice_user_id", "invoice_date_due",
      "amount_residual_signed", "invoice_payment_term_id", "reversed_entry_id",
    ])
    : [];
  const aCredito = await idsACredito(moves);

  const facturas = new Map<number, FacturaMes>();
  for (const m of moves) {
    if (!aCredito.has(m.id) || manuales.has(m.id) || esICExcluido(idDe(m.commercial_partner_id))) continue;
    facturas.set(m.id, {
      companyId: idDe(m.company_id),
      partnerId: idDe(m.commercial_partner_id),
      nombre: m.commercial_partner_id?.[1] || "",
      vendedor: m.invoice_user_id?.[1] || "",
      vence: String(m.invoice_date_due).slice(0, 10),
      saldoInicio: Math.max(0, Number(m.amount_residual_signed) || 0),
      movs: [],
    });
  }
  for (const c of conciliaciones) {
    const f = facturas.get(idDe(lineas.get(idDe(c.debit_move_id))?.move_id));
    if (!f) continue;
    const monto = Number(c.amount) || 0;
    f.saldoInicio += monto; // saldo de hoy + lo aplicado desde el 1.º = saldo al empezar el mes
    const fecha = fechas.get(c.id) || String(c.max_date || desde).slice(0, 10);
    f.movs.push({ fecha, monto, nc: lineas.get(idDe(c.credit_move_id))?.move_type === "out_refund" });
  }

  /** Lo vencido antes de `hasta` y lo que se le aplicó hasta `hasta` (inclusive). */
  const medir = (hasta: string, filtro: (f: FacturaMes) => boolean = () => true) => {
    const r = { venciaAntes: 0, vencioEnElMes: 0, notasCredito: 0, cobrado: 0, facturas: 0 };
    for (const f of facturas.values()) {
      if (f.vence >= hasta || f.saldoInicio < 0.005 || !filtro(f)) continue;
      let nc = 0;
      let cobro = 0;
      for (const m of f.movs) {
        if (m.fecha > hasta) continue;
        if (m.nc) nc += m.monto;
        else cobro += m.monto;
      }
      const debe = Math.max(0, f.saldoInicio - nc);
      if (f.vence < desde) r.venciaAntes += f.saldoInicio;
      else r.vencioEnElMes += f.saldoInicio;
      r.notasCredito += f.saldoInicio - debe;
      r.cobrado += Math.min(cobro, debe);
      r.facturas++;
    }
    const porCobrar = r.venciaAntes + r.vencioEnElMes - r.notasCredito;
    return { ...r, porCobrar, value: porCobrar > 0.005 ? Math.round((r.cobrado / porCobrar) * 10000) / 100 : null };
  };

  const mes = medir(corte);
  const porSede: Record<number, number | null> = {};
  if (companyIds.length > 1) for (const cid of companyIds) porSede[cid] = medir(corte, (f) => f.companyId === cid).value;

  // Fila semanal: el acumulado del mes al cierre de cada semana.
  const semana = semanas.map((s) => {
    if (s.inicio > hoy) return null;
    const fin = fechaLocal(s.fin);
    const v = medir(fin < corte ? fin : corte).value;
    return v === null ? null : `${Math.round(v)}%`;
  });

  // Por cliente, mismo cálculo.
  const porCliente = new Map<number, ClienteEfectividad>();
  for (const f of facturas.values()) {
    if (porCliente.has(f.partnerId)) continue;
    const c = medir(corte, (x) => x.partnerId === f.partnerId);
    if (c.facturas === 0) continue;
    porCliente.set(f.partnerId, {
      partnerId: f.partnerId, nombre: f.nombre, vendedor: f.vendedor,
      porCobrar: r2(c.porCobrar), cobrado: r2(c.cobrado), falta: r2(c.porCobrar - c.cobrado),
    });
  }

  const ultimoDia = new Date(`${corte}T12:00:00`);
  ultimoDia.setDate(ultimoDia.getDate() - 1);
  return {
    resumen: {
      value: mes.value,
      porCobrar: r2(mes.porCobrar),
      venciaAntes: r2(mes.venciaAntes),
      vencioEnElMes: r2(mes.vencioEnElMes),
      notasCredito: r2(mes.notasCredito),
      cobrado: r2(mes.cobrado),
      falta: r2(mes.porCobrar - mes.cobrado),
      facturas: mes.facturas,
      vencidasHasta: fechaLocal(ultimoDia),
      parcial,
      relacionadas: r2(relacionadas),
      porSede,
      semana,
    },
    clientes: [...porCliente.values()].sort((a, b) => b.falta - a.falta),
  };
}
