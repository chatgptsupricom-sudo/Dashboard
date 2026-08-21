import { callOdooRPC } from "@/lib/odoo";

/**
 * Fuentes de datos de las 3 areas financieras del Indice de Salud Administrativa.
 *
 * Se reutilizan las mismas fuentes que ya usa el resto del panel para que los
 * numeros coincidan entre secciones:
 *   - Cuentas por cobrar -> `digiflex.cxc.report` (igual que /api/superadmin/cuentas-por-cobrar)
 *   - Cuentas por pagar  -> `account.move` (igual que el Stoplight de cuentas-pagar)
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
  fechaPago: string | null;
}

export interface DatosCxP {
  facturas: FacturaCxP[];
  totalCxP: number;
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
  const filas = await rpcPaginado(
    "digiflex.cxc.report",
    [
      ["company_id", "in", companyIds],
      ["amount_residual", ">", 0],
    ],
    [
      "amount_residual",
      "amount_current",
      "amount_1_30",
      "amount_31_60",
      "amount_61_90",
      "amount_91_plus",
      "days_overdue",
      "partner_name",
    ],
  );

  const abs = (v: any) => Math.abs(Number(v) || 0);
  const sum = (k: string) => filas.reduce((s, r) => s + abs(r[k]), 0);

  const b1_30 = sum("amount_1_30");
  const b31_60 = sum("amount_31_60");
  const b61_90 = sum("amount_61_90");
  const b91mas = sum("amount_91_plus");

  const porCliente: Record<string, { monto: number; dias: number }> = {};
  filas.forEach((r) => {
    const nombre = r.partner_name || "Sin nombre";
    if (!porCliente[nombre]) porCliente[nombre] = { monto: 0, dias: 0 };
    porCliente[nombre].monto += abs(r.amount_residual);
    porCliente[nombre].dias = Math.max(
      porCliente[nombre].dias,
      Number(r.days_overdue) || 0,
    );
  });

  const clientesVencidos = Object.values(porCliente).filter(
    (c) => c.dias > 0,
  ).length;

  return {
    totalCartera: sum("amount_residual"),
    corriente: sum("amount_current"),
    vencido: b1_30 + b31_60 + b61_90 + b91mas,
    b1_30,
    b31_60,
    b61_90,
    b91mas,
    clientes: Object.keys(porCliente).length,
    clientesVencidos,
    topDeudores: Object.entries(porCliente)
      .map(([cliente, v]) => ({
        cliente,
        monto: Math.round(v.monto * 100) / 100,
        diasVencido: v.dias,
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
  const facturasRaw = await rpcPaginado(
    "account.move",
    [
      ["company_id", "in", companyIds],
      ["move_type", "=", "in_invoice"],
      ["state", "=", "posted"],
    ],
    [
      "invoice_date_due",
      "invoice_date",
      "invoice_payment_term_id",
      "amount_total",
      "amount_residual",
      "payment_state",
      "partner_id",
      "name",
    ],
  );
  const sinCondicionPorId: Record<number, boolean> = {};
  facturasRaw.forEach((f: any) => {
    sinCondicionPorId[f.id] = !f.invoice_payment_term_id;
  });

  // Para puntualidad solo interesan las que vencieron dentro del periodo.
  const delPeriodo = facturasRaw.filter(
    (f: any) =>
      f.invoice_date_due && f.invoice_date_due >= desde && f.invoice_date_due <= hasta,
  );
  const fechasPago = await fetchFechasDePago(delPeriodo.map((f: any) => f.id));

  const mapear = (f: any): FacturaCxP => {
    const residual = Math.abs(Number(f.amount_residual) || 0);
    return {
      id: f.id,
      proveedor: f.partner_id?.[1] || "Sin proveedor",
      fechaVencimiento: f.invoice_date_due || "",
      montoTotal: Math.abs(Number(f.amount_total) || 0),
      residual,
      pagada: f.payment_state === "paid" || residual <= 0.01,
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

  return {
    facturas,
    totalCxP: pendientes.reduce((s, f) => s + f.residual, 0),
    saldoVencido: vencidas.reduce((s, f) => s + f.residual, 0),
    vencidas,
    proximas30,
    montoProximas30: proximas30.reduce((s, f) => s + f.residual, 0),
    pendientesSinCondicion: sinCondicion.length,
    pendientesTotal: pendientes.length,
    montoSinCondicion: sinCondicion.reduce((s, f) => s + f.residual, 0),
  };
}

// ─────────────────────────────────────────────── Tesoreria

const RE_RETENCION = /retenid|retenci/i;

export async function fetchTesoreria(
  companyIds: number[],
): Promise<DatosTesoreria> {
  const diarios =
    (await callOdooRPC<any[]>(
      "account.journal",
      "search_read",
      [
        [
          ["type", "in", ["bank", "cash"]],
          ["company_id", "in", companyIds],
        ],
      ],
      { fields: ["name", "default_account_id"], limit: 0 },
    )) || [];

  // Varios diarios apuntan a la MISMA cuenta contable (ej. "Banesco Panama" y
  // "Regions Bank"). Sumar por diario duplicaria el saldo — hasta 3.7x en
  // Panama —, asi que se deduplica por cuenta.
  const cuentaInfo: Record<number, { nombre: string; retencion: boolean }> = {};
  diarios.forEach((j: any) => {
    const accId = j.default_account_id?.[0];
    if (!accId) return;
    const nombre = typeof j.name === "string" ? j.name : String(j.name ?? "");
    const esRet = RE_RETENCION.test(nombre);
    if (!cuentaInfo[accId]) {
      cuentaInfo[accId] = { nombre, retencion: esRet };
    } else if (!esRet) {
      // Se prefiere el nombre del diario "real" sobre el de retencion.
      cuentaInfo[accId].nombre = nombre;
      cuentaInfo[accId].retencion = false;
    }
  });

  const accountIds = Object.keys(cuentaInfo).map(Number);
  if (accountIds.length === 0) {
    return {
      disponible: 0,
      porCuenta: [],
      retenciones: 0,
      conciliadas: 0,
      totalExtractos: 0,
      ultimaConciliacion: null,
    };
  }

  const saldos =
    (await callOdooRPC<any[]>(
      "account.move.line",
      "read_group",
      [
        [
          ["account_id", "in", accountIds],
          ["parent_state", "=", "posted"],
        ],
        ["balance:sum"],
        ["account_id"],
      ],
      {},
    )) || [];

  let disponible = 0;
  let retenciones = 0;
  const porCuenta: { nombre: string; saldo: number }[] = [];
  saldos.forEach((g: any) => {
    const accId = g.account_id?.[0];
    const info = cuentaInfo[accId];
    if (!info) return;
    const saldo = Math.round((Number(g.balance) || 0) * 100) / 100;
    if (info.retencion) {
      retenciones += saldo;
    } else {
      disponible += saldo;
      if (Math.abs(saldo) > 0.01) porCuenta.push({ nombre: info.nombre, saldo });
    }
  });

  // La conciliacion se consulta aparte y de forma tolerante: en esta base
  // account.bank.statement.line no tiene company_id almacenado, asi que si el
  // filtro falla se degrada a "sin datos" en lugar de tumbar todo el endpoint.
  let conciliadas = 0;
  let totalExtractos = 0;
  let ultimaConciliacion: string | null = null;
  const inicioAnio = `${new Date().getFullYear()}-01-01`;
  try {
    const base: any[] = [
      ["date", ">=", inicioAnio],
      ["company_id", "in", companyIds],
    ];
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
        [[["company_id", "in", companyIds]]],
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
