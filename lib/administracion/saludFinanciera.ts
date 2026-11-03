import { callOdooRPC } from "@/lib/odoo";
import { esIntercompania } from "@/lib/administracion/intercompania";
import { sumarPagosSinAplicar } from "@/lib/administracion/cxp";
import { fetchTesoreriaAdmin } from "@/lib/administracion/tesoreria";

/**
 * Fuentes de datos de las 3 areas financieras del Indice de Salud Administrativa.
 *
 * Se reutilizan las mismas fuentes que ya usa el resto del panel para que los
 * numeros coincidan entre secciones:
 *   - Cuentas por cobrar -> `digiflex.cxc.report` (igual que /api/superadmin/cuentas-por-cobrar)
 *   - Cuentas por pagar  -> `account.move` (igual que el Stoplight de cuentas-pagar)
 *
 * CxC y CxP dejan fuera a las otras empresas del grupo (`esIntercompania`):
 * esas deudas se compensan dentro del grupo, no son cobros ni pagos de caja,
 * y con ellas el indice leia como vencido/por pagar casi todo el saldo de
 * Caracas y Valencia.
 */

export interface AgingCxC {
  totalCartera: number;
  corriente: number;
  vencido: number;
  b1_30: number;
  b31_60: number;
  b61_90: number;
  b91mas: number;
  clientes: number;
  clientesVencidos: number;
  topDeudores: { cliente: string; monto: number; diasVencido: number }[];
}

export interface FacturaCxP {
  id: number;
  proveedor: string;
  fechaVencimiento: string;
  montoTotal: number;
  residual: number;
  pagada: boolean;
  /** payment_state de Odoo: solo paid/in_payment es "pagada" para puntualidad
   *  (una parcial puede tener como ultima conciliacion una retencion). */
  estadoPago: string;
  fechaPago: string | null;
}

export interface DatosCxP {
  facturas: FacturaCxP[];
  /** Facturas menos NC pendientes (base de la antiguedad y del % vencido). */
  totalCxP: number;
  /** Pagos/anticipos a proveedores sin aplicar a una factura (ver fetchCxPAdmin). */
  pagosSinAplicar: number;
  /** Lo que de verdad se debe: totalCxP − pagosSinAplicar. */
  deudaNeta: number;
  saldoVencido: number;
  vencidas: FacturaCxP[];
  proximas30: FacturaCxP[];
  montoProximas30: number;
  /** Facturas pendientes sin condiciones de pago cargadas. Odoo les asigna
   *  vencimiento = fecha de factura, con lo que nacen "vencidas" y distorsionan
   *  al alza los indicadores de vencimiento y cobertura. Se expone para poder
   *  advertirlo en la UI en vez de dejar que se lea como pago tardio. */
  pendientesSinCondicion: number;
  pendientesTotal: number;
  montoSinCondicion: number;
}

export interface DatosTesoreria {
  disponible: number;
  porCuenta: { nombre: string; saldo: number }[];
  retenciones: number;
  conciliadas: number;
  totalExtractos: number;
  ultimaConciliacion: string | null;
}

async function rpcPaginado(
  model: string,
  domain: any[],
  fields: string[],
): Promise<any[]> {
  let out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], {
      fields,
      order: "id asc",
      limit: 2000,
      offset,
    });
    if (!page || page.length === 0) break;
    out = out.concat(page);
    if (page.length < 2000) break;
    offset += 2000;
  }
  return out;
}

// ─────────────────────────────────────────────── Cuentas por cobrar

