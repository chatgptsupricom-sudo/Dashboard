import { callOdooRPC } from "@/lib/odoo";
import { dominioFechaEfectiva, fechasEfectivas } from "@/lib/cxc/fechaConfirmacion";
import { obtenerCobros, esRelacionada, RELACIONADA } from "@/lib/cxc/cobros";
import { idsACredito } from "@/lib/cxc/credito";
import { esCarteraVieja } from "@/lib/cxc/carteraVieja";

/**
 * Series semanales de Cartera Vencida y Recuperación de Vencidos.
 *
 * Las dos necesitan lo mismo: saber cuánto debía cada factura en una fecha
 * PASADA. `amount_residual` solo da el saldo de hoy, así que el saldo en un
 * corte C se reconstruye hacia atrás:
 *
 *   saldo(factura, C) = saldo de hoy + todo lo que se le concilió DESPUÉS de C
 *
 * Con eso:
 *
 *   Cartera vencida al cierre de la semana W
 *     = Σ saldo(f, finW) de las facturas ya vencidas en finW
 *     ÷ Σ saldo(f, finW) de toda la cartera
 *
 *   Recuperación de la semana W
 *     = cobrado dentro de W (lib/cxc/cobros.ts, banco/caja, igual que
 *       Contado/Crédito) sobre facturas ya vencidas al iniciar W
 *     ÷ saldo vencido al iniciar W
 *
 * Cada cobro se fecha por la CONFIRMACIÓN del pago, no por la conciliación
 * (ver lib/cxc/fechaConfirmacion.ts): un pago confirmado después del corte
 * todavía era deuda en ese corte.
 *
 * ── Por qué se incluyen facturas ya pagadas ──
 *
 * Una factura que en agosto tenía saldo y hoy está cobrada SÍ formaba parte de
 * la cartera de agosto. Si solo se miraran las facturas que hoy siguen
 * abiertas, la historia saldría subestimada (medido: agosto daría ~33% en vez
 * de ~52-61%). Por eso el universo se arma con las facturas abiertas HOY más
 * las que recibieron alguna conciliación dentro del período.
 *
 * ── Consecuencia sobre el KPI mensual ──
 *
 * Cartera Vencida pasa a calcularse desde `account.move` en vez de
 * `digiflex.cxc.report`, para que el promedio y las celdas semanales salgan de
 * la misma fuente y aten. Eso mueve el valor de hoy ~1,7 puntos (45,0% → 46,7%)
 * y de paso resuelve el desvío de ~3% entre las dos fuentes que quedó
 * documentado en el issue #190. El resto de la pantalla (aging, top deudores,
 * por vendedor, por sede) sigue leyendo el reporte de Odoo, que es donde tiene
 * el detalle por renglón.
 */

export interface SemanaRango {
  inicio: Date;
  fin: Date;
}

export interface SeriesCxC {
  /** % de cartera vencida al cierre de cada semana. */
  carteraVencidaSemana: (string | null)[];
  /** % recuperado en cada semana. */
  recuperacionSemana: (string | null)[];
  /** Cartera vencida de HOY, con el mismo método que las semanas. */
  carteraHoy: CarteraHoy;
  /** Lo mismo, por sede (company_id). */
  carteraHoyPorSede: Record<number, CarteraHoy>;
  /**
   * Cartera a crédito para el CEI (lib/cxc/efectividad.ts) en cualquier corte
   * desde el inicio de la primera semana. Ver carteraCEI más abajo.
   */
  carteraCEI: CarteraCEI;
  /**
   * Saldo de cada factura en un corte (desde el inicio de la primera semana),
   * sin cartera vieja ni relacionada, más cuánto suman esas dos aparte. Lo usa
   * "Por cobrar" de Contado/Crédito (lib/cxc/porCobrar.ts).
   */
  saldosEn: (corte: Date) => {
    saldos: Map<number, number>;
    /** Ids de `saldos` que son a crédito (lib/cxc/credito.ts). */
    credito: Set<number>;
    viejas: Map<number, number>;
    incobrables: number;
    relacionadas: number;
  };
}

