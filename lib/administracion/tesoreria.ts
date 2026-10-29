import {
  RE_INTERCOMPANIA,
  agrupar,
  diasEntre,
  idM2o,
  leerTodo,
  nombreM2o,
  redondear,
  sumarDias,
} from "@/lib/administracion/lectura";
import { empresaDeCompanyId } from "@/lib/administracion/empresas";

/**
 * Tesoreria y Bancos del rol Administracion.
 *
 * El saldo de cada banco/caja es su saldo en libros: la cuenta por defecto de
 * su diario mas sus cuentas de "Recibos/Pagos Pendientes" (R/P, la
 * `payment_account_id` de los metodos de pago). Un cobro o pago registrado va a
 * R/P y solo pasa a la cuenta del banco al conciliarlo con el extracto; como en
 * Valencia y Caracas casi no se cargan extractos, la cuenta del banco sola deja
 * fuera casi todo lo cobrado y pagado desde abril (oct-2026: -$7,8 M en
 * Valencia). Asientos publicados, en USD; lo que esta en bolivares en un banco
 * en bolivares se pasa a USD con la tasa BCV de hoy, no con la de cada asiento.
 * Varios diarios apuntan a la misma cuenta (en Panama "Banco General", "Tarjeta
 * de Debito BANCO GENERAL"...), asi que se agrupa por cuenta, no por diario.
 *
 * No todo diario de tipo banco es dinero: hay retenciones (IVA/ITBMS/IGTF que
 * retuvieron los clientes), cuentas puente (transitorias, "Depositos X
 * Identificar"). Esas se muestran aparte y no suman al disponible. Los diarios
 * que apuntan a una cuenta de resultados ("DESCUENTO" en Panama) o a un pasivo
 * de retenciones (IGTF/ITBMS por pagar) no son tesoreria y no se muestran.
 *
 * La conciliacion se lee de las lineas de extracto (`account.bank.statement.line`):
 * cuantas faltan por conciliar y cuando se cargo el ultimo extracto. En oct-2026
 * la mayoria de los bancos de Valencia y Caracas solo tenian el saldo inicial
 * de la migracion: sin extractos cargados no hay conciliacion posible.
 */

const RE_RETENCION = /retenid|retenci|igtf|igft|itbms/i;
const RE_PUENTE = /transitori|identificar|descuento|puente/i;

export type ClaseCuenta = "disponible" | "retencion" | "puente";

export interface CuentaTesoreria {
  cuentaId: number;
  codigo: string;
  nombre: string;
  /** Diarios que usan la cuenta. */
  diarios: string[];
  tipo: "bank" | "cash";
  sede: string;
  clase: ClaseCuenta;
  moneda: string;
  /** Saldo en libros en USD: `saldoBanco` + `pendiente`. */
  saldo: number;
  /** Saldo de la cuenta del banco (lo ya conciliado con extractos). */
  saldoBanco: number;
  /** Cobros (+) y pagos (-) registrados que todavia no se conciliaron (R/P). */
  pendiente: number;
  /** Saldo en libros en la moneda del diario (Bs), si no es USD. */
  saldoMonedaDiario: number | null;
  /** Cobros y pagos del mes (sin transferencias entre cuentas propias). */
  entradasMes: number;
  salidasMes: number;
  extracto: {
    ultimo: string | null;
    diasDesdeUltimo: number | null;
    sinConciliar: number;
    montoSinConciliar: number;
    sinConciliarMasViejo: string | null;
  };
}

export interface SemanaFlujo {
  desde: string;
  hasta: string;
  entradas: number;
  salidas: number;
  saldoFinal: number;
}

export interface DatosTesoreriaAdmin {
  resumen: {
    disponible: number;
    disponibleBancos: number;
    disponibleCajas: number;
    retenciones: number;
    puente: number;
    pendiente: number;
    entradasMes: number;
    salidasMes: number;
    lineasSinConciliar: number;
    diariosSinExtractoReciente: number;
  };
  cuentas: CuentaTesoreria[];
  tasas: { moneda: string; fecha: string; bsPorUnidad: number; anterior: { fecha: string; bsPorUnidad: number } | null }[];
  /** Asientos en bolivares registrados a tasa 1 (Bs cargados como USD) en bancos y cajas. */
  bolivaresComoDolares: { asiento: string; fecha: string; cuenta: string; monto: number }[];
  flujo: {
    saldoInicial: number;
    porCobrarVencido: number;
    porPagarVencido: number;
    semanas: SemanaFlujo[];
  };
}

