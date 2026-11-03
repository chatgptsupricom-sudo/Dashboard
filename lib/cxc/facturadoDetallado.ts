import { callOdooRPCEstricto } from "@/lib/odoo";
import { terminosSinIC } from "@/lib/intercompania";
import { rangoDelMes } from "@/lib/inteligencia-negocio/reportes";

/**
 * Facturado detallado (Cuentas por Cobrar): el mismo reporte que en Odoo es
 * Contabilidad > Reportes > Facturación de Productos (acción 1184, vista
 * `lista.facturado.detallado`), pero de cualquier mes. En Odoo esa acción trae
 * la fecha fija en su dominio (desde el día 1 del mes en curso) y no deja ver
 * meses pasados; aquí se pide el mes y el resto del dominio es el mismo:
 * renglones de producto de facturas y notas de crédito de cliente publicadas,
 * por la fecha contable (`date`). Los campos `x_*` son los relacionados que
 * creó Studio para esa vista. Incluye servicios y empresas del grupo, como
 * Odoo (solo Inteligencia de Negocio no ve el grupo: `terminosSinIC`).
 */

export interface LineaFacturado {
  sede: number;
  fecha: string;
  factura: string;
  tipo: "factura" | "nota_credito";
  rif: string;
  cliente: string;
  zona: string;
  direccion: string;
  marca: string;
  codigo: string;
  descripcion: string;
  cantidad: number;
  costo: number;
  precio: number;
  /** Total del renglón sin IVA en la moneda de la factura (`price_subtotal`, como Odoo). */
  total: number;
  moneda: string;
  /** El mismo total en USD (la moneda de las sedes); la nota de crédito resta. */
  totalUsd: number;
  vendedor: string;
}

const PAGINA = 2000;
const nombreDe = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");
const idDe = (v: any): number => (Array.isArray(v) ? v[0] : v) || 0;

export async function facturadoDetallado(companyIds: number[], mes: string): Promise<LineaFacturado[]> {
  const { desde, hasta } = rangoDelMes(mes);
  const dominio = [
    ["company_id", "in", companyIds],
    ["move_id.move_type", "in", ["out_invoice", "out_refund"]],
    ["display_type", "=", "product"],
    ["parent_state", "=", "posted"],
    ["date", ">=", desde],
    ["date", "<=", hasta],
    ...terminosSinIC("move_id.commercial_partner_id"),
  ];
  const campos = [
    "company_id",
    "x_fecha_factura",
    "move_name",
    "move_type",
    "x_rif_cliente",
    "partner_id",
    "x_zona_geografica",
    "x_direccion_cliente",
    "x_marca_producto",
    "product_id",
    "name",
    "quantity",
    "product_cost",
    "price_unit",
    "price_subtotal",
    "currency_id",
    "balance",
    "x_studio_related_field_5t0_1jmo10dvp",
  ];
  const filas: any[] = [];
  for (let offset = 0; ; offset += PAGINA) {
    const r = await callOdooRPCEstricto<any[]>("account.move.line", "search_read", [dominio], {
      fields: campos,
      limit: PAGINA,
      offset,
      order: "date asc, move_name asc, id asc",
      context: { allowed_company_ids: companyIds },
    });
    if (!Array.isArray(r)) throw new Error("Odoo no respondió account.move.line");
    filas.push(...r);
    if (r.length < PAGINA) break;
  }
  return filas.map((l) => {
    const producto = nombreDe(l.product_id);
    // "[CODIGO] Nombre": la vista de Odoo muestra el producto con su código delante.
    const codigo = /^\[([^\]]+)\]/.exec(producto)?.[1] ?? "";
    return {
      sede: idDe(l.company_id),
      fecha: String(l.x_fecha_factura || "").slice(0, 10),
      factura: String(l.move_name || ""),
      tipo: l.move_type === "out_refund" ? "nota_credito" : "factura",
      rif: String(l.x_rif_cliente || ""),
      cliente: nombreDe(l.partner_id),
      zona: String(l.x_zona_geografica || ""),
      direccion: String(l.x_direccion_cliente || ""),
      marca: String(l.x_marca_producto || ""),
      codigo,
      descripcion: String(l.name || producto),
      cantidad: Number(l.quantity) || 0,
      costo: Number(l.product_cost) || 0,
      precio: Number(l.price_unit) || 0,
      total: Number(l.price_subtotal) || 0,
      moneda: nombreDe(l.currency_id),
      totalUsd: Math.round(-(Number(l.balance) || 0) * 100) / 100,
      vendedor: nombreDe(l.x_studio_related_field_5t0_1jmo10dvp),
    };
  });
}