/** `companyId` limita el corte a una sede (para la tabla Por Sede). */
export type CarteraCEI = (corte: Date, companyId?: number) => Promise<{ total: number; noVencida: number }>;

export interface CarteraHoy {
  pct: number | null;
  vencido: number;
  total: number;
  /** Facturas y notas de crédito con saldo, y cuántas de ellas vencidas. */
  facturas: number;
  facturasVencidas: number;
  /**
   * Antigüedad del saldo abierto por días vencidos en el corte. Suma `total`,
   * y las bandas vencidas suman `vencido`.
   */
  aging: Record<Banda, number>;
}

export type Banda = "corriente" | "1-30" | "31-60" | "61-90" | "91+";

const DIA_MS = 24 * 60 * 60 * 1000;

const PAGE = 5000;

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

const iso = (d: Date) => d.toISOString().split("T")[0];
const soloFecha = (s: string) => new Date(s.slice(0, 10) + "T00:00:00");
/**
 * ¿La factura ya estaba vencida en el corte? Se compara contra el INICIO del
 * día del corte: los cortes llegan a las 23:59 (hoy) y con `due < corte` una
 * factura que vence hoy contaba como vencida (Valencia, 29-sep-2026: 69 k de
 * más). Vence hoy = todavía no está vencida, igual que `days_overdue` de Odoo.
 */
const vencidaEn = (due: Date | null, corte: Date) => {
  if (!due) return false;
  const dia = new Date(corte);
  dia.setHours(0, 0, 0, 0);
  return due < dia;
};
/** YYYY-MM-DD en hora local: los cortes vienen a las 23:59 y toISOString los pasaría al día siguiente. */
const fechaLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Factura {
  companyId: number;
  /** Fecha de emisión: una factura no existía en un corte anterior a ella. */
  emision: Date | null;
  due: Date | null;
  /** Saldo de hoy, con signo (una nota de crédito abierta resta). */
  residual: number;
  /** Venta a crédito (lib/cxc/credito.ts). */
  credito: boolean;
  /** Vencida antes de 2025 (lib/cxc/carteraVieja.ts): fuera de Cartera Vencida, Recuperación y CEI. */
  vieja: boolean;
  /** Empresa relacionada (SUPER TECHNO, lib/cxc/cobros.ts): fuera del CEI, Cartera Vencida y Recuperación. */
  relacionada: boolean;
  /** Conciliaciones de esta factura dentro del período: [fecha, monto]. */
  pagos: { fecha: Date; monto: number }[];
}

