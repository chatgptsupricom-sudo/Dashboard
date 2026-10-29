import {
  RE_INTERCOMPANIA,
  agrupar,
  diasEntre,
  idM2o,
  leerTodo,
  nombreM2o,
  redondear,
} from "@/lib/administracion/lectura";
import { empresaDeCompanyId } from "@/lib/administracion/empresas";

/**
 * Fiscal del rol Administracion: lo que hay que declarar y enterar cada mes.
 *
 * Venezuela (Valencia 9, Caracas 10), modulo l10n_ve_full:
 *   - Retenciones de IVA (`account.wh.iva`) y de ISLR (`account.wh.islr.doc`)
 *     que la empresa le hace a sus proveedores como agente de retencion.
 *   - Facturas de proveedor con IVA y sin comprobante de retencion.
 *   - Libros de compra y de venta (`account.fiscal.book`) del mes.
 *   - IGTF retenido por pagar (cuenta `account_credit_wh_igtf_id` de la sede) y
 *     el 3 % IGTF cobrado en las facturas del mes.
 *   - Facturas fiscales del mes y que compras son fiscales: un documento es
 *     fiscal si alguna linea lleva IVA (gravada) o el impuesto "0% EXEMPT"
 *     (exenta); sin impuesto en ninguna linea no es fiscal (notas de entrega,
 *     importaciones, intercompania). `nro_ctrl` y `sin_cred` no sirven para
 *     esto: vienen llenos / en false en todos los documentos.
 *   - Clasificacion de retenciones: IVA por porcentaje (75 / 100 %) e ISLR por
 *     concepto y tasa.
 * Panama (7): retenciones de ITBMS (`fel_pa.withholding`).
 * En las tres: IVA/ITBMS del mes (debito de ventas − credito de compras), de las
 * lineas de impuesto: `amount_tax_signed` trae el 3 % IGTF y, en Panama, resta
 * la retencion de ITBMS.
 *
 * Los montos de IVA de facturas van en USD (`balance`, moneda de la empresa).
 * Las retenciones de IVA e ISLR no traen una moneda confiable: hay lineas en
 * bolivares sobre facturas en USD, lineas ya en USD sobre facturas en VEF y
 * comprobantes que dicen USD con montos en bolivares (oct-2026). Se decide por
 * linea contra la factura con `factorAUsd()`. Panama (ITBMS) se suma por moneda.
 */

const SEDES_VE = [9, 10];
const SEDE_PA = 7;

export type EstadoDoc = "borrador" | "confirmado" | "anulado";

export interface ResumenRetenciones {
  /** Totales retenidos de los confirmados, por moneda. En Venezuela, todo en USD. */
  porMoneda: { moneda: string; monto: number; comprobantes: number }[];
  confirmados: number;
  borradores: number;
  anulados: number;
}

export interface Comprobante {
  id: number;
  tipo: "iva" | "islr" | "itbms";
  numero: string;
  proveedor: string;
  sede: string;
  fecha: string;
  estado: EstadoDoc;
  monto: number;
  moneda: string;
  diasEnBorrador: number | null;
}

export interface FacturaSinRetencion {
  id: number;
  numero: string;
  referencia: string;
  proveedor: string;
  sede: string;
  fecha: string;
  iva: number;
}

export interface LibroFiscal {
  sede: string;
  tipo: "compras" | "ventas";
  existe: boolean;
  estado: string | null;
  nombre: string | null;
  desde: string | null;
  hasta: string | null;
}

export interface ImpuestoMes {
  sede: string;
  impuesto: "IVA" | "ITBMS";
  debitoVentas: number;
  creditoCompras: number;
  neto: number;
}

/** gravada = con IVA; exenta = solo "0% EXEMPT"; sin_impuesto = no es fiscal. */
export type ClaseFiscal = "gravada" | "exenta" | "sin_impuesto";
export type TipoDocumento = "ventas" | "nc_ventas" | "compras" | "nc_compras";

export interface ConteoDocumentos {
  sede: string;
  tipo: TipoDocumento;
  total: number;
  gravadas: number;
  exentas: number;
  sinImpuesto: number;
  /** Total en USD de los documentos fiscales (gravadas + exentas). */
  montoFiscal: number;
  montoNoFiscal: number;
  iva: number;
}

export interface CompraDelMes {
  id: number;
  numero: string;
  facturaProveedor: string;
  nroControl: string;
  proveedor: string;
  sede: string;
  fecha: string;
  esNotaCredito: boolean;
  clase: ClaseFiscal;
  intercompania: boolean;
  baseGravada: number;
  baseExenta: number;
  baseSinImpuesto: number;
  iva: number;
  total: number;
  conRetencionIva: boolean;
  conRetencionIslr: boolean;
}

export interface ClaseRetencionIva {
  sede: string;
  porcentaje: number;
  comprobantes: number;
  facturas: number;
  base: number;
  iva: number;
  retenido: number;
}

export interface ClaseRetencionIslr {
  sede: string;
  concepto: string;
  tasa: number;
  comprobantes: number;
  facturas: number;
  base: number;
  retenido: number;
}

