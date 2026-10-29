import {
  agrupar,
  contar,
  idM2o,
  leerTodo,
  nombreM2o,
  redondear,
  sumarDias,
} from "@/lib/administracion/lectura";
import { empresaDeCompanyId } from "@/lib/administracion/empresas";
import { mesAnterior, rangoDelMes } from "@/lib/administracion/gastos";
import { CORTE_ODOO } from "@/lib/smartbit";
import { periodoDeLibro } from "@/lib/administracion/fiscal";
import { cuentasPendientesDeBancos } from "@/lib/administracion/tesoreria";

/**
 * Contabilidad y cierre del rol Administracion.
 *
 * Estado de resultados y balance salen de `account.move.line` publicados,
 * agrupados por cuenta y clasificados por `account_type` de Odoo, en USD.
 * No reemplazan a los reportes de Odoo (Contabilidad > Informes): son una
 * vista rapida por sede y mes que se puede cruzar con el resto del panel.
 *
 * Antes de `CORTE_ODOO` (2026-04-01) Odoo solo tiene los asientos de
 * migracion: el acumulado del año arranca en el corte.
 *
 * Con "todas las sedes" se suman las tres empresas tal cual: las ventas entre
 * sedes (Valencia le vende a Caracas) no se eliminan, asi que no es un
 * consolidado.
 */

/** Grupo 8 y 999: diferencial cambiario y perdidas por diferencia de efectivo. */
const CODIGO_OTROS = /^(8|999)/;

export type GrupoResultado =
  | "ingresos"
  | "costo_venta"
  | "gastos_operativos"
  | "depreciacion"
  | "otros_ingresos"
  | "otros_egresos";

export const ORDEN_RESULTADO: { grupo: GrupoResultado; titulo: string; signo: 1 | -1 }[] = [
  { grupo: "ingresos", titulo: "Ingresos por ventas", signo: 1 },
  { grupo: "costo_venta", titulo: "Costo de venta", signo: -1 },
  { grupo: "gastos_operativos", titulo: "Gastos operativos", signo: -1 },
  { grupo: "depreciacion", titulo: "Depreciación", signo: -1 },
  { grupo: "otros_ingresos", titulo: "Otros ingresos", signo: 1 },
  { grupo: "otros_egresos", titulo: "Otros egresos (diferencial cambiario y otros)", signo: -1 },
];

const TIPOS_RESULTADO = ["income", "income_other", "expense", "expense_direct_cost", "expense_depreciation"];

function grupoDe(tipo: string, codigo: string): GrupoResultado | null {
  if (tipo === "income") return "ingresos";
  if (tipo === "income_other") return "otros_ingresos";
  if (tipo === "expense_direct_cost") return "costo_venta";
  if (tipo === "expense_depreciation") return "depreciacion";
  if (tipo === "expense") return CODIGO_OTROS.test(codigo) ? "otros_egresos" : "gastos_operativos";
  return null;
}

export interface CuentaResultado {
  codigo: string;
  nombre: string;
  mes: number;
  mesAnterior: number;
  acumulado: number;
}

export interface LineaResultado {
  grupo: GrupoResultado;
  titulo: string;
  /** Montos positivos = lo que el grupo aporta o resta segun `signo`. */
  mes: number;
  mesAnterior: number;
  acumulado: number;
  cuentas: CuentaResultado[];
}

export interface EstadoResultados {
  periodos: { mes: string; mesAnterior: string; acumuladoDesde: string; hasta: string };
  lineas: LineaResultado[];
  utilidadBruta: { mes: number; mesAnterior: number; acumulado: number };
  utilidadOperativa: { mes: number; mesAnterior: number; acumulado: number };
  utilidadNeta: { mes: number; mesAnterior: number; acumulado: number };
  margenBrutoMes: number | null;
  avisos: string[];
}

export interface GrupoBalance {
  clave: string;
  titulo: string;
  monto: number;
}

export interface BalanceGeneral {
  fecha: string;
  activo: GrupoBalance[];
  pasivo: GrupoBalance[];
  patrimonio: GrupoBalance[];
  totalActivo: number;
  totalPasivo: number;
  totalPatrimonio: number;
  /** Activo − (pasivo + patrimonio). Debe ser 0: si no, hay algo raro en los datos. */
  descuadre: number;
}

export type EstadoCheck = "ok" | "pendiente" | "no_aplica";