export async function calcularSeriesCxC(
  companyIds: number[],
  semanas: SemanaRango[],
  hoy: Date,
): Promise<SeriesCxC> {
  const vacio: SeriesCxC = {
    carteraVencidaSemana: semanas.map(() => null),
    recuperacionSemana: semanas.map(() => null),
    carteraHoy: { pct: null, vencido: 0, total: 0, facturas: 0, facturasVencidas: 0,
      aging: { corriente: 0, "1-30": 0, "31-60": 0, "61-90": 0, "91+": 0 } },
    carteraHoyPorSede: {},
    carteraCEI: async () => ({ total: 0, noVencida: 0 }),
    saldosEn: () => ({ saldos: new Map(), credito: new Set(), viejas: new Map(), incobrables: 0, relacionadas: 0 }),
  };
  if (semanas.length === 0) return vacio;

  const desde = iso(semanas[0].inicio);
  const noInterno: any[] = [["partner_id.name", "not ilike", "supricom"]];

  const hastaSerie = iso(semanas[semanas.length - 1].fin > hoy ? hoy : semanas[semanas.length - 1].fin);
  const [abiertasHoy, conciliaciones, cobros] = await Promise.all([
    // Cartera abierta hoy (cualquier vencimiento): la base sobre la que se
    // reconstruye hacia atrás.
    paginar(
      "account.move",
      [
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["amount_residual", "!=", 0],
        ...noInterno,
      ],
      ["id", "move_type", "invoice_date", "invoice_date_due", "amount_residual", "invoice_payment_term_id", "reversed_entry_id", "commercial_partner_id", "company_id"],
    ),
    // Conciliaciones del período. Sirven para dos cosas: sumar hacia atrás el
    // saldo de un corte, y ser el numerador de Recuperación.
    paginar(
      "account.partial.reconcile",
      [
        ["debit_move_id.move_id.move_type", "=", "out_invoice"],
        ["debit_move_id.move_id.state", "=", "posted"],
        ["company_id", "in", companyIds],
        ["debit_move_id.move_id.partner_id.name", "not ilike", "supricom"],
        ...dominioFechaEfectiva(">=", desde),
      ],
      ["id", "amount", "max_date", "debit_move_id", "credit_move_id"],
    ),
    // Numerador de Recuperación: solo dinero real, misma fuente que Contado/Crédito.
    obtenerCobros(companyIds, {
      desde,
      hasta: hastaSerie,
      dominioFactura: [["move_type", "=", "out_invoice"], ["partner_id.name", "not ilike", "supricom"]],
    }),
  ]);

  const facturas = new Map<number, Factura>();
  const movimientos: any[] = [...(abiertasHoy as any[])];
  for (const inv of abiertasHoy as any[]) {
    const signo = inv.move_type === "out_refund" ? -1 : 1;
    facturas.set(inv.id, {
      companyId: Array.isArray(inv.company_id) ? inv.company_id[0] : inv.company_id,
      emision: inv.invoice_date ? soloFecha(inv.invoice_date) : null,
      due: inv.invoice_date_due ? soloFecha(inv.invoice_date_due) : null,
      residual: signo * Math.abs(inv.amount_residual || 0),
      credito: false,
      vieja: esCarteraVieja(inv.invoice_date_due),
      relacionada: esRelacionada(inv.commercial_partner_id?.[1] || ""),
      pagos: [],
    });
  }

  // Las conciliaciones apuntan a la LÍNEA por cobrar, no a la factura: hace
  // falta el mapa línea -> factura para colgarlas de su factura.
  const lineIds = Array.from(
    new Set(
      (conciliaciones as any[])
        .map((c) => (Array.isArray(c.debit_move_id) ? c.debit_move_id[0] : c.debit_move_id))
        .filter(Boolean),
    ),
  );
  const facturaDeLinea = new Map<number, number>();
  if (lineIds.length > 0) {
    const lineas = await paginar("account.move.line", [["id", "in", lineIds]], ["id", "move_id"]);
    for (const l of lineas as any[]) {
      const moveId = Array.isArray(l.move_id) ? l.move_id[0] : l.move_id;
      if (moveId) facturaDeLinea.set(l.id, moveId);
    }
  }

  // Facturas que recibieron pagos en el período pero HOY ya están cerradas:
  // no vinieron en `abiertasHoy` y sin ellas la historia sale subestimada.
  const faltantes = Array.from(
    new Set(Array.from(facturaDeLinea.values()).filter((id) => !facturas.has(id))),
  );
  if (faltantes.length > 0) {
    const cerradas = await paginar(
      "account.move",
      [["id", "in", faltantes]],
      ["id", "move_type", "invoice_date", "invoice_date_due", "amount_residual", "invoice_payment_term_id", "reversed_entry_id", "commercial_partner_id", "company_id"],
    );
    movimientos.push(...(cerradas as any[]));
    for (const inv of cerradas as any[]) {
      const signo = inv.move_type === "out_refund" ? -1 : 1;
      facturas.set(inv.id, {
        companyId: Array.isArray(inv.company_id) ? inv.company_id[0] : inv.company_id,
        emision: inv.invoice_date ? soloFecha(inv.invoice_date) : null,
        due: inv.invoice_date_due ? soloFecha(inv.invoice_date_due) : null,
        residual: signo * Math.abs(inv.amount_residual || 0),
        credito: false,
        vieja: esCarteraVieja(inv.invoice_date_due),
        relacionada: esRelacionada(inv.commercial_partner_id?.[1] || ""),
        pagos: [],
      });
    }
  }

  const aCredito = await idsACredito(movimientos);
  for (const [id, f] of facturas) f.credito = aCredito.has(id);

  const fechaDe = await fechasEfectivas(conciliaciones as any[]);
  for (const c of conciliaciones as any[]) {
    const lineaId = Array.isArray(c.debit_move_id) ? c.debit_move_id[0] : c.debit_move_id;
    const facturaId = facturaDeLinea.get(lineaId);
    const f = facturaId !== undefined ? facturas.get(facturaId) : undefined;
    const fecha = fechaDe.get(c.id);
    if (!f || !fecha) continue;
    f.pagos.push({ fecha: soloFecha(fecha), monto: Number(c.amount || 0) });
  }

  const todas = Array.from(facturas.values());

  /** Saldo de una factura en un corte: el de hoy más lo conciliado después. */
  const saldoEn = (f: Factura, corte: Date) =>
    f.residual + f.pagos.reduce((s, p) => (p.fecha > corte ? s + p.monto : s), 0);

  const carteraVencidaEn = (corte: Date, companyId?: number) => {
    let total = 0;
    let vencido = 0;
    let facturas = 0;
    let facturasVencidas = 0;
    const aging: Record<Banda, number> = { corriente: 0, "1-30": 0, "31-60": 0, "61-90": 0, "91+": 0 };
    const dia = new Date(corte);
    dia.setHours(0, 0, 0, 0);
    for (const f of todas) {
      if (f.vieja || f.relacionada) continue;
      if (companyId !== undefined && f.companyId !== companyId) continue;
      // Una factura emitida después del corte no formaba parte de la cartera
      // en ese momento: sin este filtro, las semanas pasadas salen infladas.
      if (f.emision && f.emision > corte) continue;
      const saldo = saldoEn(f, corte);
      if (Math.abs(saldo) < 0.005) continue;
      total += saldo;
      facturas++;
      // Vencida = su fecha de vencimiento ya había pasado EN ESE CORTE. No se
      // puede usar el `days_overdue` del reporte de Odoo, que está calculado
      // contra hoy: una factura que vencía el 10 no estaba vencida el 7.
      if (vencidaEn(f.due, corte)) {
        vencido += saldo;
        facturasVencidas++;
        const dias = Math.round((dia.getTime() - f.due!.getTime()) / DIA_MS);
        aging[dias <= 30 ? "1-30" : dias <= 60 ? "31-60" : dias <= 90 ? "61-90" : "91+"] += saldo;
      } else {
        aging.corriente += saldo;
      }
    }
    return {
      total, vencido, facturas, facturasVencidas, aging,
      pct: total > 0 ? Math.round((vencido / total) * 10000) / 100 : null,
    };
  };

  /**
   * Cartera del CEI en un corte, desde el LIBRO: saldo de la cuenta por cobrar
   * (account.move.line) con fecha contable hasta el corte, menos lo que no es
   * crédito o es cartera vieja.
   *
   * Por qué no se reconstruye como Cartera Vencida (saldo de hoy + pagos
   * posteriores): esa reconstrucción mira solo facturas, así que un pago que
   * ya entró pero todavía no está conciliado dejaba la factura como deuda
   * (sep-2026: 152 k en Caracas, 34 k en Valencia), una nota de crédito abierta
   * al inicio y aplicada después no restaba, y la fecha era la de confirmación
   * del pago. El libro trae todo eso neto y cuadra con el reporte de
   * antigüedad de Odoo a esa fecha.
   *
   * Contado y cartera vieja no se pueden separar en el libro (un pago no dice
   * de qué factura es hasta que se concilia), así que se restan por factura con
   * la reconstrucción de arriba; son montos chicos (15-42 k por sede). Los
   * pagos sin aplicar quedan del lado del crédito.
   *
   * `noVencida` = saldo de las facturas a crédito que en el corte todavía no
   * vencían (reconstruido por factura; un pago sin aplicar no tiene vencimiento).
   *
   * ponytail: la resta por factura hereda dos límites de la reconstrucción:
   * fecha los pagos por confirmación (el libro, por fecha contable) y no ve las
   * notas de crédito ya aplicadas (solo sigue conciliaciones del lado factura).
   * Medido al 31-ago-2026: NC abiertas en el corte y aplicadas después = 250 $
   * en Valencia y 556 $ en Panamá. Si crece, traer también las conciliaciones
   * con `credit_move_id.move_id.move_type = out_refund`.
   */
  const baseLibro: any[] = [
    ["account_id.account_type", "=", "asset_receivable"],
    ["parent_state", "=", "posted"],
    ["company_id", "in", companyIds],
    ["partner_id.name", "not ilike", "supricom"],
    ["partner_id.commercial_partner_id.name", "not ilike", RELACIONADA],
  ];
  const carteraCEI: CarteraCEI = async (corte, companyId) => {
    const sede: any[] = companyId !== undefined ? [["company_id", "=", companyId]] : [];
    const g = await callOdooRPC<any[]>(
      "account.move.line",
      "read_group",
      [[...baseLibro, ...sede, ["date", "<=", fechaLocal(corte)]], ["balance:sum"], []],
      { lazy: false },
    );
    let total = Number(g?.[0]?.balance || 0);
    let noVencida = 0;
    for (const f of todas) {
      if (f.relacionada) continue;
      if (companyId !== undefined && f.companyId !== companyId) continue;
      if (f.emision && f.emision > corte) continue;
      const saldo = saldoEn(f, corte);
      if (Math.abs(saldo) < 0.005) continue;
      if (!f.credito || f.vieja) {
        total -= saldo;
        continue;
      }
      if (!vencidaEn(f.due, corte)) noVencida += saldo;
    }
    return { total, noVencida };
  };

  const pct1 = (n: number | null) => (n === null ? null : `${Math.round(n)}%`);

  const carteraVencidaSemana = semanas.map((s) =>
    s.inicio > hoy ? null : pct1(carteraVencidaEn(s.fin > hoy ? hoy : s.fin).pct),
  );

  const recuperacionSemana = semanas.map((s) => {
    if (s.inicio > hoy) return null;
    let denominador = 0;
    let recuperado = 0;
    for (const f of todas) {
      if (f.vieja || f.relacionada) continue;
      if (f.emision && f.emision >= s.inicio) continue; // aún no existía
      if (!f.due || f.due >= s.inicio) continue; // no estaba vencida al iniciar la semana
      denominador += f.residual + f.pagos.reduce((a, p) => (p.fecha >= s.inicio ? a + p.monto : a), 0);
    }
    const ini = iso(s.inicio);
    const fin = iso(s.fin);
    for (const c of cobros) {
      if (c.fecha < ini || c.fecha > fin) continue;
      const f = facturas.get(c.facturaId);
      if (!f || f.vieja || f.relacionada) continue;
      if (f.emision && f.emision >= s.inicio) continue;
      if (!f.due || f.due >= s.inicio) continue;
      recuperado += c.monto;
    }
    if (denominador <= 0) return null;
    return `${Math.round((recuperado / denominador) * 100)}%`;
  });

  const hoyCartera = carteraVencidaEn(hoy);
  const redondear = (c: CarteraHoy): CarteraHoy => ({
    ...c,
    vencido: Math.round(c.vencido * 100) / 100,
    total: Math.round(c.total * 100) / 100,
    aging: Object.fromEntries(
      Object.entries(c.aging).map(([b, v]) => [b, Math.round(v * 100) / 100]),
    ) as Record<Banda, number>,
  });
  return {
    carteraVencidaSemana,
    recuperacionSemana,
    carteraHoy: redondear(hoyCartera),
    carteraHoyPorSede: Object.fromEntries(companyIds.map((cid) => [cid, redondear(carteraVencidaEn(hoy, cid))])),
    carteraCEI,
    saldosEn: (corte) => {
      const saldos = new Map<number, number>();
      const credito = new Set<number>();
      const viejas = new Map<number, number>();
      let incobrables = 0;
      let relacionadas = 0;
      for (const [id, f] of facturas) {
        if (f.emision && f.emision > corte) continue;
        const saldo = saldoEn(f, corte);
        if (Math.abs(saldo) < 0.005) continue;
        if (f.relacionada) relacionadas += saldo;
        else if (f.vieja) {
          incobrables += saldo;
          viejas.set(id, saldo);
        } else {
          saldos.set(id, saldo);
          if (f.credito) credito.add(id);
        }
      }
      return { saldos, credito, viejas, incobrables, relacionadas };
    },
  };
}