/** Un extracto con mas de estos dias se considera atrasado. */
export const DIAS_EXTRACTO_ATRASADO = 7;

const ES_BOLIVAR = /^VE[FS]$/;

/**
 * Cuentas por donde pasan los cobros y pagos de los bancos antes de casarse con
 * el extracto: las de "Recibos/Pagos Pendientes" de los metodos de pago (por
 * cuenta del banco) y las transitorias del extracto (`suspense_account_id`).
 * `diarios` = account.journal con default_account_id y suspense_account_id.
 */
export async function cuentasPendientesDeBancos(
  diarios: any[],
  companyIds: number[],
): Promise<{ cuentaDePendiente: Map<number, number>; transitorias: number[] }> {
  const cuentaDeDiario = new Map<number, number>();
  diarios.forEach((j: any) => {
    const id = idM2o(j.default_account_id);
    if (id) cuentaDeDiario.set(j.id, id);
  });
  const propias = new Set(cuentaDeDiario.values());
  const metodos = cuentaDeDiario.size
    ? await leerTodo(
        "account.payment.method.line",
        [["journal_id", "in", Array.from(cuentaDeDiario.keys())], ["payment_account_id", "!=", false]],
        ["journal_id", "payment_account_id"],
        companyIds,
      )
    : [];
  const cuentaDePendiente = new Map<number, number>();
  metodos.forEach((m: any) => {
    const pendiente = idM2o(m.payment_account_id);
    const cuenta = cuentaDeDiario.get(idM2o(m.journal_id) || 0);
    // En las cajas el metodo de pago apunta a la misma cuenta de la caja.
    if (pendiente && cuenta && !propias.has(pendiente)) cuentaDePendiente.set(pendiente, cuenta);
  });
  const transitorias = Array.from(
    new Set(
      diarios
        .map((j: any) => idM2o(j.suspense_account_id))
        .filter((id): id is number => !!id && !propias.has(id)),
    ),
  );
  return { cuentaDePendiente, transitorias };
}