export interface DatosFiscal {
  aplicaVenezuela: boolean;
  aplicaPanama: boolean;
  impuestos: ImpuestoMes[];
  retencionesIva: ResumenRetenciones;
  retencionesIslr: ResumenRetenciones;
  retencionesItbms: ResumenRetenciones;
  comprobantesPendientes: Comprobante[];
  comprobantesDelMes: Comprobante[];
  facturasSinRetencionIva: FacturaSinRetencion[];
  libros: LibroFiscal[];
  igtf: {
    sede: string;
    causadoMes: number;
    porPagar: number;
    cuenta: string;
    /** 3 % IGTF cargado en facturas de cliente del mes. */
    facturasMes: number;
    baseMes: number;
    cobradoFacturasMes: number;
  }[];
  documentos: ConteoDocumentos[];
  compras: CompraDelMes[];
  clasesRetencionIva: ClaseRetencionIva[];
  clasesRetencionIslr: ClaseRetencionIslr[];
}

function estadoDe(raw: string): EstadoDoc {
  if (raw === "done" || raw === "confirmed" || raw === "posted") return "confirmado";
  if (raw === "cancel" || raw === "cancelled") return "anulado";
  return "borrador";
}

/**
 * Factor para pasar a USD un monto de retencion (null = no hay tasa). La moneda
 * del comprobante no sirve, asi que se compara con la factura: si el monto pasa
 * en mas de 5 % lo que la factura tiene en USD (`referenciaUsd`), esta en
 * bolivares y se convierte con la tasa de la factura si es en VEF (`tasaVef`,
 * USD por bolivar) o, si la factura es en USD, con la del BCV del dia de la
 * factura (`bsPorUsd`, la que usa l10n_ve_full al hacer la retencion).
 */
export function factorAUsd(
  monto: number,
  referenciaUsd: number,
  tasaVef: number | null,
  bsPorUsd: number | null,
): number | null {
  if (Math.abs(monto) <= Math.abs(referenciaUsd) * 1.05) return 1;
  if (tasaVef) return tasaVef;
  return bsPorUsd ? 1 / bsPorUsd : null;
}

/** Periodo de un libro sin fechas (`time_period` "this_month"...): sale del dia en que se creo. */
export function periodoDeLibro(libro: any): { desde: string; hasta: string } | null {
  if (libro.period_start && libro.period_end) return { desde: libro.period_start, hasta: libro.period_end };
  const creado = String(libro.create_date || "").slice(0, 10);
  if (!creado) return null;
  const anio = Number(creado.slice(0, 4));
  const mes = Number(creado.slice(5, 7)) - 1;
  const trimestre = Math.floor(mes / 3) * 3;
  const rango: Record<string, [number, number]> = {
    this_month: [mes, 1],
    last_month: [mes - 1, 1],
    this_quarter: [trimestre, 3],
    last_quarter: [trimestre - 3, 3],
    this_year: [0, 12],
  };
  const r = rango[libro.time_period];
  if (!r) return null;
  const fecha = (d: Date) => d.toISOString().slice(0, 10);
  return { desde: fecha(new Date(Date.UTC(anio, r[0], 1))), hasta: fecha(new Date(Date.UTC(anio, r[0] + r[1], 0))) };
}

function resumir(comprobantes: Comprobante[]): ResumenRetenciones {
  // El total es lo confirmado; los borradores solo se cuentan (pueden cambiar).
  const validos = comprobantes.filter((c) => c.estado === "confirmado");
  const porMoneda = new Map<string, { moneda: string; monto: number; comprobantes: number }>();
  validos.forEach((c) => {
    const m = porMoneda.get(c.moneda) || { moneda: c.moneda, monto: 0, comprobantes: 0 };
    m.monto = redondear(m.monto + c.monto);
    m.comprobantes++;
    porMoneda.set(c.moneda, m);
  });
  return {
    porMoneda: Array.from(porMoneda.values()).sort((a, b) => b.monto - a.monto),
    confirmados: comprobantes.filter((c) => c.estado === "confirmado").length,
    borradores: comprobantes.filter((c) => c.estado === "borrador").length,
    anulados: comprobantes.filter((c) => c.estado === "anulado").length,
  };
}