export async function fetchCxC(companyIds: number[]): Promise<AgingCxC> {
  // Sin intercompania: el Dashboard de CxC ya saca "supricom" del nombre; aqui
  // se usa el criterio completo (tambien "Office Solutions Center").
  // Tambien las filas negativas (anticipos, pagos sin aplicar, NC): antes solo
  // se leia amount_residual > 0 y la cartera salia bruta (oct-2026 Caracas:
  // -$192 mil de saldos a favor fuera de $1,55 M).
  const filas = (await rpcPaginado(
    "digiflex.cxc.report",
    [
      ["company_id", "in", companyIds],
      ["amount_residual", "!=", 0],
    ],
    [
      "amount_residual",
      "amount_current",
      "amount_1_30",
      "amount_31_60",
      "amount_61_90",
      "amount_91_plus",
      "days_overdue",
      "partner_id",
      "partner_name",
      "company_id",
    ],
  )).filter((r) => !esIntercompania(r.partner_name));

  // Neto por cliente (y sede): lo que tiene a favor se aplica primero a su
  // deuda mas vieja, como lo aplicaria Cobranza; un cliente con saldo neto a
  // favor no suma a la cartera. Las filas de la vista ya vienen por empresa
  // (commercial partner) salvo contadas excepciones.
  const BANDAS_VIEJO_A_NUEVO = [
    "amount_91_plus",
    "amount_61_90",
    "amount_31_60",
    "amount_1_30",
    "amount_current",
  ] as const;
  type Bandas = Record<(typeof BANDAS_VIEJO_A_NUEVO)[number], number>;
  const porCliente = new Map<
    string,
    { nombre: string; bandas: Bandas; aFavor: number; dias: number }
  >();
  filas.forEach((r) => {
    const clave = `${r.company_id?.[0] ?? ""}:${r.partner_id?.[0] ?? r.partner_name}`;
    let c = porCliente.get(clave);
    if (!c) {
      c = {
        nombre: r.partner_name || "Sin nombre",
        bandas: { amount_91_plus: 0, amount_61_90: 0, amount_31_60: 0, amount_1_30: 0, amount_current: 0 },
        aFavor: 0,
        dias: 0,
      };
      porCliente.set(clave, c);
    }
    if (Number(r.amount_residual) < 0) {
      c.aFavor += -Number(r.amount_residual);
      return;
    }
    BANDAS_VIEJO_A_NUEVO.forEach((b) => (c!.bandas[b] += Math.max(0, Number(r[b]) || 0)));
    c.dias = Math.max(c.dias, Number(r.days_overdue) || 0);
  });

  const clientes = Array.from(porCliente.values()).map((c) => {
    let resto = c.aFavor;
    const b = { ...c.bandas };
    BANDAS_VIEJO_A_NUEVO.forEach((k) => {
      const aplicado = Math.min(resto, b[k]);
      b[k] -= aplicado;
      resto -= aplicado;
    });
    const vencido = b.amount_1_30 + b.amount_31_60 + b.amount_61_90 + b.amount_91_plus;
    return {
      nombre: c.nombre,
      b,
      monto: vencido + b.amount_current,
      dias: vencido > 0.01 ? c.dias : 0,
    };
  }).filter((c) => c.monto > 0.01);

  const sum = (k: keyof Bandas) => clientes.reduce((s, c) => s + c.b[k], 0);
  const b1_30 = sum("amount_1_30");
  const b31_60 = sum("amount_31_60");
  const b61_90 = sum("amount_61_90");
  const b91mas = sum("amount_91_plus");
  const corriente = sum("amount_current");

  return {
    totalCartera: b1_30 + b31_60 + b61_90 + b91mas + corriente,
    corriente,
    vencido: b1_30 + b31_60 + b61_90 + b91mas,
    b1_30,
    b31_60,
    b61_90,
    b91mas,
    clientes: clientes.length,
    clientesVencidos: clientes.filter((c) => c.dias > 0).length,
    topDeudores: clientes
      .map((c) => ({
        cliente: c.nombre,
        monto: Math.round(c.monto * 100) / 100,
        diasVencido: c.dias,
      }))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 20),
  };
}

// ─────────────────────────────────────────────── Cuentas por pagar

/**
 * Fecha real de pago de cada factura, derivada de las conciliaciones sobre sus
 * lineas por pagar. El vinculo directo pago<->factura de Odoo
 * (account_move_account_payment_rel) esta vacio en esta base, asi que se usa
 * account.partial.reconcile, que si tiene la fecha.
 *
 * Sin esto, "pagos a tiempo" contaria como puntual cualquier factura pagada
 * aunque se hubiera pagado con meses de retraso.
 */
