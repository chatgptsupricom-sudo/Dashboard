import { obtenerCobros } from "@/lib/cxc/cobros";
import { callOdooRPC } from "@/lib/odoo";

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
// Efectividad de cobranza = COBRADO del mes ÷ FACTURADO del mes (2026-09-22)
// ═══════════════════════════════════════════════════════════════════════════
//
// Definición del usuario: la efectividad de cobranza mide lo cobrado contra lo
// facturado. Todo el dinero que entró en el período (de cualquier factura,
// también de meses anteriores) ÷ lo facturado en el período, ambos CON IVA:
// dice si la cobranza acompaña el ritmo de facturación.
//
//  - Facturado: facturas − notas de crédito publicadas con `invoice_date` en
//    el período (`amount_total_signed`, con IVA).
//  - Cobrado: `obtenerCobros` (lib/cxc/cobros.ts), la fuente única de cobrado:
//    banco/caja, fechado por la confirmación del pago. Es el mismo "Cobrado"
//    de Contado/Crédito.
//  - El cliente interno Supricom queda fuera de los dos lados.
//  - Mes en curso: los dos van al día de hoy, así que el cociente ya es
//    comparable (no hace falta prorratear).
//  - Puede pasar de 100%: un mes en que se cobra deuda vieja por encima de lo
//    facturado.
//
// `calcularEfectividad` (arriba: cobrado ÷ lo que VENCÍA en el mes) sigue
// existiendo para "Cobros esperados vs realizados" de Salud financiera, que
// es otro indicador.

export interface EfectividadFacturadoResultado {
  /** Cobrado ÷ facturado × 100. `null` si no hubo facturación. */
  value: number | null;
  cobrado: number;
  facturado: number;
  /** De lo cobrado: facturas emitidas en el mismo período. */
  cobradoDeFacturasDelMes: number;
  /** De lo cobrado: facturas de períodos anteriores (deuda vieja). */
  cobradoDeAnteriores: number;
  /** Cantidad de facturas (sin notas de crédito) del período. */
  facturas: number;
  /** true mientras el mes no cierra: ambos lados van al día de hoy. */
  parcial: boolean;
  semana: (string | null)[];
}

const esSupricom = (nombre: string) => nombre.toLowerCase().includes("supricom");

async function facturasDelPeriodo(companyIds: number[], desde: string, hasta: string, dominioExtra: any[] = []) {
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
        ...dominioExtra,
      ]],
      { fields: ["id", "name", "partner_id", "invoice_user_id", "move_type", "invoice_date", "amount_total_signed"], order: "id asc", limit: 5000, offset },
    )) || [];
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out.filter((f) => f.partner_id && !esSupricom(f.partner_id[1] || ""));
}

export interface DetalleEfectividadFacturado {
  resumen: EfectividadFacturadoResultado;
  /** Por cliente: facturado y cobrado del período. */
  clientes: { partnerId: number; nombre: string; vendedor: string; facturado: number; cobrado: number }[];
}

export async function calcularEfectividadFacturado(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  semanas: Semana[],
  hoy: Date,
): Promise<EfectividadFacturadoResultado> {
  return (await detalleEfectividadFacturado(companyIds, monthStart, monthEnd, semanas, hoy)).resumen;
}

export async function detalleEfectividadFacturado(
  companyIds: number[],
  monthStart: Date,
  monthEnd: Date,
  semanas: Semana[],
  hoy: Date,
): Promise<DetalleEfectividadFacturado> {
  const desde = iso(monthStart);
  const hasta = iso(monthEnd);
  const [facturas, cobrosTodos] = await Promise.all([
    facturasDelPeriodo(companyIds, desde, hasta),
    obtenerCobros(companyIds, { desde, hasta }),
  ]);
  const cobros = cobrosTodos.filter((c) => !c.interno);

  const facturado = facturas.reduce((s, f) => s + (Number(f.amount_total_signed) || 0), 0);
  const cobrado = cobros.reduce((s, c) => s + c.monto, 0);
  const cobradoDeFacturasDelMes = cobros
    .filter((c) => c.fechaFactura && c.fechaFactura >= desde && c.fechaFactura <= hasta)
    .reduce((s, c) => s + c.monto, 0);

  // Fila semanal: cobrado de la semana ÷ facturado de la semana.
  const semana: (string | null)[] = semanas.map((s) => {
    if (s.inicio > hoy) return null;
    const a = iso(s.inicio), b = iso(s.fin);
    const fac = facturas.filter((f) => f.invoice_date >= a && f.invoice_date <= b)
      .reduce((acc, f) => acc + (Number(f.amount_total_signed) || 0), 0);
    if (fac <= 0) return null;
    const cob = cobros.filter((c) => c.fecha >= a && c.fecha <= b).reduce((acc, c) => acc + c.monto, 0);
    return `${Math.round((cob / fac) * 100)}%`;
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
  cobros.forEach((c) => { if (c.partnerId) cliente(c.partnerId, c.partnerName, c.vendedorName).cobrado += c.monto; });

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    resumen: {
      value: facturado > 0 ? Math.round((cobrado / facturado) * 10000) / 100 : null,
      cobrado: r2(cobrado),
      facturado: r2(facturado),
      cobradoDeFacturasDelMes: r2(cobradoDeFacturasDelMes),
      cobradoDeAnteriores: r2(cobrado - cobradoDeFacturasDelMes),
      facturas: facturas.filter((f) => f.move_type === "out_invoice").length,
      parcial: hoy <= monthEnd,
      semana,
    },
    clientes: [...porCliente.values()]
      .map((c) => ({ ...c, facturado: r2(c.facturado), cobrado: r2(c.cobrado) }))
      .sort((a, b) => b.facturado + b.cobrado - (a.facturado + a.cobrado)),
  };
}
