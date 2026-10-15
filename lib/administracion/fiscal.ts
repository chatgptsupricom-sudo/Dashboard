import {
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
 *   - IGTF retenido por pagar (cuenta `account_credit_wh_igtf_id` de la sede).
 * Panama (7): retenciones de ITBMS (`fel_pa.withholding`).
 * En las tres: IVA/ITBMS del mes (debito de ventas − credito de compras).
 *
 * Los montos de IVA de facturas van en USD (`amount_tax_signed`, moneda de la
 * empresa); los comprobantes de retencion van en su propia moneda (la mayoria
 * USD, algunos en VEF): se suman por moneda, nunca mezclados.
 */

const SEDES_VE = [9, 10];
const SEDE_PA = 7;

export type EstadoDoc = "borrador" | "confirmado" | "anulado";

export interface ResumenRetenciones {
  /** Totales retenidos (sin anulados), por moneda. */
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
  igtf: { sede: string; causadoMes: number; porPagar: number; cuenta: string }[];
}

function estadoDe(raw: string): EstadoDoc {
  if (raw === "done" || raw === "confirmed" || raw === "posted") return "confirmado";
  if (raw === "cancel" || raw === "cancelled") return "anulado";
  return "borrador";
}

function resumir(comprobantes: Comprobante[]): ResumenRetenciones {
  const validos = comprobantes.filter((c) => c.estado !== "anulado");
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

  const [
    impuestosRaw,
    ivaMes,
    islrMes,
    ivaPendientes,
    islrPendientes,
    itbmsMes,
    itbmsPendientes,
    sinRetencion,
    libros,
    companias,
  ] = await Promise.all([
    agrupar(
      "account.move",
      [
        ["company_id", "in", companyIds],
        ["move_type", "in", ["out_invoice", "out_refund", "in_invoice", "in_refund"]],
        ["state", "=", "posted"],
        ["invoice_date", ">=", desde],
        ["invoice_date", "<=", hasta],
      ],
      ["amount_tax_signed:sum"],
      ["company_id", "move_type"],
      companyIds,
    ),
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
    ve.length
      ? leerTodo(
          "account.fiscal.book",
          [["company_id", "in", ve], ["period_start", "<=", hasta], ["period_end", ">=", desde]],
          ["name", "type", "state", "company_id", "period_start", "period_end"],
          ve,
        )
      : vacio,
    ve.length
      ? leerTodo("res.company", [["id", "in", ve]], ["account_credit_wh_igtf_id"], ve)
      : vacio,
  ]);

  const comprobante = (tipo: Comprobante["tipo"], montoCampo: string, fechaCampo: string) => (r: any): Comprobante => {
    const estado = estadoDe(r.state);
    return {
      id: r.id,
      tipo,
      numero: r.number || r.name || "",
      proveedor: nombreM2o(r.partner_id, "Sin proveedor"),
      sede: empresaDeCompanyId(idM2o(r.company_id) || 0),
      fecha: r[fechaCampo] || "",
      estado,
      monto: redondear(Math.abs(Number(r[montoCampo]) || 0)),
      moneda: nombreM2o(r.currency_id, "USD"),
      diasEnBorrador:
        estado === "borrador" && r.create_date ? diasEntre(String(r.create_date).slice(0, 10), hoy) : null,
    };
  };

  const ivaDelMes = ivaMes.map(comprobante("iva", "total_tax_ret", "date"));
  const islrDelMes = islrMes.map(comprobante("islr", "amount_total_ret", "date_ret"));
  const itbmsDelMes = itbmsMes.map(comprobante("itbms", "total_itbms_retenido", "date"));

  // IVA / ITBMS del mes por sede: debito (ventas) − credito (compras).
  const porSede = new Map<number, { debito: number; credito: number }>();
  impuestosRaw.forEach((g: any) => {
    const cid = idM2o(g.company_id) || 0;
    const fila = porSede.get(cid) || { debito: 0, credito: 0 };
    const monto = Number(g.amount_tax_signed) || 0;
    // amount_tax_signed: positivo en ventas, negativo en compras (y al reves en NC).
    if (g.move_type === "out_invoice" || g.move_type === "out_refund") fila.debito += monto;
    else fila.credito += -monto;
    porSede.set(cid, fila);
  });
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
  ve.forEach((cid) => {
    (["purchase", "sale"] as const).forEach((tipo) => {
      const delTipo = libros.filter((l: any) => idM2o(l.company_id) === cid && l.type === tipo);
      // Si hay varios (quincenas), se muestra el de estado mas atrasado.
      const libro = delTipo.sort((a: any, b: any) => (a.state === "done" ? 1 : 0) - (b.state === "done" ? 1 : 0))[0];
      librosFiscales.push({
        sede: empresaDeCompanyId(cid),
        tipo: tipo === "purchase" ? "compras" : "ventas",
        existe: !!libro,
        estado: libro ? libro.state : null,
        nombre: libro ? libro.name : null,
        desde: libro ? libro.period_start : null,
        hasta: libro ? libro.period_end : null,
      });
    });
  });

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
  };
}
