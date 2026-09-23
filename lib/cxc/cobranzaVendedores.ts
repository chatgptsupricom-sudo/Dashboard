import { callOdooRPC } from "@/lib/odoo";
import { obtenerCobros } from "@/lib/cxc/cobros";
import { esVendedorExcluido } from "@/lib/cxc/vendedoresExcluidos";

/**
 * Cobranza por vendedor para Gerencia de Ventas: lo facturado y lo cobrado en
 * el período por cada vendedor, más su cartera pendiente de hoy.
 *
 * Mismas fuentes que el resto de Cuentas por Cobrar para que los números
 * cuadren con esas pantallas:
 *  - Facturado: facturas y notas de crédito publicadas del período, SIN IVA,
 *    sin el partner interno Supricom (igual que Contado/Crédito y "Ventas del
 *    Mes").
 *  - Cobrado: `obtenerCobros` (lib/cxc/cobros.ts), la fuente única de cobrado:
 *    banco/caja, fechado por la confirmación del pago. Es dinero que entró,
 *    CON IVA, así que no se divide contra el facturado.
 *  - Por cobrar / vencido: `digiflex.cxc.report` (foto de hoy), igual que
 *    Estado de cuenta. "Vencido" solo suma saldos a favor de la empresa: un
 *    pago sin aplicar (saldo negativo) también trae días de atraso y restaba
 *    del vencido (Valencia daba −$1,48M por pagos de SUPRICOM CCS).
 *  - El partner interno Supricom queda fuera de las tres columnas: no es
 *    cobranza de un vendedor.
 */

export interface ClienteCobranza {
  partnerId: number;
  nombre: string;
  facturado: number;
  cobrado: number;
  porCobrar: number;
  vencido: number;
}

export interface VendedorCobranza {
  userId: number;
  nombre: string;
  excluido: boolean;
  facturado: number;
  facturas: number;
  cobrado: number;
  /** Cobrado de facturas emitidas en el período (o después). */
  cobradoDelPeriodo: number;
  /** Cobrado de facturas de períodos anteriores (deuda vieja). */
  cobradoAnterior: number;
  pagos: number;
  porCobrar: number;
  vencido: number;
  clientes: ClienteCobranza[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const esInternoPartner = (nombre: string) => nombre.toLowerCase().includes("supricom");

async function paginar(model: string, domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let offset = 0; ; offset += 5000) {
    const page = await callOdooRPC<any[]>(model, "search_read", [domain], { fields, order: "id asc", limit: 5000, offset });
    if (!page || page.length === 0) break;
    out.push(...page);
    if (page.length < 5000) break;
  }
  return out;
}

export async function cobranzaPorVendedor(companyId: number, desde: string, hasta: string): Promise<VendedorCobranza[]> {
  const [facturas, cobros, cartera] = await Promise.all([
    paginar(
      "account.move",
      [
        ["move_type", "in", ["out_invoice", "out_refund"]],
        ["state", "=", "posted"],
        ["company_id", "=", companyId],
        ["invoice_date", ">=", desde],
        ["invoice_date", "<=", hasta],
      ],
      ["id", "partner_id", "move_type", "amount_untaxed", "invoice_user_id"],
    ),
    obtenerCobros([companyId], { desde, hasta }),
    paginar(
      "digiflex.cxc.report",
      [["company_id", "=", companyId], ["amount_residual", "!=", 0]],
      ["user_id", "user_name", "partner_id", "amount_residual", "days_overdue"],
    ),
  ]);

  const vendedores = new Map<number, VendedorCobranza>();
  const clientesDe = new Map<number, Map<number, ClienteCobranza>>();
  const vendedor = (userId: number, nombre: string) => {
    if (!vendedores.has(userId)) {
      vendedores.set(userId, {
        userId, nombre, excluido: esVendedorExcluido(nombre, companyId),
        facturado: 0, facturas: 0, cobrado: 0, cobradoDelPeriodo: 0, cobradoAnterior: 0, pagos: 0,
        porCobrar: 0, vencido: 0, clientes: [],
      });
      clientesDe.set(userId, new Map());
    }
    return vendedores.get(userId)!;
  };
  const cliente = (userId: number, partnerId: number, nombre: string) => {
    const m = clientesDe.get(userId)!;
    if (!m.has(partnerId)) m.set(partnerId, { partnerId, nombre, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0 });
    return m.get(partnerId)!;
  };

  for (const f of facturas) {
    const partnerNombre = f.partner_id?.[1] || "";
    if (!f.partner_id || esInternoPartner(partnerNombre)) continue;
    const uid = f.invoice_user_id?.[0] || 0;
    const v = vendedor(uid, f.invoice_user_id?.[1] || "Sin vendedor");
    const monto = (f.move_type === "out_refund" ? -1 : 1) * (Number(f.amount_untaxed) || 0);
    v.facturado += monto;
    if (f.move_type === "out_invoice") v.facturas += 1;
    cliente(uid, f.partner_id[0], partnerNombre).facturado += monto;
  }

  for (const c of cobros) {
    if (c.interno) continue;
    const uid = c.vendedorId || 0;
    const v = vendedor(uid, c.vendedorName || "Sin vendedor");
    v.cobrado += c.monto;
    v.pagos += 1;
    if (!c.fechaFactura || c.fechaFactura >= desde) v.cobradoDelPeriodo += c.monto;
    else v.cobradoAnterior += c.monto;
    if (c.partnerId) cliente(uid, c.partnerId, c.partnerName || "Sin cliente").cobrado += c.monto;
  }

  for (const r of cartera) {
    if (esInternoPartner(r.partner_id?.[1] || "")) continue;
    const uid = r.user_id?.[0] || 0;
    const v = vendedor(uid, r.user_name || r.user_id?.[1] || "Sin vendedor");
    const residual = Number(r.amount_residual) || 0;
    const vencido = (r.days_overdue || 0) > 0 && residual > 0 ? residual : 0;
    v.porCobrar += residual;
    v.vencido += vencido;
    if (r.partner_id) {
      const cl = cliente(uid, r.partner_id[0], r.partner_id[1] || "Sin cliente");
      cl.porCobrar += residual;
      cl.vencido += vencido;
    }
  }

  return [...vendedores.values()]
    .map((v) => ({
      ...v,
      facturado: r2(v.facturado),
      cobrado: r2(v.cobrado),
      cobradoDelPeriodo: r2(v.cobradoDelPeriodo),
      cobradoAnterior: r2(v.cobradoAnterior),
      porCobrar: r2(v.porCobrar),
      vencido: r2(v.vencido),
      clientes: [...clientesDe.get(v.userId)!.values()]
        .map((c) => ({ ...c, facturado: r2(c.facturado), cobrado: r2(c.cobrado), porCobrar: r2(c.porCobrar), vencido: r2(c.vencido) }))
        .filter((c) => c.facturado !== 0 || c.cobrado !== 0 || c.porCobrar !== 0)
        .sort((a, b) => b.cobrado + b.facturado - (a.cobrado + a.facturado)),
    }))
    .filter((v) => v.facturado !== 0 || v.cobrado !== 0 || v.porCobrar !== 0)
    .sort((a, b) => b.cobrado - a.cobrado || b.facturado - a.facturado);
}