export interface CheckCierre {
  id: string;
  titulo: string;
  estado: EstadoCheck;
  detalle: string;
  cantidad: number | null;
  enlace: string | null;
}

export interface DatosContabilidad {
  resultados: EstadoResultados;
  balance: BalanceGeneral;
  cierre: CheckCierre[];
}

const TITULO_BALANCE: Record<string, { lado: "activo" | "pasivo" | "patrimonio"; titulo: string }> = {
  asset_cash: { lado: "activo", titulo: "Bancos y cajas" },
  asset_receivable: { lado: "activo", titulo: "Cuentas por cobrar" },
  asset_current: { lado: "activo", titulo: "Activo circulante (inventario, anticipos, otros)" },
  asset_prepayments: { lado: "activo", titulo: "Gastos pagados por anticipado" },
  asset_non_current: { lado: "activo", titulo: "Activo no circulante" },
  asset_fixed: { lado: "activo", titulo: "Activo fijo" },
  liability_payable: { lado: "pasivo", titulo: "Cuentas por pagar" },
  liability_credit_card: { lado: "pasivo", titulo: "Tarjetas de crédito" },
  liability_current: { lado: "pasivo", titulo: "Pasivo circulante (impuestos, retenciones, otros)" },
  liability_non_current: { lado: "pasivo", titulo: "Pasivo a largo plazo" },
  equity: { lado: "patrimonio", titulo: "Capital y reservas" },
  equity_unaffected: { lado: "patrimonio", titulo: "Resultados no asignados" },
};

async function resultadosPorCuenta(companyIds: number[], desde: string, hasta: string) {
  if (desde > hasta) return new Map<number, number>();
  const filas = await agrupar(
    "account.move.line",
    [
      ["company_id", "in", companyIds],
      ["parent_state", "=", "posted"],
      ["date", ">=", desde],
      ["date", "<=", hasta],
      ["account_id.account_type", "in", TIPOS_RESULTADO],
    ],
    ["balance:sum"],
    ["account_id"],
    companyIds,
  );
  const out = new Map<number, number>();
  filas.forEach((g: any) => out.set(idM2o(g.account_id) || 0, Number(g.balance) || 0));
  return out;
}