export async function fetchTesoreriaAdmin(
  companyIds: number[],
  hoy: string,
  desde: string,
  hasta: string,
): Promise<DatosTesoreriaAdmin> {
  const diarios = await leerTodo(
    "account.journal",
    [
      ["type", "in", ["bank", "cash"]],
      ["company_id", "in", companyIds],
    ],
    ["name", "type", "currency_id", "default_account_id", "suspense_account_id", "company_id"],
    companyIds,
  );

  const porCuenta = new Map<number, CuentaTesoreria>();
  const cuentaDeDiario = new Map<number, number>();
  diarios.forEach((j: any) => {
    const cuentaId = idM2o(j.default_account_id);
    if (!cuentaId) return;
    cuentaDeDiario.set(j.id, cuentaId);
    const nombreDiario = typeof j.name === "string" ? j.name : String(j.name ?? "");
    const moneda = nombreM2o(j.currency_id, "USD");
    let c = porCuenta.get(cuentaId);
    if (!c) {
      const cuentaTxt = nombreM2o(j.default_account_id);
      const [codigo, ...resto] = cuentaTxt.split(" ");
      c = {
        cuentaId,
        codigo,
        nombre: nombreDiario,
        diarios: [],
        tipo: j.type,
        sede: empresaDeCompanyId(idM2o(j.company_id) || 0),
        clase: "disponible",
        moneda,
        saldo: 0,
        saldoBanco: 0,
        pendiente: 0,
        saldoMonedaDiario: null,
        entradasMes: 0,
        salidasMes: 0,
        extracto: { ultimo: null, diasDesdeUltimo: null, sinConciliar: 0, montoSinConciliar: 0, sinConciliarMasViejo: null },
      };
      // El nombre de la cuenta contable tambien cuenta para clasificar
      // ("Cuenta Transitoria...", "IVA RETENIDO...").
      (c as any)._nombreCuenta = resto.join(" ");
      porCuenta.set(cuentaId, c);
    }
    c.diarios.push(nombreDiario);
    if (moneda !== "USD") c.moneda = moneda;
    // Una cuenta que comparte una caja con un diario de banco ("Cheque") es caja.
    if (j.type === "cash") c.tipo = "cash";
  });

  porCuenta.forEach((c) => {
    const texto = `${c.diarios.join(" ")} ${(c as any)._nombreCuenta || ""}`;
    c.clase = RE_RETENCION.test(texto) ? "retencion" : RE_PUENTE.test(texto) ? "puente" : "disponible";
    // Se prefiere como nombre un diario que no sea de tarjeta/deposito.
    c.nombre =
      c.diarios.find((d) => !/tarjeta|deposito|cheque/i.test(d)) || c.diarios[0] || c.nombre;
    delete (c as any)._nombreCuenta;
  });

  const [{ cuentaDePendiente }, tiposCuenta] = await Promise.all([
    cuentasPendientesDeBancos(diarios, companyIds),
    porCuenta.size
      ? leerTodo("account.account", [["id", "in", Array.from(porCuenta.keys())]], ["account_type"], companyIds)
      : Promise.resolve([] as any[]),
  ]);
  tiposCuenta.forEach((a: any) => {
    const c = porCuenta.get(a.id);
    const tipo = String(a.account_type || "");
    // Ingresos/gastos nunca; pasivos solo como cuenta puente (transitorias por pagar).
    if (c && (!/^(asset|liability)/.test(tipo) || (tipo.startsWith("liability") && c.clase !== "puente"))) {
      porCuenta.delete(a.id);
    }
  });
  Array.from(cuentaDePendiente.entries()).forEach(([p, c]) => {
    if (!porCuenta.has(c)) cuentaDePendiente.delete(p);
  });

  const cuentaIds = Array.from(porCuenta.keys());
  const conPendientes = [...cuentaIds, ...Array.from(cuentaDePendiente.keys())];
  const journalIds = Array.from(cuentaDeDiario.keys()).filter((j) => porCuenta.has(cuentaDeDiario.get(j) || 0));

  const [saldos, movimientosMes, extractos, sinConciliar, tasasRaw, cxcAbierta, cxpAbierta, aTasaUno] = await Promise.all([
    conPendientes.length
      ? agrupar(
          "account.move.line",
          [
            ["account_id", "in", conPendientes],
            ["parent_state", "=", "posted"],
            ["company_id", "in", companyIds],
          ],
          ["balance:sum", "amount_currency:sum"],
          ["account_id", "currency_id"],
          companyIds,
        )
      : Promise.resolve([]),
    // Cobros y pagos del mes. No se suman los movimientos de la cuenta: una
    // transferencia entre bancos propios o la conciliacion (R/P -> banco)
    // contarian como entrada y salida.
    journalIds.length
      ? leerTodo(
          "account.payment",
          [
            ["journal_id", "in", journalIds],
            ["state", "=", "posted"],
            ["is_internal_transfer", "=", false],
            ["date", ">=", desde],
            ["date", "<=", hasta],
          ],
          // journal_id/date vienen del asiento (_inherits): se leen, no se agrupan.
          ["journal_id", "payment_type", "amount_company_currency_signed"],
          companyIds,
        )
      : Promise.resolve([]),
    // Ultimo extracto por diario: se agrupa el asiento de cada linea de
    // extracto (account.move.statement_line_id), que tiene journal_id y date
    // guardados; en la linea de extracto esos campos son heredados.
    journalIds.length
      ? agrupar(
          "account.move",
          [
            ["journal_id", "in", journalIds],
            ["statement_line_id", "!=", false],
            ["state", "=", "posted"],
          ],
          ["date:max"],
          ["journal_id"],
          companyIds,
        )
      : Promise.resolve([]),
    // Lineas sin conciliar: son pocas (cientos), se leen y se suman aqui.
    journalIds.length
      ? leerTodo(
          "account.bank.statement.line",
          [
            ["journal_id", "in", journalIds],
            ["state", "=", "posted"],
            ["is_reconciled", "=", false],
          ],
          ["journal_id", "date", "amount"],
          companyIds,
        )
      : Promise.resolve([]),
    // La tasa BCV la carga l10n_ve_bcv_connect en la sede de Valencia (9) y
    // Caracas (10): `inverse_rate` del USD/EUR = bolivares por unidad.
    leerTodo(
      "res.currency.rate",
      [
        ["company_id", "in", companyIds.filter((id) => id === 9 || id === 10).slice(0, 1)],
        ["currency_id.name", "in", ["USD", "EUR"]],
      ],
      ["name", "currency_id", "inverse_rate"],
      companyIds,
      "name desc",
    ).then((r) => r.slice(0, 40)),
    leerTodo(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["payment_state", "not in", ["paid", "in_payment", "reversed"]],
      ],
      ["partner_id", "invoice_date_due", "amount_residual_signed"],
      companyIds,
    ),
    leerTodo(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "in", ["in_invoice", "in_refund"]],
        ["state", "=", "posted"],
        ["payment_state", "not in", ["paid", "in_payment", "reversed"]],
      ],
      ["partner_id", "invoice_date_due", "amount_residual_signed"],
      companyIds,
    ),
    // Bolivares registrados a tasa 1 (balance = amount_currency): Bs cargados
    // como USD. Se piden solo los de 1.000 o mas y se comparan aqui.
    conPendientes.length
      ? leerTodo(
          "account.move.line",
          [
            ["account_id", "in", conPendientes],
            ["parent_state", "=", "posted"],
            "|",
            ["balance", ">=", 1000],
            ["balance", "<=", -1000],
          ],
          ["move_name", "date", "account_id", "currency_id", "balance", "amount_currency"],
          companyIds,
        ).then((r) =>
          r.filter(
            (l: any) =>
              ES_BOLIVAR.test(nombreM2o(l.currency_id)) &&
              Math.abs((Number(l.balance) || 0) - (Number(l.amount_currency) || 0)) < 0.01,
          ),
        )
      : Promise.resolve([] as any[]),
  ]);

  // Bs por USD de hoy, para pasar a USD lo que esta en bolivares.
  const tasaHoy = Number(tasasRaw.find((r: any) => nombreM2o(r.currency_id) === "USD")?.inverse_rate) || 0;

  saldos.forEach((g: any) => {
    const cuentaId = idM2o(g.account_id) || 0;
    const c = porCuenta.get(cuentaId) || porCuenta.get(cuentaDePendiente.get(cuentaId) || 0);
    if (!c) return;
    const enBs = c.moneda !== "USD" && ES_BOLIVAR.test(nombreM2o(g.currency_id));
    const valor = enBs && tasaHoy > 0 ? (Number(g.amount_currency) || 0) / tasaHoy : Number(g.balance) || 0;
    if (porCuenta.has(cuentaId)) c.saldoBanco += valor;
    else c.pendiente += valor;
    if (enBs) c.saldoMonedaDiario = (c.saldoMonedaDiario || 0) + (Number(g.amount_currency) || 0);
  });
  porCuenta.forEach((c) => {
    c.saldoBanco = redondear(c.saldoBanco);
    c.pendiente = redondear(c.pendiente);
    c.saldo = redondear(c.saldoBanco + c.pendiente);
    if (c.saldoMonedaDiario !== null) c.saldoMonedaDiario = redondear(c.saldoMonedaDiario);
  });
  movimientosMes.forEach((g: any) => {
    const c = porCuenta.get(cuentaDeDiario.get(idM2o(g.journal_id) || 0) || 0);
    if (!c) return;
    const monto = Math.abs(Number(g.amount_company_currency_signed) || 0);
    if (g.payment_type === "inbound") c.entradasMes = redondear(c.entradasMes + monto);
    else c.salidasMes = redondear(c.salidasMes + monto);
  });
  extractos.forEach((g: any) => {
    const c = porCuenta.get(cuentaDeDiario.get(idM2o(g.journal_id) || 0) || 0);
    const ultimo = g.date ? String(g.date).slice(0, 10) : null;
    if (!c || !ultimo) return;
    if (!c.extracto.ultimo || ultimo > c.extracto.ultimo) {
      c.extracto.ultimo = ultimo;
      c.extracto.diasDesdeUltimo = diasEntre(ultimo, hoy);
    }
  });
  sinConciliar.forEach((l: any) => {
    const c = porCuenta.get(cuentaDeDiario.get(idM2o(l.journal_id) || 0) || 0);
    if (!c) return;
    c.extracto.sinConciliar += 1;
    // En la moneda del diario (Bs en los bancos en bolivares).
    c.extracto.montoSinConciliar = redondear(c.extracto.montoSinConciliar + (Number(l.amount) || 0));
    const viejo = l.date ? String(l.date).slice(0, 10) : null;
    if (viejo && (!c.extracto.sinConciliarMasViejo || viejo < c.extracto.sinConciliarMasViejo)) {
      c.extracto.sinConciliarMasViejo = viejo;
    }
  });

  const cuentas = Array.from(porCuenta.values())
    // Cuentas sin un solo movimiento (diarios creados y nunca usados) no aportan.
    .filter(
      (c) =>
        Math.abs(c.saldo) > 0.005 || Math.abs(c.saldoBanco) > 0.005 || c.entradasMes || c.salidasMes || c.extracto.ultimo,
    )
    .sort((a, b) => (a.clase === b.clase ? b.saldo - a.saldo : a.clase.localeCompare(b.clase)));

  const disponibles = cuentas.filter((c) => c.clase === "disponible");
  const suma = (lista: CuentaTesoreria[], k: "saldo" | "entradasMes" | "salidasMes") =>
    redondear(lista.reduce((s, c) => s + c[k], 0));
  const disponible = suma(disponibles, "saldo");

  // Tasas: la mas reciente y la anterior de cada moneda.
  const tasas: DatosTesoreriaAdmin["tasas"] = [];
  ["USD", "EUR"].forEach((moneda) => {
    const filas = tasasRaw.filter((r: any) => nombreM2o(r.currency_id) === moneda && Number(r.inverse_rate) > 0);
    if (filas.length === 0) return;
    const fila = (r: any) => ({ fecha: String(r.name).slice(0, 10), bsPorUnidad: redondear(Number(r.inverse_rate)) });
    tasas.push({ moneda, ...fila(filas[0]), anterior: filas[1] ? fila(filas[1]) : null });
  });

  // Flujo proyectado 4 semanas: caja disponible + lo que vence por cobrar −
  // lo que vence por pagar. Sin intercompania (se compensa dentro del grupo).
  const externos = (r: any) => !RE_INTERCOMPANIA.test(nombreM2o(r.partner_id));
  const cobros = cxcAbierta.filter(externos).map((r: any) => ({
    vence: r.invoice_date_due || "",
    monto: Number(r.amount_residual_signed) || 0,
  }));
  const pagos = cxpAbierta.filter(externos).map((r: any) => ({
    vence: r.invoice_date_due || "",
    monto: -(Number(r.amount_residual_signed) || 0),
  }));
  let saldoCorriendo = disponible;
  const semanas: SemanaFlujo[] = Array.from({ length: 4 }, (_, i) => {
    const d = sumarDias(hoy, i * 7);
    const h = sumarDias(hoy, i * 7 + 6);
    const entradas = redondear(cobros.filter((c) => c.vence >= d && c.vence <= h).reduce((s, c) => s + c.monto, 0));
    const salidas = redondear(pagos.filter((p) => p.vence >= d && p.vence <= h).reduce((s, p) => s + p.monto, 0));
    saldoCorriendo = redondear(saldoCorriendo + entradas - salidas);
    return { desde: d, hasta: h, entradas, salidas, saldoFinal: saldoCorriendo };
  });

  return {
    resumen: {
      disponible,
      disponibleBancos: suma(disponibles.filter((c) => c.tipo === "bank"), "saldo"),
      disponibleCajas: suma(disponibles.filter((c) => c.tipo === "cash"), "saldo"),
      retenciones: suma(cuentas.filter((c) => c.clase === "retencion"), "saldo"),
      puente: suma(cuentas.filter((c) => c.clase === "puente"), "saldo"),
      pendiente: redondear(disponibles.reduce((s, c) => s + c.pendiente, 0)),
      entradasMes: suma(disponibles, "entradasMes"),
      salidasMes: suma(disponibles, "salidasMes"),
      lineasSinConciliar: cuentas.reduce((s, c) => s + c.extracto.sinConciliar, 0),
      diariosSinExtractoReciente: disponibles.filter(
        (c) => c.tipo === "bank" && (c.extracto.diasDesdeUltimo === null || c.extracto.diasDesdeUltimo > DIAS_EXTRACTO_ATRASADO),
      ).length,
    },
    cuentas,
    tasas,
    bolivaresComoDolares: aTasaUno.map((l: any) => ({
      asiento: String(l.move_name || ""),
      fecha: String(l.date || "").slice(0, 10),
      cuenta: nombreM2o(l.account_id),
      monto: redondear(Number(l.balance) || 0),
    })),
    flujo: {
      saldoInicial: disponible,
      porCobrarVencido: redondear(cobros.filter((c) => c.vence && c.vence < hoy).reduce((s, c) => s + c.monto, 0)),
      porPagarVencido: redondear(pagos.filter((p) => p.vence && p.vence < hoy).reduce((s, p) => s + p.monto, 0)),
      semanas,
    },
  };
}
