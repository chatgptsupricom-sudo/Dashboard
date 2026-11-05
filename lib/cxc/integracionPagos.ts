import { esImpuesto } from "@/lib/cxc/impuestos";
import { callOdooRPCEstricto } from "@/lib/odoo";

/**
 * "Integración de Pagos": el mismo reporte que en Odoo es Contabilidad >
 * Reportes > Integración de Pagos (acción 1183, vista
 * `lista.conciliaciones.personalizada`, de Rangel), que es el que usa CxC.
 * Mismo modelo (`account.partial.reconcile`), mismo dominio (toda conciliación
 * contra una factura o nota de crédito de cliente: pagos de banco/caja,
 * retenciones, el 25 % de IVA y notas de crédito aplicadas) y mismos campos
 * relacionados de Studio (`x_*`), así cada fila y el total son los de Odoo.
 *
 * Lo sirven tres endpoints (superadmin/CxC, gerente de operaciones y sus
 * reportes). Fechas: "aplicacion" = `x_fecha_registro_pago_dia` (cuando se
 * creó el pago, hora de Caracas; la "Fecha Aplicación" de Odoo) o "pago" =
 * fecha contable del asiento del pago (la "Fecha Pago" de Odoo).
 *
 * Ojo: no es el "cobrado" de Contado/Crédito (lib/cxc/cobros.ts), que solo
 * cuenta banco/caja; este suma además retenciones y notas de crédito.
 *
 * Parámetros: page, limit, search, vendedor (nombre), fechaInicio, fechaFin
 * (default: mes en curso) y fecha (aplicacion | pago).
 */

export interface FilaIntegracion {
  id: number;
  sede: number;
  pago: string;
  tipo_documento: string;
  rif: string;
  cliente: string;
  factura: string;
  fecha_factura: string;
  importe: number;
  vendedor: string;
  fecha_aplicacion: string;
  fecha_pago: string;
  termino_pago: string;
  descripcion: string;
  fecha_vencimiento: string;
  diario: string;
}

const PAGINA = 5000;
const TIPO_DOCUMENTO: Record<string, string> = {
  out_invoice: "Factura de cliente",
  out_refund: "Nota de crédito de cliente",
};
const CAMPOS = [
  "company_id",
  "amount",
  "x_pago",
  "x_tipo_documento",
  "x_rif",
  "x_cliente",
  "x_factura",
  "x_fecha_factura",
  "x_vendedor",
  "x_fecha_registro_pago_dia",
  "x_fecha_pago",
  "x_termino_pago",
  "x_descripcion",
  "x_fecha_vencimiento",
  "x_diario_pago",
];

const texto = (v: unknown) => (v ? String(v) : "");
// x_descripcion es la descripción del pago en HTML.
const sinHtml = (v: unknown) =>
  texto(v)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

async function leerConciliaciones(companyIds: number[], dominio: any[]): Promise<any[]> {
  const filas: any[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const r = await callOdooRPCEstricto<any[]>("account.partial.reconcile", "search_read", [dominio], {
      fields: CAMPOS,
      limit: PAGINA,
      offset,
      order: "id desc",
      context: { allowed_company_ids: companyIds },
    });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió account.partial.reconcile");
    filas.push(...r);
    if (r.length < PAGINA) return filas;
  }
}

export async function respuestaIntegracionPagos(
  companyIds: number[],
  searchParams: URLSearchParams,
  /** Sedes para el selector de la pantalla (default: las consultadas). */
  sedesSelector: number[] = companyIds,
) {
  const page = Math.max(1, parseInt(searchParams.get("page") || "1") || 1);
  const limit = Math.max(1, parseInt(searchParams.get("limit") || "25") || 25);
  const search = (searchParams.get("search") || "").toLowerCase().trim();
  const vendedor = searchParams.get("vendedor") || "";
  const porFechaPago = searchParams.get("fecha") === "pago";

  const hoy = new Date();
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const desde = (searchParams.get("fechaInicio") || "").split("T")[0] || inicioMes.toISOString().split("T")[0];
  const hasta = (searchParams.get("fechaFin") || "").split("T")[0] || hoy.toISOString().split("T")[0];
  const campoFecha = porFechaPago ? "credit_move_id.move_id.date" : "x_fecha_registro_pago_dia";

  const [companies, crudas] = await Promise.all([
    callOdooRPCEstricto<any[]>("res.company", "search_read", [[["id", "in", sedesSelector]]], { fields: ["id", "name"] }),
    leerConciliaciones(companyIds, [
      // El dominio de la acción 1183 de Odoo, más el rango de fechas.
      ["company_id", "in", companyIds],
      ["debit_move_id.move_id.move_type", "in", ["out_invoice", "out_refund"]],
      [campoFecha, ">=", desde],
      [campoFecha, "<=", hasta],
    ]),
  ]);

  const todas: FilaIntegracion[] = crudas.map((c) => ({
    id: c.id,
    sede: Array.isArray(c.company_id) ? c.company_id[0] : 0,
    pago: texto(c.x_pago),
    tipo_documento: TIPO_DOCUMENTO[c.x_tipo_documento] || texto(c.x_tipo_documento),
    rif: texto(c.x_rif),
    cliente: texto(c.x_cliente),
    factura: texto(c.x_factura),
    fecha_factura: texto(c.x_fecha_factura),
    importe: Number(c.amount) || 0,
    vendedor: texto(c.x_vendedor),
    fecha_aplicacion: texto(c.x_fecha_registro_pago_dia),
    fecha_pago: texto(c.x_fecha_pago),
    termino_pago: texto(c.x_termino_pago),
    descripcion: sinHtml(c.x_descripcion),
    fecha_vencimiento: texto(c.x_fecha_vencimiento),
    diario: texto(c.x_diario_pago),
  }));

  // Vendedores del filtro: los que tienen conciliaciones en el rango.
  const vendedores = [...new Set(todas.map((f) => f.vendedor).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  let resultado = todas;
  if (vendedor && vendedor !== "all") resultado = resultado.filter((f) => f.vendedor === vendedor);
  // «Excluir impuestos»: retenciones, 25% de IVA, IGTF e ISLR por la descripción o el diario.
  if (searchParams.get("sinImpuestos") === "1") resultado = resultado.filter((f) => !esImpuesto(f.descripcion, f.diario));
  if (search) {
    resultado = resultado.filter((f) =>
      [f.cliente, f.factura, f.pago, f.rif].some((v) => v.toLowerCase().includes(search)),
    );
  }
  const fecha = (f: FilaIntegracion) => (porFechaPago ? f.fecha_pago : f.fecha_aplicacion);
  resultado.sort((a, b) => fecha(b).localeCompare(fecha(a)) || b.id - a.id);

  return {
    results: resultado.slice((page - 1) * limit, page * limit),
    total_count: resultado.length,
    total_monto: Math.round(resultado.reduce((s, f) => s + f.importe, 0) * 100) / 100,
    desde,
    hasta,
    companies: (companies || []).map((c) => ({ cid: String(c.id), name: c.name })),
    vendedores,
  };
}