export async function fetchContabilidad(
  companyIds: number[],
  hoy: string,
  mes: string,
  desde: string,
  hasta: string,
): Promise<DatosContabilidad> {
  const mesPrev = mesAnterior(mes, 1);
  const rangoPrev = rangoDelMes(mesPrev);
  const inicioAnio = `${mes.slice(0, 4)}-01-01`;
  const acumuladoDesde = inicioAnio < CORTE_ODOO ? CORTE_ODOO : inicioAnio;

  const [rMes, rPrev, rAcum, balanceRaw, cierre] = await Promise.all([
    resultadosPorCuenta(companyIds, desde, hasta),
    resultadosPorCuenta(companyIds, rangoPrev.desde, rangoPrev.hasta),
    resultadosPorCuenta(companyIds, acumuladoDesde, hasta),
    agrupar(
      "account.move.line",
      [
        ["company_id", "in", companyIds],
        ["parent_state", "=", "posted"],
        ["date", "<=", hasta],
      ],
      ["balance:sum"],
      ["account_id"],
      companyIds,
    ),
    fetchCierre(companyIds, hoy, desde, hasta),
  ]);

  // Tipo y codigo de cada cuenta tocada (read_group solo trae [id, "codigo nombre"]).
  const idsCuentas = Array.from(
    new Set([...rMes.keys(), ...rPrev.keys(), ...rAcum.keys(), ...balanceRaw.map((g: any) => idM2o(g.account_id) || 0)]),
  ).filter(Boolean);
  const cuentas = idsCuentas.length
    ? await leerTodo("account.account", [["id", "in", idsCuentas]], ["code", "name", "account_type"], companyIds)
    : [];
  const infoCuenta = new Map<number, { codigo: string; nombre: string; tipo: string }>();
  cuentas.forEach((c: any) =>
    infoCuenta.set(c.id, {
      codigo: String(c.code || ""),
      nombre: typeof c.name === "string" ? c.name : String(c.name ?? ""),
      tipo: c.account_type,
    }),
  );

  // ── Estado de resultados
  const lineas = new Map<GrupoResultado, LineaResultado>();
  ORDEN_RESULTADO.forEach((o) =>
    lineas.set(o.grupo, { grupo: o.grupo, titulo: o.titulo, mes: 0, mesAnterior: 0, acumulado: 0, cuentas: [] }),
  );
  const signoDe = (g: GrupoResultado) => ORDEN_RESULTADO.find((o) => o.grupo === g)!.signo;
  idsCuentas.forEach((id) => {
    const info = infoCuenta.get(id);
    if (!info) return;
    const grupo = grupoDe(info.tipo, info.codigo);
    if (!grupo) return;
    // Ingresos tienen saldo acreedor (balance negativo): se invierte para que
    // ingresos y egresos se lean en positivo.
    const s = signoDe(grupo) === 1 ? -1 : 1;
    const fila: CuentaResultado = {
      codigo: info.codigo,
      nombre: info.nombre,
      mes: redondear(s * (rMes.get(id) || 0)),
      mesAnterior: redondear(s * (rPrev.get(id) || 0)),
      acumulado: redondear(s * (rAcum.get(id) || 0)),
    };
    if (!fila.mes && !fila.mesAnterior && !fila.acumulado) return;
    const linea = lineas.get(grupo)!;
    linea.cuentas.push(fila);
    linea.mes += fila.mes;
    linea.mesAnterior += fila.mesAnterior;
    linea.acumulado += fila.acumulado;
  });
  const listaLineas = ORDEN_RESULTADO.map((o) => {
    const l = lineas.get(o.grupo)!;
    return {
      ...l,
      mes: redondear(l.mes),
      mesAnterior: redondear(l.mesAnterior),
      acumulado: redondear(l.acumulado),
      cuentas: l.cuentas.sort((a, b) => Math.abs(b.mes) - Math.abs(a.mes) || Math.abs(b.acumulado) - Math.abs(a.acumulado)),
    };
  });
  const v = (g: GrupoResultado, k: "mes" | "mesAnterior" | "acumulado") => listaLineas.find((l) => l.grupo === g)![k];
  const calc = (k: "mes" | "mesAnterior" | "acumulado") => {
    const bruta = v("ingresos", k) - v("costo_venta", k);
    const operativa = bruta - v("gastos_operativos", k) - v("depreciacion", k);
    const neta = operativa + v("otros_ingresos", k) - v("otros_egresos", k);
    return { bruta: redondear(bruta), operativa: redondear(operativa), neta: redondear(neta) };
  };
  const cMes = calc("mes");
  const cPrev = calc("mesAnterior");
  const cAcum = calc("acumulado");

  const avisos: string[] = [];
  if (v("costo_venta", "mes") < 0) {
    avisos.push(
      "El costo de venta del mes es negativo: hay asientos de inventario que abonan la cuenta de costo por más de lo que se le carga. Suele ser una cuenta de entrada/salida de inventario configurada como costo de venta en Odoo; hay que revisarlo en Contabilidad antes de leer el margen.",
    );
  }
  if (desde < CORTE_ODOO) {
    avisos.push("Antes del 01/04/2026 Odoo solo tiene los asientos de migración de Smartbit: ese mes no es un resultado real.");
  }
  if (companyIds.length > 1) {
    avisos.push("Con todas las sedes se suman las tres empresas sin eliminar las ventas entre ellas: no es un consolidado.");
  }

  // ── Balance general
  const porTipo = new Map<string, number>();
  let resultadoEjercicio = 0;
  balanceRaw.forEach((g: any) => {
    const info = infoCuenta.get(idM2o(g.account_id) || 0);
    if (!info) return;
    const saldo = Number(g.balance) || 0;
    if (TIPOS_RESULTADO.includes(info.tipo)) {
      resultadoEjercicio += saldo;
      return;
    }
    porTipo.set(info.tipo, (porTipo.get(info.tipo) || 0) + saldo);
  });
  const lado = (l: "activo" | "pasivo" | "patrimonio") =>
    Object.entries(TITULO_BALANCE)
      .filter(([, t]) => t.lado === l)
      .map(([clave, t]) => ({
        clave,
        titulo: t.titulo,
        // Activo con saldo deudor (+); pasivo y patrimonio con saldo acreedor (−).
        monto: redondear((l === "activo" ? 1 : -1) * (porTipo.get(clave) || 0)),
      }))
      .filter((g) => Math.abs(g.monto) > 0.005);
  const activo = lado("activo");
  const pasivo = lado("pasivo");
  const patrimonio = [
    ...lado("patrimonio"),
    // Resultados (ingresos − egresos) acumulados que Odoo todavia no cerro a patrimonio.
    { clave: "resultado", titulo: "Resultado acumulado no cerrado", monto: redondear(-resultadoEjercicio) },
  ];
  // Tipos no previstos (off_balance, etc.) se reportan en el descuadre.
  const total = (lista: GrupoBalance[]) => redondear(lista.reduce((s, g) => s + g.monto, 0));
  const totalActivo = total(activo);
  const totalPasivo = total(pasivo);
  const totalPatrimonio = total(patrimonio);

  return {
    resultados: {
      periodos: { mes, mesAnterior: mesPrev, acumuladoDesde, hasta },
      lineas: listaLineas,
      utilidadBruta: { mes: cMes.bruta, mesAnterior: cPrev.bruta, acumulado: cAcum.bruta },
      utilidadOperativa: { mes: cMes.operativa, mesAnterior: cPrev.operativa, acumulado: cAcum.operativa },
      utilidadNeta: { mes: cMes.neta, mesAnterior: cPrev.neta, acumulado: cAcum.neta },
      margenBrutoMes: v("ingresos", "mes") > 0 ? Math.round((cMes.bruta / v("ingresos", "mes")) * 1000) / 10 : null,
      avisos,
    },
    balance: {
      fecha: hasta,
      activo,
      pasivo,
      patrimonio,
      totalActivo,
      totalPasivo,
      totalPatrimonio,
      descuadre: redondear(totalActivo - totalPasivo - totalPatrimonio),
    },
    cierre,
  };
}