async function fetchFechasDePago(
  moveIds: number[],
): Promise<Record<number, string>> {
  if (moveIds.length === 0) return {};

  const lineas = await rpcPaginado(
    "account.move.line",
    [
      ["move_id", "in", moveIds],
      ["account_id.account_type", "=", "liability_payable"],
    ],
    ["id", "move_id"],
  );
  if (lineas.length === 0) return {};

  const lineaAMove: Record<number, number> = {};
  lineas.forEach((l: any) => {
    lineaAMove[l.id] = l.move_id?.[0];
  });
  const lineIds = lineas.map((l: any) => l.id);

  const conciliaciones = await rpcPaginado(
    "account.partial.reconcile",
    [
      "|",
      ["credit_move_id", "in", lineIds],
      ["debit_move_id", "in", lineIds],
    ],
    ["max_date", "credit_move_id", "debit_move_id"],
  );

  const fechaPorMove: Record<number, string> = {};
  conciliaciones.forEach((c: any) => {
    const fecha = c.max_date;
    if (!fecha) return;
    [c.credit_move_id?.[0], c.debit_move_id?.[0]].forEach((lineId) => {
      const moveId = lineId ? lineaAMove[lineId] : undefined;
      if (!moveId) return;
      // La ultima conciliacion es la que cancela la factura.
      if (!fechaPorMove[moveId] || fecha > fechaPorMove[moveId]) {
        fechaPorMove[moveId] = fecha;
      }
    });
  });
  return fechaPorMove;
}

export async function fetchCxP(
  companyIds: number[],
  desde: string,
  hasta: string,
  hoy: string,
  hasta30: string,
): Promise<DatosCxP> {
  // Sin limite inferior de fecha: las obligaciones vencidas viejas son
  // justamente las que importan y quedarian fuera si se acotara al mes.
  // Sin proveedores intercompania (Caracas le compra a SUPRICOM USA y a
  // Valencia, Valencia a SUPRICOM LLC): oct-2026 eran $3,68 M de los $3,69 M que debia Caracas y
  // $3,69 M de los $4,38 M de Valencia, y hacian ver vencida/sin cobertura
  // una deuda que se compensa dentro del grupo. Mismo criterio que el modulo
  // de Cuentas por Pagar. Las NC de proveedor (in_refund) restan, igual que en
  // ese modulo (oct-2026 Caracas: $11.724 aqui contra $2.361 alla).
  const [facturasTodas, pagosSinAplicar] = await Promise.all([rpcPaginado(
    "account.move",
    [
      ["company_id", "in", companyIds],
      ["move_type", "in", ["in_invoice", "in_refund"]],
      ["state", "=", "posted"],
    ],
    [
      "move_type",
      "invoice_date_due",
      "invoice_date",
      "invoice_payment_term_id",
      // Los *_signed van en la moneda de la empresa (USD). amount_total /
      // amount_residual van en la de la factura: Caracas tiene facturas de
      // proveedor en bolivares y se sumaban como dolares (oct-2026: 2,86 M
      // "de mas" en CxP por 23 facturas que en verdad son 3.780 $).
      "amount_total_signed",
      "amount_residual_signed",
      "payment_state",
      "partner_id",
      "name",
    ],
  ), sumarPagosSinAplicar(companyIds, true)]);
  const facturasRaw = facturasTodas.filter((f: any) => !esIntercompania(f.partner_id?.[1]));
  const sinCondicionPorId: Record<number, boolean> = {};
  facturasRaw.forEach((f: any) => {
    sinCondicionPorId[f.id] = !f.invoice_payment_term_id;
  });

  // Para puntualidad solo interesan las facturas que vencieron dentro del periodo.
  const delPeriodo = facturasRaw.filter(
    (f: any) =>
      f.move_type === "in_invoice" &&
      f.invoice_date_due && f.invoice_date_due >= desde && f.invoice_date_due <= hasta,
  );
  const fechasPago = await fetchFechasDePago(delPeriodo.map((f: any) => f.id));

  const mapear = (f: any): FacturaCxP => {
    // in_invoice: residual_signed negativo (se debe); in_refund: positivo, resta.
    const residual = -(Number(f.amount_residual_signed) || 0);
    return {
      id: f.id,
      proveedor: f.partner_id?.[1] || "Sin proveedor",
      fechaVencimiento: f.invoice_date_due || "",
      montoTotal: Math.abs(Number(f.amount_total_signed) || 0),
      residual,
      pagada: f.payment_state === "paid" || Math.abs(residual) <= 0.01,
      estadoPago: f.payment_state || "",
      fechaPago: fechasPago[f.id] || null,
    };
  };

  const facturas = delPeriodo.map(mapear);
  const todas = facturasRaw.map(mapear);

  const pendientes = todas.filter((f) => !f.pagada);
  const vencidas = pendientes.filter(
    (f) => f.fechaVencimiento && f.fechaVencimiento < hoy,
  );
  const proximas30 = pendientes.filter(
    (f) =>
      f.fechaVencimiento &&
      f.fechaVencimiento >= hoy &&
      f.fechaVencimiento <= hasta30,
  );

  const sinCondicion = pendientes.filter((f) => sinCondicionPorId[f.id]);
  const totalCxP = pendientes.reduce((s, f) => s + f.residual, 0);

  return {
    facturas,
    totalCxP,
    pagosSinAplicar,
    deudaNeta: Math.round((totalCxP - pagosSinAplicar) * 100) / 100,
    saldoVencido: vencidas.reduce((s, f) => s + f.residual, 0),
    vencidas,
    proximas30,
    montoProximas30: proximas30.reduce((s, f) => s + f.residual, 0),
    pendientesSinCondicion: sinCondicion.length,
    pendientesTotal: pendientes.length,
    montoSinCondicion: sinCondicion.reduce((s, f) => s + f.residual, 0),
  };
}

