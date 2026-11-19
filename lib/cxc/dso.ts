import { callOdooRPC } from "@/lib/odoo";
import { facturasDelPeriodo } from "@/lib/cxc/efectividad";
import type { SeriesCxC } from "@/lib/cxc/seriesSemanales";
import { CORTE_ODOO } from "@/lib/smartbit";
import { esEspecial, especialesPorSede, especialesVigentes } from "@/lib/cxc/negociacionesEspeciales";
import { dsoPorTramo, grupoDso, plazosDeDocs, diasDePlazo, type DocDso, type GrupoDso, type TramoDso } from "@/lib/cxc/dsoPlazos";

/**
 * KPI "DSO" (días promedio de cobro) del mes, en su forma estándar:
 *
 *   DSO = CxC a crédito al cierre del mes ÷ ventas a crédito del mes × días del mes
 *
 * Los tres términos son del MISMO período (mezclar ventas de un año con días
 * de un mes da un número sin sentido). Mes en curso: corte y días a hoy, y
 * mientras lleve menos de `DIAS_MINIMOS` días se toman las ventas de los
 * últimos `DIAS_MINIMOS` días: con 1-2 días de ventas el DSO se disparaba
 * (2-nov-2026: 3.865 días en Valencia, 8.645 con las tres sedes).
 *
 *   CxC al cierre   = seriesSemanales.ts → carteraCEI:
 *                     saldo contable de la cuenta por cobrar, sin contado,
 *                     cartera vieja, Supricom ni SUPER TECHNO.
 *   ventas crédito  = efectividad.ts → facturasDelPeriodo:
 *                     facturas − notas de crédito a crédito del mes, con IVA.
 *
 * Medido en sep-2026: Valencia 37 días, igual que el tiempo real que tardaron en pagar
 * (Tiempo de Cobro, 37,6).
 *
 * ── Historia ──
 * Antes era un DSO por cliente (saldo ÷ ventas desde su 1ª factura × días,
 * luego 12 meses con Smartbit) promediado ponderando por saldo. Ese promedio
 * le da más peso a quien más debe respecto de lo que compra y salía 58-88 días
 * contra ~37 reales, además de no seguir el mes elegido.
 *
 * El detalle por cliente usa la misma fórmula (saldo a crédito al cierre ÷
 * ventas a crédito × días), pero con sus ventas de los últimos
 * `DIAS_CLIENTE` días y no solo las del mes: un cliente compra pocas veces al
 * mes, y con un mes su DSO salta con cada factura (oct-2026: AL GIORNO, que
 * paga a 45 días, salía 212 al día 20 porque ese mes solo había comprado
 * 12 mil contra 131 mil de saldo; con 90 días da 43). Para toda la cartera
 * el mes alcanza, por eso la tarjeta sigue mensual. Sin ventas en la ventana,
 * sin DSO. La ventana no empieza antes de CORTE_ODOO (antes, las ventas están
 * en Smartbit). La suma de saldos por cliente no es exactamente la CxC de la
 * tarjeta: la del libro además resta los pagos sin aplicar.
 *
 * Antes de abril 2026 Odoo no tiene las ventas (están en Smartbit), así que
 * esos meses salen sin DSO.
 *
 * ── Negociaciones especiales y tipo de cobro (nov-2026) ──
 * Los clientes que CxC marca como negociación especial
 * (lib/cxc/negociacionesEspeciales.ts: plazo extendido, refinanciamiento,
 * cuotas…) sesgaban el número general: su saldo y sus ventas salen del DSO
 * general (`value`) y se muestran aparte (`especiales`, con su propio DSO);
 * `valueConEspeciales` es el número de antes, con todo. Además, el DSO se abre
 * por tipo de cobro (plazo de pago de cada factura, `porPlazo`,
 * lib/cxc/dsoPlazos.ts): cada tramo con su DSO, su plazo promedio y los días
 * de atraso contra ese plazo. Las sumas por tramo salen de los saldos de cada
 * factura: no restan los pagos sin aplicar, así que no dan exacto la CxC del
 * libro.
 */

export interface DsoCliente {
  partnerId: number;
  partnerName: string;
  /** Saldo a crédito del cliente al cierre (facturas − NC abiertas). */
  saldo: number;
  /** Ventas a crédito del cliente en los últimos DIAS_CLIENTE días. */
  ventasNetas: number;
  /** Días de esa ventana. */
  dias: number;
  /** `null` si no tuvo ventas a crédito en la ventana. */
  dso: number | null;
  /** Todo lo suyo es de negociación especial (fuera del DSO general). */
  especial: boolean;
  /** Especial solo en alguna sede (vista de varias sedes): sigue en el general por lo demás. */
  especialParcial: boolean;
  /** Plazo de su factura más reciente con saldo, en días. */
  plazoDias: number | null;
}