export async function fetchFiscal(
  companyIds: number[],
  hoy: string,
  desde: string,
  hasta: string,
): Promise<DatosFiscal> {
  const ve = companyIds.filter((id) => SEDES_VE.includes(id));
  const pa = companyIds.filter((id) => id === SEDE_PA);
  const vacio = Promise.resolve([] as any[]);
  const lineasImpuestoDelMes = (tipos: string[]) => [
    ["company_id", "in", companyIds],
    ["parent_state", "=", "posted"],
    ["display_type", "=", "tax"],
    ["move_id.move_type", "in", tipos],
    ["move_id.invoice_date", ">=", desde],
    ["move_id.invoice_date", "<=", hasta],
  ];

  const [
    impuestoVentas,
    impuestoCompras,
    ivaMes,
    islrMes,
    ivaPendientes,
    islrPendientes,
    itbmsMes,
    itbmsPendientes,
    sinRetencion,
    libros,
    companias,
    documentosMes,
    basesPorImpuesto,
    lineasDeImpuesto,
    impuestosOdoo,
    tasasUsd,
  ] = await Promise.all([
    // Por impuesto, para dejar fuera el IGTF y la retencion de ITBMS.
    agrupar("account.move.line", lineasImpuestoDelMes(["out_invoice", "out_refund"]), ["balance:sum"], ["company_id", "tax_line_id"], companyIds),
    agrupar("account.move.line", lineasImpuestoDelMes(["in_invoice", "in_refund"]), ["balance:sum"], ["company_id", "tax_line_id"], companyIds),
    ve.length
      ? leerTodo(
          "account.wh.iva",
          [["company_id", "in", ve], ["type", "=", "in_invoice"], ["date", ">=", desde], ["date", "<=", hasta]],
          ["name", "number", "partner_id", "company_id", "date", "state", "total_tax_ret", "currency_id", "create_date"],
          ve,
        )
      : vacio,
    ve.length
      ? leerTodo(
          "account.wh.islr.doc",
          [["company_id", "in", ve], ["type", "=", "in_invoice"], ["date_ret", ">=", desde], ["date_ret", "<=", hasta]],
          ["name", "number", "partner_id", "company_id", "date_ret", "state", "amount_total_ret", "currency_id", "create_date"],
          ve,
        )
      : vacio,
    // Borradores de cualquier fecha: uno viejo sin confirmar es justo el que
    // falta en la declaracion.
    ve.length
      ? leerTodo(
          "account.wh.iva",
          [["company_id", "in", ve], ["type", "=", "in_invoice"], ["state", "=", "draft"]],
          ["name", "number", "partner_id", "company_id", "date", "state", "total_tax_ret", "currency_id", "create_date"],
          ve,
        )
      : vacio,
    ve.length
      ? leerTodo(
          "account.wh.islr.doc",
          [["company_id", "in", ve], ["type", "=", "in_invoice"], ["state", "=", "draft"]],
          ["name", "number", "partner_id", "company_id", "date_ret", "state", "amount_total_ret", "currency_id", "create_date"],
          ve,
        )
      : vacio,
    pa.length
      ? leerTodo(
          "fel_pa.withholding",
          [["company_id", "in", pa], ["date", ">=", desde], ["date", "<=", hasta]],
          ["name", "partner_id", "company_id", "date", "state", "total_itbms_retenido", "currency_id", "create_date"],
          pa,
        )
      : vacio,
    pa.length
      ? leerTodo(
          "fel_pa.withholding",
          [["company_id", "in", pa], ["state", "=", "draft"]],
          ["name", "partner_id", "company_id", "date", "state", "total_itbms_retenido", "currency_id", "create_date"],
          pa,
        )
      : vacio,
    ve.length
      ? leerTodo(
          "account.move",
          [
            ["company_id", "in", ve],
            ["move_type", "=", "in_invoice"],
            ["state", "=", "posted"],
            ["invoice_date", ">=", desde],
            ["invoice_date", "<=", hasta],
            ["amount_tax_signed", "!=", 0],
            ["wh_iva_id", "=", false],
          ],
          ["name", "ref", "partner_id", "company_id", "invoice_date", "amount_tax_signed"],
          ve,
        )
      : vacio,
    // Los libros sin fechas ("Este mes", oct-2026 Caracas) se ubican despues por create_date.
    ve.length
      ? leerTodo(
          "account.fiscal.book",
          [
            ["company_id", "in", ve],
            ["state", "!=", "cancel"],
            "|",
            "&",
            ["period_start", "<=", hasta],
            ["period_end", ">=", desde],
            ["period_start", "=", false],
          ],
          ["name", "type", "state", "company_id", "period_start", "period_end", "time_period", "create_date"],
          ve,
        )
      : vacio,
    ve.length
      ? leerTodo("res.company", [["id", "in", ve]], ["account_credit_wh_igtf_id"], ve)
      : vacio,
    ve.length
      ? leerTodo(
          "account.move",
          [
            ["company_id", "in", ve],
            ["move_type", "in", ["out_invoice", "out_refund", "in_invoice", "in_refund"]],
            ["state", "=", "posted"],
            ["invoice_date", ">=", desde],
            ["invoice_date", "<=", hasta],
          ],
          ["name", "ref", "nro_ctrl", "partner_id", "company_id", "move_type", "invoice_date",
            "amount_total_signed", "wh_iva_id", "islr_wh_doc_id"],
          ve,
        )
      : vacio,
    // Base de cada documento por impuesto de linea (tax_ids es many2many: una
    // linea con IVA + IGTF sale en los dos grupos; el de IGTF no se usa).
    ve.length
      ? agrupar(
          "account.move.line",
          [
            ["company_id", "in", ve],
            ["parent_state", "=", "posted"],
            ["display_type", "=", "product"],
            ["move_id.move_type", "in", ["out_invoice", "out_refund", "in_invoice", "in_refund"]],
            ["move_id.invoice_date", ">=", desde],
            ["move_id.invoice_date", "<=", hasta],
          ],
          ["balance:sum"],
          ["move_id", "tax_ids"],
          ve,
        )
      : vacio,
    // Impuesto de cada documento en USD (balance = moneda de la empresa).
    ve.length
      ? agrupar(
          "account.move.line",
          [
            ["company_id", "in", ve],
            ["parent_state", "=", "posted"],
            ["display_type", "=", "tax"],
            ["move_id.move_type", "in", ["out_invoice", "out_refund", "in_invoice", "in_refund"]],
            ["move_id.invoice_date", ">=", desde],
            ["move_id.invoice_date", "<=", hasta],
          ],
          ["balance:sum", "tax_base_amount:sum"],
          ["move_id", "tax_line_id"],
          ve,
        )
      : vacio,
    leerTodo(
      "account.tax",
      [["company_id", "in", companyIds], ["active", "in", [true, false]]],
      ["name", "amount", "tax_group_id"],
      companyIds,
    ),
    // Tasa BCV (bolivares por USD) para las retenciones en bolivares de facturas en USD.
    ve.length
      ? leerTodo(
          "res.currency.rate",
          [["company_id", "in", ve.slice(0, 1)], ["currency_id.name", "=", "USD"]],
          ["name", "inverse_rate"],
          ve,
          "name asc",
        )
      : vacio,
  ]);

  // --- Retenciones: lineas para pasarlas a USD y clasificarlas ---
  const idsIva = Array.from(new Set([...ivaMes, ...ivaPendientes].map((r: any) => r.id as number)));
  const idsIslr = Array.from(new Set([...islrMes, ...islrPendientes].map((r: any) => r.id as number)));
  const [lineasIva, lineasIslr] = await Promise.all([
    idsIva.length
      ? leerTodo("account.wh.iva.line", [["retention_id", "in", idsIva]], ["retention_id", "invoice_id", "wh_iva_rate"], ve)
      : vacio,
    idsIslr.length
      ? leerTodo(
          "account.wh.islr.doc.line",
          [["islr_wh_doc_id", "in", idsIslr]],
          ["islr_wh_doc_id", "invoice_id", "concept_id", "retencion_islr", "base_amount", "amount"],
          ve,
        )
      : vacio,
  ]);
  const idsLineasIva = lineasIva.map((l: any) => l.id as number);
  const idsFacturasRet = Array.from(
    new Set([...lineasIva, ...lineasIslr].map((l: any) => idM2o(l.invoice_id)).filter((id): id is number => !!id)),
  );
  const [impuestosRetIva, facturasRet] = await Promise.all([
    idsLineasIva.length
      ? leerTodo(
          "account.wh.iva.line.tax",
          [["wh_vat_line_id", "in", idsLineasIva]],
          ["wh_vat_line_id", "base", "amount", "amount_ret"],
          ve,
        )
      : vacio,
    idsFacturasRet.length
      ? leerTodo(
          "account.move",
          [["id", "in", idsFacturasRet]],
          ["currency_id", "invoice_date", "amount_tax", "amount_tax_signed", "amount_untaxed", "amount_untaxed_signed"],
          ve,
        )
      : vacio,
  ]);
  // Tasa BCV vigente a una fecha (antes de la primera cargada, la primera).
  const bsPorUsdAl = (fecha: string): number | null => {
    let tasa: number | null = null;
    for (const r of tasasUsd) {
      const v = Number(r.inverse_rate) || 0;
      if (v <= 0) continue;
      if (String(r.name).slice(0, 10) > fecha) return tasa ?? v;
      tasa = v;
    }
    return tasa;
  };
  // Cada factura: lo que tiene en USD (contra eso se decide la moneda de la
  // retencion) y como pasar bolivares a USD.
  const facturaRet = new Map<number, { ivaUsd: number; baseUsd: number; tasaVef: number | null; bsPorUsd: number | null }>();
  facturasRet.forEach((f: any) => {
    const tax = Math.abs(Number(f.amount_tax) || 0);
    const base = Math.abs(Number(f.amount_untaxed) || 0);
    const ivaUsd = Math.abs(Number(f.amount_tax_signed) || 0);
    const baseUsd = Math.abs(Number(f.amount_untaxed_signed) || 0);
    const enVef = nombreM2o(f.currency_id, "USD") !== "USD";
    facturaRet.set(f.id, {
      ivaUsd,
      baseUsd,
      // USD por bolivar de la propia factura.
      tasaVef: enVef ? (tax ? ivaUsd / tax : base ? baseUsd / base : null) : null,
      bsPorUsd: f.invoice_date ? bsPorUsdAl(f.invoice_date) : null,
    });
  });
  const lineaIva = new Map<number, { retencion: number; factura: number | null; porcentaje: number }>();
  lineasIva.forEach((l: any) =>
    lineaIva.set(l.id, {
      retencion: idM2o(l.retention_id) || 0,
      factura: idM2o(l.invoice_id),
      porcentaje: Number(l.wh_iva_rate) || 0,
    }),
  );
  // Cada linea en la moneda en que venga (suma de sus impuestos).
  const crudoIva = new Map<number, { base: number; iva: number; retenido: number }>();
  impuestosRetIva.forEach((t: any) => {
    const lineaId = idM2o(t.wh_vat_line_id) || 0;
    const u = crudoIva.get(lineaId) || { base: 0, iva: 0, retenido: 0 };
    u.base += Number(t.base) || 0;
    u.iva += Number(t.amount) || 0;
    u.retenido += Number(t.amount_ret) || 0;
    crudoIva.set(lineaId, u);
  });
  // Por comprobante: retenido en USD (null = una linea en bolivares sin tasa).
  // Por linea: base, IVA y retenido en USD.
  const retenidoUsdIva = new Map<number, number | null>();
  const usdPorLineaIva = new Map<number, { base: number; iva: number; retenido: number }>();
  crudoIva.forEach((c, lineaId) => {
    const l = lineaIva.get(lineaId);
    if (!l) return;
    const f = l.factura ? facturaRet.get(l.factura) : undefined;
    // Factura sin IVA en USD (0): se compara la base.
    const factor = !f
      ? 1
      : f.ivaUsd
        ? factorAUsd(c.iva, f.ivaUsd, f.tasaVef, f.bsPorUsd)
        : factorAUsd(c.base, f.baseUsd, f.tasaVef, f.bsPorUsd);
    const previo = retenidoUsdIva.get(l.retencion);
    if (factor === null || previo === null) {
      retenidoUsdIva.set(l.retencion, null);
      if (factor === null) return;
    } else retenidoUsdIva.set(l.retencion, (previo || 0) + c.retenido * factor);
    usdPorLineaIva.set(lineaId, { base: c.base * factor, iva: c.iva * factor, retenido: c.retenido * factor });
  });
  // ISLR: la misma regla, contra la base sin IVA de la factura.
  const retenidoUsdIslr = new Map<number, number | null>();
  const usdPorLineaIslr = new Map<number, { base: number; retenido: number }>();
  lineasIslr.forEach((l: any) => {
    const doc = idM2o(l.islr_wh_doc_id) || 0;
    const fid = idM2o(l.invoice_id);
    const f = fid ? facturaRet.get(fid) : undefined;
    const base = Number(l.base_amount) || 0;
    const retenido = Number(l.amount) || 0;
    const factor = f ? factorAUsd(base, f.baseUsd, f.tasaVef, f.bsPorUsd) : 1;
    const previo = retenidoUsdIslr.get(doc);
    if (factor === null || previo === null) {
      retenidoUsdIslr.set(doc, null);
      if (factor === null) return;
    } else retenidoUsdIslr.set(doc, (previo || 0) + retenido * factor);
    usdPorLineaIslr.set(l.id, { base: base * factor, retenido: retenido * factor });
  });

  const comprobante = (tipo: Comprobante["tipo"], montoCampo: string, fechaCampo: string) => (r: any): Comprobante => {
    const estado = estadoDe(r.state);
    // Venezuela: si hay lineas, lo retenido pasado a USD; null = quedo una en
    // bolivares sin tasa y se muestra el monto del comprobante como VEF.
    const usd = tipo === "iva" ? retenidoUsdIva.get(r.id) : tipo === "islr" ? retenidoUsdIslr.get(r.id) : undefined;
    return {
      id: r.id,
      tipo,
      numero: r.number || r.name || "",
      proveedor: nombreM2o(r.partner_id, "Sin proveedor"),
      sede: empresaDeCompanyId(idM2o(r.company_id) || 0),
      fecha: r[fechaCampo] || "",
      estado,
      monto: redondear(Math.abs(usd ?? (Number(r[montoCampo]) || 0))),
      moneda: usd === null ? "VEF" : usd !== undefined || tipo === "islr" ? "USD" : nombreM2o(r.currency_id, "USD"),
      diasEnBorrador:
        estado === "borrador" && r.create_date ? diasEntre(String(r.create_date).slice(0, 10), hoy) : null,
    };
  };

  const ivaDelMes = ivaMes.map(comprobante("iva", "total_tax_ret", "date"));
  const islrDelMes = islrMes.map(comprobante("islr", "amount_total_ret", "date_ret"));
  const itbmsDelMes = itbmsMes.map(comprobante("itbms", "total_itbms_retenido", "date"));

  // Clase de cada impuesto: IVA/ITBMS (tasa > 0), exento (0 o negativo, como la
  // retencion de ITBMS de Panama) o IGTF.
  const claseImpuesto = new Map<number, "iva" | "exento" | "igtf">();
  impuestosOdoo.forEach((t: any) => {
    const igtf = /igtf/i.test(String(t.name)) || /igtf/i.test(nombreM2o(t.tax_group_id));
    claseImpuesto.set(t.id, igtf ? "igtf" : Number(t.amount) > 0 ? "iva" : "exento");
  });

  // IVA / ITBMS del mes por sede: debito (ventas) − credito (compras), solo con
  // los impuestos de clase "iva".
  const porSede = new Map<number, { debito: number; credito: number }>();
  const sumarImpuesto = (grupos: any[], lado: "debito" | "credito") =>
    grupos.forEach((g: any) => {
      const cid = idM2o(g.company_id) || 0;
      const fila = porSede.get(cid) || { debito: 0, credito: 0 };
      porSede.set(cid, fila);
      if (claseImpuesto.get(idM2o(g.tax_line_id) || 0) !== "iva") return;
      // balance: el IVA de ventas es credito (negativo), el de compras debito; las NC al reves.
      const balance = Number(g.balance) || 0;
      fila[lado] += lado === "debito" ? -balance : balance;
    });
  sumarImpuesto(impuestoVentas, "debito");
  sumarImpuesto(impuestoCompras, "credito");
  const impuestos: ImpuestoMes[] = companyIds
    .filter((cid) => porSede.has(cid))
    .map((cid) => {
      const f = porSede.get(cid)!;
      return {
        sede: empresaDeCompanyId(cid),
        impuesto: cid === SEDE_PA ? ("ITBMS" as const) : ("IVA" as const),
        debitoVentas: redondear(f.debito),
        creditoCompras: redondear(f.credito),
        neto: redondear(f.debito - f.credito),
      };
    });

  // Libros: uno de compras y uno de ventas por sede venezolana.
  const librosFiscales: LibroFiscal[] = [];
  const librosDelMes = libros
    .map((l: any) => ({ ...l, periodo: periodoDeLibro(l) }))
    .filter((l: any) => l.periodo && l.periodo.desde <= hasta && l.periodo.hasta >= desde);
  ve.forEach((cid) => {
    (["purchase", "sale"] as const).forEach((tipo) => {
      const delTipo = librosDelMes.filter((l: any) => idM2o(l.company_id) === cid && l.type === tipo);
      // Si hay varios (quincenas), se muestra el de estado mas atrasado.
      const libro = delTipo.sort((a: any, b: any) => (a.state === "done" ? 1 : 0) - (b.state === "done" ? 1 : 0))[0];
      librosFiscales.push({
        sede: empresaDeCompanyId(cid),
        tipo: tipo === "purchase" ? "compras" : "ventas",
        existe: !!libro,
        estado: libro ? libro.state : null,
        nombre: libro ? libro.name : null,
        desde: libro ? libro.periodo.desde : null,
        hasta: libro ? libro.periodo.hasta : null,
      });
    });
  });

  // --- Documentos del mes: fiscal o no, por los impuestos de sus lineas ---
  const porDocumento = new Map<number, { gravada: number; exenta: number; sinImpuesto: number; iva: number; igtf: number; baseIgtf: number }>();
  const delDocumento = (id: number) => {
    let d = porDocumento.get(id);
    if (!d) {
      d = { gravada: 0, exenta: 0, sinImpuesto: 0, iva: 0, igtf: 0, baseIgtf: 0 };
      porDocumento.set(id, d);
    }
    return d;
  };
  basesPorImpuesto.forEach((g: any) => {
    const id = idM2o(g.move_id);
    if (!id) return;
    const d = delDocumento(id);
    const monto = Math.abs(Number(g.balance) || 0);
    const clase = g.tax_ids ? claseImpuesto.get(idM2o(g.tax_ids) || 0) : undefined;
    if (!g.tax_ids) d.sinImpuesto += monto;
    else if (clase === "iva") d.gravada += monto;
    else if (clase === "exento") d.exenta += monto;
  });
  lineasDeImpuesto.forEach((g: any) => {
    const id = idM2o(g.move_id);
    if (!id) return;
    const d = delDocumento(id);
    const clase = claseImpuesto.get(idM2o(g.tax_line_id) || 0);
    if (clase === "iva") d.iva += Math.abs(Number(g.balance) || 0);
    else if (clase === "igtf") {
      d.igtf += Math.abs(Number(g.balance) || 0);
      d.baseIgtf += Math.abs(Number(g.tax_base_amount) || 0);
    }
  });
  const claseDe = (id: number): ClaseFiscal => {
    const d = porDocumento.get(id);
    if (d && (d.gravada > 0 || d.iva > 0)) return "gravada";
    if (d && d.exenta > 0) return "exenta";
    return "sin_impuesto";
  };
  const TIPO_DOC: Record<string, TipoDocumento> = {
    out_invoice: "ventas",
    out_refund: "nc_ventas",
    in_invoice: "compras",
    in_refund: "nc_compras",
  };
  const conteos = new Map<string, ConteoDocumentos>();
  const igtfFacturas = new Map<number, { facturas: number; base: number; cobrado: number }>();
  const compras: CompraDelMes[] = [];
  documentosMes.forEach((m: any) => {
    const cid = idM2o(m.company_id) || 0;
    const tipo = TIPO_DOC[m.move_type];
    const clave = `${cid}|${tipo}`;
    const c =
      conteos.get(clave) ||
      ({ sede: empresaDeCompanyId(cid), tipo, total: 0, gravadas: 0, exentas: 0, sinImpuesto: 0, montoFiscal: 0, montoNoFiscal: 0, iva: 0 } as ConteoDocumentos);
    const clase = claseDe(m.id);
    const total = Math.abs(Number(m.amount_total_signed) || 0);
    const d = porDocumento.get(m.id);
    c.total++;
    if (clase === "gravada") c.gravadas++;
    else if (clase === "exenta") c.exentas++;
    else c.sinImpuesto++;
    if (clase === "sin_impuesto") c.montoNoFiscal = redondear(c.montoNoFiscal + total);
    else c.montoFiscal = redondear(c.montoFiscal + total);
    c.iva = redondear(c.iva + (d?.iva || 0));
    conteos.set(clave, c);

    // El IGTF de una NC de cliente se devuelve: resta.
    if ((m.move_type === "out_invoice" || m.move_type === "out_refund") && d && d.igtf > 0) {
      const f = igtfFacturas.get(cid) || { facturas: 0, base: 0, cobrado: 0 };
      const signo = m.move_type === "out_refund" ? -1 : 1;
      if (signo > 0) f.facturas++;
      f.base += signo * d.baseIgtf;
      f.cobrado += signo * d.igtf;
      igtfFacturas.set(cid, f);
    }

    if (m.move_type === "in_invoice" || m.move_type === "in_refund") {
      const proveedor = nombreM2o(m.partner_id, "Sin proveedor");
      compras.push({
        id: m.id,
        numero: m.name || "",
        facturaProveedor: m.ref || "",
        nroControl: m.nro_ctrl || "",
        proveedor,
        sede: empresaDeCompanyId(cid),
        fecha: m.invoice_date || "",
        esNotaCredito: m.move_type === "in_refund",
        clase,
        intercompania: RE_INTERCOMPANIA.test(proveedor),
        baseGravada: redondear(d?.gravada || 0),
        baseExenta: redondear(d?.exenta || 0),
        baseSinImpuesto: redondear(d?.sinImpuesto || 0),
        iva: redondear(d?.iva || 0),
        total: redondear(total),
        conRetencionIva: !!m.wh_iva_id,
        conRetencionIslr: !!m.islr_wh_doc_id,
      });
    }
  });
  const ORDEN_TIPO: TipoDocumento[] = ["ventas", "nc_ventas", "compras", "nc_compras"];
  const documentos = Array.from(conteos.values()).sort(
    (a, b) => a.sede.localeCompare(b.sede) || ORDEN_TIPO.indexOf(a.tipo) - ORDEN_TIPO.indexOf(b.tipo),
  );
  const ORDEN_CLASE: ClaseFiscal[] = ["gravada", "exenta", "sin_impuesto"];
  compras.sort((a, b) => ORDEN_CLASE.indexOf(a.clase) - ORDEN_CLASE.indexOf(b.clase) || b.total - a.total);

  // --- Clasificacion de retenciones del mes (sin anuladas) ---
  const validasIva = new Map<number, number>(); // retencion -> company
  ivaMes.forEach((r: any) => {
    if (estadoDe(r.state) !== "anulado") validasIva.set(r.id, idM2o(r.company_id) || 0);
  });
  const clasesIva = new Map<string, ClaseRetencionIva & { _comp: Set<number>; _fact: Set<number> }>();
  usdPorLineaIva.forEach((u, lineaId) => {
    const l = lineaIva.get(lineaId)!;
    const cid = validasIva.get(l.retencion);
    if (cid === undefined) return;
    const clave = `${cid}|${l.porcentaje}`;
    const c =
      clasesIva.get(clave) ||
      { sede: empresaDeCompanyId(cid), porcentaje: l.porcentaje, comprobantes: 0, facturas: 0, base: 0, iva: 0, retenido: 0, _comp: new Set<number>(), _fact: new Set<number>() };
    c._comp.add(l.retencion);
    if (l.factura) c._fact.add(l.factura);
    c.base += u.base;
    c.iva += u.iva;
    c.retenido += u.retenido;
    clasesIva.set(clave, c);
  });
  const clasesRetencionIva: ClaseRetencionIva[] = Array.from(clasesIva.values())
    .map(({ _comp, _fact, ...c }) => ({
      ...c,
      comprobantes: _comp.size,
      facturas: _fact.size,
      base: redondear(c.base),
      iva: redondear(c.iva),
      retenido: redondear(c.retenido),
    }))
    .sort((a, b) => a.sede.localeCompare(b.sede) || b.porcentaje - a.porcentaje);

  const validasIslr = new Map<number, number>();
  islrMes.forEach((r: any) => {
    if (estadoDe(r.state) !== "anulado") validasIslr.set(r.id, idM2o(r.company_id) || 0);
  });
  const clasesIslr = new Map<string, ClaseRetencionIslr & { _comp: Set<number>; _fact: Set<number> }>();
  lineasIslr.forEach((l: any) => {
    const doc = idM2o(l.islr_wh_doc_id) || 0;
    const cid = validasIslr.get(doc);
    const usd = usdPorLineaIslr.get(l.id);
    if (cid === undefined || !usd) return;
    const concepto = nombreM2o(l.concept_id, "Sin concepto");
    const tasa = Number(l.retencion_islr) || 0;
    const clave = `${cid}|${concepto}|${tasa}`;
    const c =
      clasesIslr.get(clave) ||
      { sede: empresaDeCompanyId(cid), concepto, tasa, comprobantes: 0, facturas: 0, base: 0, retenido: 0, _comp: new Set<number>(), _fact: new Set<number>() };
    c._comp.add(doc);
    const factura = idM2o(l.invoice_id);
    if (factura) c._fact.add(factura);
    c.base += usd.base;
    c.retenido += usd.retenido;
    clasesIslr.set(clave, c);
  });
  const clasesRetencionIslr: ClaseRetencionIslr[] = Array.from(clasesIslr.values())
    .map(({ _comp, _fact, ...c }) => ({
      ...c,
      comprobantes: _comp.size,
      facturas: _fact.size,
      base: redondear(c.base),
      retenido: redondear(c.retenido),
    }))
    .sort((a, b) => a.sede.localeCompare(b.sede) || b.retenido - a.retenido);

  // IGTF retenido: lo causado en el mes (creditos) y el saldo por enterar.
  const cuentasIgtf = companias
    .map((c: any) => ({ cid: c.id as number, cuentaId: idM2o(c.account_credit_wh_igtf_id), cuenta: nombreM2o(c.account_credit_wh_igtf_id) }))
    .filter((c) => c.cuentaId);
  const igtf: DatosFiscal["igtf"] = [];
  if (cuentasIgtf.length) {
    const ids = cuentasIgtf.map((c) => c.cuentaId!);
    const [saldo, mes] = await Promise.all([
      agrupar(
        "account.move.line",
        [["account_id", "in", ids], ["parent_state", "=", "posted"], ["date", "<=", hasta]],
        ["balance:sum"],
        ["account_id"],
        ve,
      ),
      agrupar(
        "account.move.line",
        [["account_id", "in", ids], ["parent_state", "=", "posted"], ["date", ">=", desde], ["date", "<=", hasta]],
        ["credit:sum"],
        ["account_id"],
        ve,
      ),
    ]);
    cuentasIgtf.forEach((c) => {
      const s = saldo.find((g: any) => idM2o(g.account_id) === c.cuentaId);
      const m = mes.find((g: any) => idM2o(g.account_id) === c.cuentaId);
      igtf.push({
        sede: empresaDeCompanyId(c.cid),
        cuenta: c.cuenta,
        causadoMes: redondear(Number(m?.credit) || 0),
        // Cuenta de pasivo: saldo acreedor (negativo) = lo que falta enterar.
        porPagar: redondear(-(Number(s?.balance) || 0)),
        facturasMes: igtfFacturas.get(c.cid)?.facturas || 0,
        baseMes: redondear(igtfFacturas.get(c.cid)?.base || 0),
        cobradoFacturasMes: redondear(igtfFacturas.get(c.cid)?.cobrado || 0),
      });
    });
  }

  const pendientes = [
    ...ivaPendientes.map(comprobante("iva", "total_tax_ret", "date")),
    ...islrPendientes.map(comprobante("islr", "amount_total_ret", "date_ret")),
    ...itbmsPendientes.map(comprobante("itbms", "total_itbms_retenido", "date")),
  ].sort((a, b) => (b.diasEnBorrador ?? 0) - (a.diasEnBorrador ?? 0));

  return {
    aplicaVenezuela: ve.length > 0,
    aplicaPanama: pa.length > 0,
    impuestos,
    retencionesIva: resumir(ivaDelMes),
    retencionesIslr: resumir(islrDelMes),
    retencionesItbms: resumir(itbmsDelMes),
    comprobantesPendientes: pendientes,
    comprobantesDelMes: [...ivaDelMes, ...islrDelMes, ...itbmsDelMes].sort((a, b) => b.fecha.localeCompare(a.fecha)),
    facturasSinRetencionIva: sinRetencion
      .map((f: any) => ({
        id: f.id,
        numero: f.name || "",
        referencia: f.ref || "",
        proveedor: nombreM2o(f.partner_id, "Sin proveedor"),
        sede: empresaDeCompanyId(idM2o(f.company_id) || 0),
        fecha: f.invoice_date || "",
        iva: redondear(Math.abs(Number(f.amount_tax_signed) || 0)),
      }))
      .sort((a: FacturaSinRetencion, b: FacturaSinRetencion) => b.iva - a.iva),
    libros: librosFiscales,
    igtf,
    documentos,
    compras,
    clasesRetencionIva,
    clasesRetencionIslr,
  };
}