/**
 * KPI "facturas pendientes de procesar" (CxP).
 *
 * OJO con lo que este indicador NO mide. El diseño original pedía "facturas
 * que pasaron del plazo interno / total recibidas", contando desde que la
 * factura se RECIBE. Se verificó contra 800 facturas reales de producción que
 * Odoo no guarda esa fecha en ninguna parte: `date_document`,
 * `invoice_source_email` y `delivery_date` vienen vacíos en el 100% de los
 * casos, y como ninguna factura entra por alias de correo, `create_date`
 * tampoco sirve de proxy de recepción — es cuándo alguien la tipeó.
 *
 * Se descartó a propósito medirlo como "fecha de la factura → fecha de carga":
 * ese lapso incluye lo que tardó el PROVEEDOR en hacernos llegar la factura,
 * que Administración no controla, y daría ~45% contra una meta de ≤5% (rojo
 * permanente por algo ajeno). Mismo criterio por el que se descartó
 * "documentos sin soporte" en cumplimientoControl.ts.
 *
 * Lo que sí se mide, que es honesto y accionable: facturas que YA entraron al
 * sistema y siguen en borrador pasado el plazo interno. El reloj arranca en un
 * dato confiable (cuándo entró a Odoo) y solo mide nuestro proceso. Su límite:
 * una factura que nadie cargó nunca sigue siendo invisible — eso solo lo tapa
 * que Administración empiece a registrar la recepción.
 */
export interface DatosFacturasSinProcesar {
  /** Facturas de proveedor que entraron al sistema durante el periodo. */
  recibidasEnPeriodo: number;
  /** Las que siguen en borrador pasado el plazo, sin importar de cuando sean. */
  sinProcesar: number;
  montoSinProcesar: number;
  /** Dias de la mas vieja que sigue sin procesar, para dimensionar el atraso. */
  antiguedadMaximaDias: number | null;
}