export interface DsoResultado {
  /** DSO del mes. `null` si no hubo ventas a crédito. */
  value: number | null;
  /** CxC a crédito al cierre. */
  carteraAbierta: number;
  /** Ventas a crédito del mes. */
  ventasNetas: number;
  /** Días del período (del 1 al cierre, o a hoy en el mes en curso). */
  dias: number;
  /** true = mes en curso con pocos días: ventas y días son los últimos DIAS_MINIMOS. */
  ventanaMovil: boolean;
  /** Nº de clientes con saldo a crédito al cierre. */
  clientesIncluidos: number;
  /** Clientes con saldo a crédito al cierre, ordenados por saldo. */
  clientes: DsoCliente[];
  /** DSO con las negociaciones especiales adentro (el cálculo de antes). */
  valueConEspeciales: number | null;
  /** Saldo, ventas del período y DSO de las negociaciones especiales. */
  especiales: GrupoDso;
  /** DSO por tipo de cobro (plazo de pago), sin las negociaciones especiales. */
  porPlazo: TramoDso[];
}

const DIA_MS = 24 * 60 * 60 * 1000;
/** Ventana de ventas del DSO por cliente. */
export const DIAS_CLIENTE = 90;
/** Mes en curso con menos días que esto: el DSO usa las ventas de los últimos DIAS_MINIMOS días. */
export const DIAS_MINIMOS = 30;
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
  const diasDe = (desde: Date) => Math.max(1, Math.floor((corte.getTime() - desde.getTime()) / DIA_MS) + 1);
  const corteOdoo = new Date(`${CORTE_ODOO}T00:00:00`);
  // Mes en curso con pocos días: las ventas del mes son casi cero y el DSO se
  // dispara. Se toman los últimos DIAS_MINIMOS días (sin pasar del corte de Odoo).
  const ventanaMovil = finDia >= hoy && diasDe(inicio) < DIAS_MINIMOS;
  if (ventanaMovil) {
    inicio.setTime(new Date(corte).setHours(0, 0, 0, 0));
    inicio.setDate(inicio.getDate() - (DIAS_MINIMOS - 1));
    if (inicio < corteOdoo) inicio.setTime(corteOdoo.getTime());
  }
  const dias = diasDe(inicio);

  const desdeCliente = new Date(corte);
  desdeCliente.setHours(0, 0, 0, 0);
  desdeCliente.setDate(desdeCliente.getDate() - (DIAS_CLIENTE - 1));
  if (desdeCliente < corteOdoo) desdeCliente.setTime(corteOdoo.getTime());
  const diasCliente = Math.max(1, Math.floor((corte.getTime() - desdeCliente.getTime()) / DIA_MS) + 1);

  const [cxc, ventasMes, ventasCliente, especialesSet] = await Promise.all([
    series.carteraCEI(corte),
    facturasDelPeriodo(companyIds, fechaLocal(inicio), fechaLocal(corte)),
    facturasDelPeriodo(companyIds, fechaLocal(desdeCliente), fechaLocal(corte)),
    especialesVigentes(companyIds, fechaLocal(corte)),
  ]);
  const ventasTodas = ventasMes.reduce((s, f) => s + (Number(f.amount_total_signed) || 0), 0);

  // ── Documentos a crédito con saldo al cierre ──
  const { saldos, credito } = series.saldosEn(corte);
  const ids = [...saldos.keys()].filter((id) => credito.has(id));
  const moves: any[] = [];
  for (let i = 0; i < ids.length; i += 5000) {
    moves.push(...((await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 5000)], {
      fields: ["id", "commercial_partner_id", "company_id", "move_type", "invoice_date", "invoice_date_due", "reversed_entry_id"],
    })) || []));
  }

  // Un documento por factura/NC: su saldo al cierre y su venta del período.
  const docs = new Map<number, DocDso & { nombre: string }>();
  const doc = (m: any): DocDso & { nombre: string } => {
    let d = docs.get(m.id);
    if (!d) {
      d = {
        id: m.id,
        companyId: idDe(m.company_id) || 0,
        partnerId: idDe(m.commercial_partner_id) || 0,
        nombre: m.commercial_partner_id?.[1] || "Sin cliente",
        esNC: m.move_type === "out_refund",
        revierte: idDe(m.reversed_entry_id) ?? null,
        fecha: m.invoice_date || null,
        vence: m.invoice_date_due || null,
        saldo: 0,
        venta: 0,
      };
      docs.set(m.id, d);
    }
    return d;
  };
  for (const m of moves) doc(m).saldo += saldos.get(m.id) || 0;
  for (const f of ventasMes) doc(f).venta += Number(f.amount_total_signed) || 0;
  const lista = [...docs.values()];

  // NC cuya factura no está entre los documentos: se lee el plazo de esa factura.
  const faltan = [...new Set(lista.filter((d) => d.esNC && d.revierte && !docs.has(d.revierte)).map((d) => d.revierte as number))];
  const plazoExterno = new Map<number, number | null>();
  for (let i = 0; i < faltan.length; i += 2000) {
    const leidas = (await callOdooRPC<any[]>("account.move", "read", [faltan.slice(i, i + 2000)], { fields: ["id", "invoice_date", "invoice_date_due"] })) || [];
    for (const f of leidas) plazoExterno.set(f.id, diasDePlazo(f.invoice_date, f.invoice_date_due));
  }
  const plazos = plazosDeDocs(lista, plazoExterno);

  // ── Negociaciones especiales: fuera del número general, aparte con su DSO ──
  const especial = (d: { companyId: number; partnerId: number }) => esEspecial(especialesSet, d.companyId, d.partnerId);
  const grupoEsp = grupoDso(lista.filter(especial), dias);
  // Su saldo sale del libro, en la misma base que la CxC general: así también
  // se restan sus pagos sin aplicar (un cliente que paga por cuotas los tiene)
  // y el general no queda subestimado.
  let saldoEspLibro = 0;
  for (const [cid, partners] of especialesPorSede(especialesSet, companyIds)) {
    saldoEspLibro += (await series.carteraCEI(corte, cid, partners)).total;
  }
  const especiales: GrupoDso = {
    ...grupoEsp,
    saldo: Math.round(saldoEspLibro * 100) / 100,
    dso: grupoEsp.ventas > 0 ? Math.round((saldoEspLibro / grupoEsp.ventas) * dias) : null,
  };
  const cxcGeneral = cxc.total - saldoEspLibro;
  const ventas = ventasTodas - grupoEsp.ventas;

  // ── Detalle por cliente (empresa) ──
  // `especial` = todo lo suyo es de negociación especial; `especialParcial` =
  // solo en alguna sede (vista de varias sedes): ese cliente sigue en el general.
  type Acum = { name: string; saldo: number; ventas: number; esp: boolean; gen: boolean; plazo: { fecha: string; dias: number } | null };
  const porCliente = new Map<number, Acum>();
  const cliente = (pid: number, name: string) => {
    if (!porCliente.has(pid)) porCliente.set(pid, { name, saldo: 0, ventas: 0, esp: false, gen: false, plazo: null });
    return porCliente.get(pid)!;
  };
  for (const d of lista) {
    if (Math.abs(d.saldo) < 0.005) continue;
    const c = cliente(d.partnerId, d.nombre);
    c.saldo += d.saldo;
    if (especial(d)) c.esp = true;
    else c.gen = true;
    const p = plazos.get(d.id);
    if (!d.esNC && p != null && d.fecha && (!c.plazo || d.fecha > c.plazo.fecha)) c.plazo = { fecha: d.fecha, dias: p };
  }
  for (const f of ventasCliente) {
    const c = cliente(idDe(f.commercial_partner_id) || 0, f.commercial_partner_id?.[1] || "Sin cliente");
    c.ventas += Number(f.amount_total_signed) || 0;
    if (esEspecial(especialesSet, idDe(f.company_id) || 0, idDe(f.commercial_partner_id) || 0)) c.esp = true;
    else c.gen = true;
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const clientes: DsoCliente[] = [...porCliente]
    .filter(([pid, c]) => pid && c.saldo >= 0.005)
    .map(([pid, c]) => ({
      partnerId: pid,
      partnerName: c.name,
      saldo: r2(c.saldo),
      ventasNetas: r2(c.ventas),
      dias: diasCliente,
      dso: c.ventas > 0 ? Math.round((c.saldo / c.ventas) * diasCliente) : null,
      especial: c.esp && !c.gen,
      especialParcial: c.esp && c.gen,
      plazoDias: c.plazo?.dias ?? null,
    }))
    .sort((a, b) => b.saldo - a.saldo);

  return {
    value: ventas > 0 ? Math.round((cxcGeneral / ventas) * dias) : null,
    carteraAbierta: r2(cxcGeneral),
    ventasNetas: r2(ventas),
    dias,
    ventanaMovil,
    clientesIncluidos: clientes.filter((c) => !c.especial).length,
    clientes,
    valueConEspeciales: ventasTodas > 0 ? Math.round((cxc.total / ventasTodas) * dias) : null,
    especiales,
    porPlazo: dsoPorTramo(lista.filter((d) => !especial(d)), plazos, dias),
  };
}