/**
 * Checklist de cierre del mes, calculado desde Odoo. Cada punto es algo que
 * tiene que estar en cero (o hecho) para dar el mes por cerrado.
 */
async function fetchCierre(companyIds: number[], hoy: string, desde: string, hasta: string): Promise<CheckCierre[]> {
  const ve = companyIds.filter((id) => id === 9 || id === 10);
  const mesCerrado = hasta < hoy;
  // Un borrador sin fecha de factura (invoice_date vacio) se ubica por `date`.
  const hastaElCierre = ["|", ["invoice_date", "<=", hasta], "&", ["invoice_date", "=", false], ["date", "<=", hasta]];

  const [
    borradoresMes,
    facturasClienteBorrador,
    facturasProveedorBorrador,
    sinConciliar,
    retIvaBorrador,
    retIslrBorrador,
    libros,
    tasas,
    puentes,
    companias,
  ] = await Promise.all([
    agrupar(
      "account.move",
      [["company_id", "in", companyIds], ["state", "=", "draft"], ["date", ">=", desde], ["date", "<=", hasta]],
      ["amount_total_signed:sum"],
      ["move_type"],
      companyIds,
    ),
    contar("account.move", [["company_id", "in", companyIds], ["state", "=", "draft"], ["move_type", "in", ["out_invoice", "out_refund"]], ...hastaElCierre], companyIds),
    contar("account.move", [["company_id", "in", companyIds], ["state", "=", "draft"], ["move_type", "in", ["in_invoice", "in_refund"]], ...hastaElCierre], companyIds),
    contar(
      "account.bank.statement.line",
      [["company_id", "in", companyIds], ["state", "=", "posted"], ["is_reconciled", "=", false], ["date", "<=", hasta]],
      companyIds,
    ),
    ve.length ? contar("account.wh.iva", [["company_id", "in", ve], ["state", "=", "draft"], ["date", "<=", hasta]], ve) : Promise.resolve(0),
    ve.length ? contar("account.wh.islr.doc", [["company_id", "in", ve], ["state", "=", "draft"], ["date_ret", "<=", hasta]], ve) : Promise.resolve(0),
    ve.length
      ? leerTodo(
          "account.fiscal.book",
          [["company_id", "in", ve], ["state", "!=", "cancel"], "|", ["period_start", "=", false], "&", ["period_start", "<=", hasta], ["period_end", ">=", desde]],
          ["type", "company_id", "state", "period_start", "period_end", "time_period", "create_date"],
          ve,
        ).then((r) =>
          r.filter((l: any) => {
            const p = periodoDeLibro(l);
            return p && p.desde <= hasta && p.hasta >= desde;
          }),
        )
      : Promise.resolve([] as any[]),
    ve.length
      ? leerTodo(
          "res.currency.rate",
          [["company_id", "in", ve.slice(0, 1)], ["currency_id.name", "=", "USD"], ["name", ">=", sumarDias(hasta < hoy ? hasta : hoy, -3)], ["name", "<=", hasta]],
          ["name"],
          ve,
        )
      : Promise.resolve([] as any[]),
    // Cuentas puente: los "Recibos/Pagos Pendientes" de cada banco (cobros y
    // pagos registrados sin conciliar), sus transitorias de extracto y los
    // depositos por identificar deben quedar en cero. Se toman de los diarios,
    // no por nombre: por nombre entraba una cuenta de gastos ("Transitoria
    // Diferencial Cambiario") y quedaba fuera "Venezuela Transitora".
    Promise.all([
      leerTodo(
        "account.journal",
        [["type", "in", ["bank", "cash"]], ["company_id", "in", companyIds]],
        ["default_account_id", "suspense_account_id"],
        companyIds,
      ).then((diarios) => cuentasPendientesDeBancos(diarios, companyIds)),
      leerTodo(
        "account.account",
        [["company_id", "in", companyIds], ["name", "ilike", "identificar"], ["account_type", "not in", TIPOS_RESULTADO]],
        ["id"],
        companyIds,
      ),
    ]).then(([{ cuentaDePendiente, transitorias }, porIdentificar]) => [
      ...Array.from(cuentaDePendiente.keys()),
      ...transitorias,
      ...porIdentificar.map((a: any) => a.id as number),
    ]),
    leerTodo("res.company", [["id", "in", companyIds]], ["name", "period_lock_date", "fiscalyear_lock_date"], companyIds),
  ]);

  let saldosPuente: any[] = [];
  if (puentes.length) {
    saldosPuente = await agrupar(
      "account.move.line",
      [["account_id", "in", puentes], ["parent_state", "=", "posted"], ["date", "<=", hasta]],
      ["balance:sum"],
      ["account_id"],
      companyIds,
    );
  }
  const puentesConSaldo = saldosPuente
    .filter((g: any) => Math.abs(Number(g.balance) || 0) > 1)
    .sort((a: any, b: any) => Math.abs(Number(b.balance) || 0) - Math.abs(Number(a.balance) || 0));

  const totalBorradores = borradoresMes.reduce((s: number, g: any) => s + (Number(g.__count) || 0), 0);
  const detalleBorradores = borradoresMes
    .map((g: any) => `${g.__count} ${ETIQUETA_MOVE[g.move_type] || g.move_type}`)
    .join(", ");

  const checks: CheckCierre[] = [
    {
      id: "borradores_mes",
      titulo: "Sin asientos en borrador con fecha del mes",
      estado: totalBorradores === 0 ? "ok" : "pendiente",
      cantidad: totalBorradores,
      detalle: totalBorradores === 0 ? "Todo lo del mes está publicado." : `En borrador: ${detalleBorradores}.`,
      enlace: null,
    },
    {
      id: "facturas_cliente_borrador",
      titulo: "Facturas de cliente publicadas",
      estado: facturasClienteBorrador === 0 ? "ok" : "pendiente",
      cantidad: facturasClienteBorrador,
      detalle:
        facturasClienteBorrador === 0
          ? "No hay facturas ni notas de crédito de cliente en borrador hasta el cierre."
          : `${facturasClienteBorrador} facturas o NC de cliente en borrador con fecha hasta el cierre.`,
      enlace: null,
    },
    {
      id: "facturas_proveedor_borrador",
      titulo: "Facturas de proveedor publicadas",
      estado: facturasProveedorBorrador === 0 ? "ok" : "pendiente",
      cantidad: facturasProveedorBorrador,
      detalle:
        facturasProveedorBorrador === 0
          ? "No hay facturas de proveedor en borrador hasta el cierre."
          : `${facturasProveedorBorrador} facturas o NC de proveedor en borrador.`,
      enlace: "/administracion/cuentas-por-pagar",
    },
    {
      id: "conciliacion",
      titulo: "Extractos bancarios conciliados",
      estado: sinConciliar === 0 ? "ok" : "pendiente",
      cantidad: sinConciliar,
      detalle:
        sinConciliar === 0
          ? "No quedan líneas de extracto sin conciliar hasta el cierre (ojo: solo cuenta los extractos que se cargaron)."
          : `${sinConciliar} líneas de extracto sin conciliar con fecha hasta el cierre.`,
      enlace: "/administracion/tesoreria",
    },
    {
      id: "cuentas_puente",
      titulo: "Cobros y pagos conciliados con el banco",
      estado: puentesConSaldo.length === 0 ? "ok" : "pendiente",
      cantidad: puentesConSaldo.length,
      // Cada banco tiene su "Transitoria": ahi quedan los cobros y pagos
      // registrados en Odoo que todavia no se casaron con el extracto.
      detalle:
        puentesConSaldo.length === 0
          ? "Recibos/pagos pendientes, transitorias y depósitos por identificar en cero: todo lo registrado está conciliado."
          : `Cobros/pagos registrados que no se han conciliado con el banco. ${puentesConSaldo
              .slice(0, 5)
              .map((g: any) => `${nombreM2o(g.account_id)}: $${redondear(Number(g.balance) || 0).toLocaleString("en-US")}`)
              .join(" · ")}${puentesConSaldo.length > 5 ? ` y ${puentesConSaldo.length - 5} más` : ""}.`,
      enlace: null,
    },
  ];

  if (ve.length) {
    const retPendientes = (retIvaBorrador as number) + (retIslrBorrador as number);
    checks.push({
      id: "retenciones",
      titulo: "Retenciones de IVA e ISLR confirmadas",
      estado: retPendientes === 0 ? "ok" : "pendiente",
      cantidad: retPendientes,
      detalle:
        retPendientes === 0
          ? "No hay comprobantes de retención en borrador."
          : `${retIvaBorrador} de IVA y ${retIslrBorrador} de ISLR en borrador.`,
      enlace: "/administracion/fiscal",
    });
    const faltan: string[] = [];
    const abiertos: string[] = [];
    ve.forEach((cid) => {
      ["purchase", "sale"].forEach((tipo) => {
        const nombre = `${tipo === "purchase" ? "compras" : "ventas"} ${empresaDeCompanyId(cid)}`;
        const delTipo = (libros as any[]).filter((l) => idM2o(l.company_id) === cid && l.type === tipo);
        if (delTipo.length === 0) faltan.push(nombre);
        else if (delTipo.some((l) => l.state !== "done")) abiertos.push(nombre);
      });
    });
    checks.push({
      id: "libros",
      titulo: "Libros de compra y venta cerrados",
      estado: faltan.length + abiertos.length === 0 ? "ok" : "pendiente",
      cantidad: faltan.length + abiertos.length,
      detalle:
        faltan.length + abiertos.length === 0
          ? "Los libros del mes existen y están cerrados en Odoo."
          : [
              faltan.length ? `Falta el libro de ${faltan.join(", ")}.` : "",
              abiertos.length ? `Sin cerrar: ${abiertos.join(", ")}.` : "",
            ]
              .filter(Boolean)
              .join(" "),
      enlace: "/administracion/fiscal",
    });
    checks.push({
      id: "tasa_bcv",
      titulo: "Tasa BCV cargada al cierre",
      estado: (tasas as any[]).length > 0 ? "ok" : "pendiente",
      cantidad: null,
      detalle:
        (tasas as any[]).length > 0
          ? `Última tasa del período: ${String((tasas as any[]).map((t) => t.name).sort().pop()).slice(0, 10)}.`
          : "No hay tasa del USD cargada en los últimos días del período.",
      enlace: "/administracion/tesoreria",
    });
  }

  // Vale la mayor de las dos fechas de bloqueo.
  const bloqueo = (c: any) => [c.period_lock_date, c.fiscalyear_lock_date].filter(Boolean).sort().pop() || "";
  const sinBloquear = (companias as any[]).filter((c) => bloqueo(c) < hasta);
  checks.push({
    id: "bloqueo",
    titulo: "Período bloqueado en Odoo",
    estado: !mesCerrado ? "no_aplica" : sinBloquear.length === 0 ? "ok" : "pendiente",
    cantidad: null,
    detalle: !mesCerrado
      ? "El mes todavía no termina."
      : sinBloquear.length === 0
        ? "La fecha de bloqueo de todas las sedes cubre el mes: ya nadie puede cambiar asientos de este período."
        : `Sin bloquear hasta el ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}: ${sinBloquear
            .map((c) => empresaDeCompanyId(c.id) || c.name)
            .join(", ")}. Se bloquea en Contabilidad > Configuración > Fechas de bloqueo.`,
    enlace: null,
  });

  return checks;
}

const ETIQUETA_MOVE: Record<string, string> = {
  entry: "asientos",
  out_invoice: "facturas de cliente",
  out_refund: "NC de cliente",
  in_invoice: "facturas de proveedor",
  in_refund: "NC de proveedor",
  out_receipt: "recibos de venta",
  in_receipt: "recibos de compra",
};