export async function fetchFacturasSinProcesar(
  companyIds: number[],
  desde: string,
  hasta: string,
  plazoDias: number,
): Promise<DatosFacturasSinProcesar> {
  // Aqui SI cuentan las facturas intercompania: cargarlas a tiempo tambien es
  // trabajo de Administracion, aunque su saldo no entre en fetchCxP.
  const [borradores, recibidas] = await Promise.all([
    // Sin limite inferior de fecha, igual que las obligaciones vencidas en
    // fetchCxP: un borrador de hace cinco meses es justamente el que importa y
    // desapareceria del indicador si se acotara al mes en curso.
    rpcPaginado(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "=", "in_invoice"],
        ["state", "=", "draft"],
      ],
      // En moneda de la empresa: hay borradores en bolivares (Caracas).
      ["create_date", "amount_total_signed"],
    ),
    rpcPaginado(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "=", "in_invoice"],
        ["state", "!=", "cancel"],
        ["create_date", ">=", `${desde} 00:00:00`],
        ["create_date", "<=", `${hasta} 23:59:59`],
      ],
      ["id"],
    ),
  ]);

  const hoyMs = Date.now();
  const edadDias = (f: any) =>
    (hoyMs - new Date(f.create_date.replace(" ", "T") + "Z").getTime()) / 86400000;

  const vencidos = borradores.filter((f: any) => edadDias(f) > plazoDias);

  return {
    recibidasEnPeriodo: recibidas.length,
    sinProcesar: vencidos.length,
    montoSinProcesar:
      Math.round(
        vencidos.reduce((s: number, f: any) => s + Math.abs(Number(f.amount_total_signed) || 0), 0) * 100,
      ) / 100,
    antiguedadMaximaDias:
      vencidos.length > 0
        ? Math.round(Math.max(...vencidos.map(edadDias)))
        : null,
  };
}

// ─────────────────────────────────────────────── Tesoreria

export async function fetchTesoreria(
  companyIds: number[],
  hoy: string,
  desde: string,
  hasta: string,
): Promise<DatosTesoreria> {
  // Disponible, cuentas y retenciones = los de la pantalla de Tesoreria
  // (lib/administracion/tesoreria.ts). Antes solo se sacaban los diarios con
  // "retenid/retenci" en el nombre y sumaban al disponible la cuenta de
  // ingresos "DESCUENTO" de Panama (-$82.790) y las transitorias de Caracas.
  const tes = await fetchTesoreriaAdmin(companyIds, hoy, desde, hasta);
  const disponible = tes.resumen.disponible;
  const retenciones = tes.resumen.retenciones;
  const porCuenta = tes.cuentas
    .filter((c) => c.clase === "disponible" && Math.abs(c.saldo) > 0.01)
    .map((c) => ({ nombre: c.nombre, saldo: c.saldo }));

  // La conciliacion se consulta aparte y de forma tolerante: en esta base
  // account.bank.statement.line no tiene company_id almacenado, asi que si el
  // filtro falla se degrada a "sin datos" en lugar de tumbar todo el endpoint.
  let conciliadas = 0;
  let totalExtractos = 0;
  let ultimaConciliacion: string | null = null;
  const inicioAnio = `${hoy.slice(0, 4)}-01-01`;
  try {
    // Solo publicadas: la linea de extracto hereda el estado de su asiento y
    // las anuladas contaban como "sin conciliar" (Panama 2026: 376 anuladas).
    const publicadas: any[] = [
      ["company_id", "in", companyIds],
      ["state", "=", "posted"],
    ];
    const base: any[] = [["date", ">=", inicioAnio], ...publicadas];
    totalExtractos =
      (await callOdooRPC<number>(
        "account.bank.statement.line",
        "search_count",
        [base],
        {},
      )) || 0;
    conciliadas =
      (await callOdooRPC<number>(
        "account.bank.statement.line",
        "search_count",
        [[...base, ["is_reconciled", "=", true]]],
        {},
      )) || 0;
    const ultima =
      (await callOdooRPC<any[]>(
        "account.bank.statement.line",
        "search_read",
        [publicadas],
        { fields: ["date"], limit: 1, order: "date desc" },
      )) || [];
    ultimaConciliacion = ultima[0]?.date || null;
  } catch {
    conciliadas = 0;
    totalExtractos = 0;
  }

  return {
    disponible: Math.round(disponible * 100) / 100,
    porCuenta: porCuenta.sort((a, b) => b.saldo - a.saldo),
    retenciones: Math.round(retenciones * 100) / 100,
    conciliadas,
    totalExtractos,
    ultimaConciliacion,
  };
}
