import { callOdooRPC } from "@/lib/odoo";

/**
 * KPI "DSO" (días promedio de cobro), por cliente y global.
 *
 *   DSO cliente = (saldo abierto ÷ ventas netas) × días del período
 *
 *   ventas netas     = facturado − notas de crédito, desde su 1ª factura
 *   días del período = días desde la 1ª factura del cliente hasta hoy
 *
 *   DSO global  = Σ (DSO cliente × saldo cliente) ÷ Σ saldo cliente
 *                 (promedio ponderado por saldo, sobre los clientes que deben)
 *
 * Cada cliente tiene su propio período, así que el global no puede ser una
 * sola división Σ CxC ÷ Σ ventas: eso exigiría un único período para todos
 * (la 1ª factura de la sede, ~2018) y le daría todo el peso a años viejos.
 * Ponderar por saldo hace que pesen más los que más deben.
 *
 * Montos con IVA y en moneda de la compañía (`amount_total_signed` /
 * `amount_residual_signed`, igual que lib/cxc/efectividad.ts): con la moneda
 * del documento, una factura vieja en bolívares se sumaría a las de dólares.
 * Los `_signed` ya vienen negativos en las notas de crédito. Se agrupa por
 * `commercial_partner_id` para que las facturas a contactos de una empresa
 * cuenten como una sola cuenta.
 *
 * No depende del mes seleccionado: es la foto de hoy.
 */

export interface DsoCliente {
  partnerId: number;
  partnerName: string;
  /** Saldo abierto hoy (facturas − notas de crédito abiertas). */
  saldo: number;
  facturado: number;
  notasCredito: number;
  ventasNetas: number;
  /** YYYY-MM-DD de la primera factura del cliente en estas sedes. */
  primeraFactura: string;
  dias: number;
  /** `null` si no tiene ventas netas positivas. */
  dso: number | null;
}

export interface DsoResultado {
  /** DSO global ponderado por saldo. `null` si nadie debe. */
  value: number | null;
  /** Σ saldo de los clientes que entran al promedio. */
  carteraAbierta: number;
  /** Σ ventas netas de esos mismos clientes. */
  ventasNetas: number;
  /** Nº de clientes que entran al promedio (saldo > 0 y ventas netas > 0). */
  clientesIncluidos: number;
  /**
   * Clientes con saldo > 0, ordenados por saldo. Incluye los de `dso: null`
   * (ventas netas ≤ 0) para que se vean, aunque no entren al promedio.
   */
  clientes: DsoCliente[];
}

const PAGE = 5000;
const DIA_MS = 24 * 60 * 60 * 1000;

async function paginar(domain: any[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  let offset = 0;
  while (true) {
    const page = await callOdooRPC<any[]>("account.move", "search_read", [domain], {
      fields, order: "id asc", limit: PAGE, offset,
    });
    if (!page || page.length === 0) break;
    out.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

export async function calcularDSO(companyIds: number[], hoy: Date): Promise<DsoResultado> {
  // Todo el historial: el período arranca en la 1ª factura de cada cliente.
  const movimientos = await paginar(
    [
      ["move_type", "in", ["out_invoice", "out_refund"]],
      ["state", "=", "posted"],
      ["company_id", "in", companyIds],
      // Mismo filtro de internos que los demás KPIs (por contacto) y además
      // por empresa, porque aquí se agrupa por empresa.
      ["partner_id.name", "not ilike", "supricom"],
      ["commercial_partner_id.name", "not ilike", "supricom"],
      // SUPER TECHNO LLC (Panamá) es empresa relacionada: en sep-2026 debía
      // 2,5 M sin un solo pago (77% del saldo de la sede) y llevaba el DSO de
      // Panamá de ~80 a 344 días. Se excluye como a los internos.
      ["commercial_partner_id.name", "not ilike", "super techno llc"],
    ],
    ["commercial_partner_id", "move_type", "invoice_date", "amount_total_signed", "amount_residual_signed"],
  );

  const porCliente = new Map<number, {
    name: string; saldo: number; facturado: number; notasCredito: number; primera: string | null;
  }>();
  for (const m of movimientos) {
    const pid = Array.isArray(m.commercial_partner_id) ? m.commercial_partner_id[0] : m.commercial_partner_id;
    if (!pid) continue;
    let c = porCliente.get(pid);
    if (!c) {
      c = { name: m.commercial_partner_id?.[1] || "Sin cliente", saldo: 0, facturado: 0, notasCredito: 0, primera: null };
      porCliente.set(pid, c);
    }
    c.saldo += Number(m.amount_residual_signed || 0);
    if (m.move_type === "out_refund") {
      c.notasCredito -= Number(m.amount_total_signed || 0);
    } else {
      c.facturado += Number(m.amount_total_signed || 0);
      const fecha = m.invoice_date ? String(m.invoice_date).slice(0, 10) : null;
      if (fecha && (!c.primera || fecha < c.primera)) c.primera = fecha;
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const clientes: DsoCliente[] = [];
  for (const [partnerId, c] of porCliente) {
    // Sin deuda no hay días de cobro que medir (saldo a favor incluido).
    if (c.saldo < 0.005 || !c.primera) continue;
    const ventasNetas = c.facturado - c.notasCredito;
    const dias = Math.max(1, Math.floor((hoy.getTime() - new Date(c.primera + "T00:00:00").getTime()) / DIA_MS));
    clientes.push({
      partnerId,
      partnerName: c.name,
      saldo: r2(c.saldo),
      facturado: r2(c.facturado),
      notasCredito: r2(c.notasCredito),
      ventasNetas: r2(ventasNetas),
      primeraFactura: c.primera,
      dias,
      dso: ventasNetas > 0 ? Math.round((c.saldo / ventasNetas) * dias * 100) / 100 : null,
    });
  }
  clientes.sort((a, b) => b.saldo - a.saldo);

  // Solo los clientes con DSO calculable entran al promedio; la cartera y las
  // ventas que se muestran junto a la tarjeta son las de ese mismo grupo.
  let pesoTotal = 0;
  let ponderado = 0;
  let ventas = 0;
  let incluidos = 0;
  for (const c of clientes) {
    if (c.dso === null) continue;
    incluidos++;
    pesoTotal += c.saldo;
    ponderado += c.dso * c.saldo;
    ventas += c.ventasNetas;
  }

  return {
    value: pesoTotal > 0 ? Math.round(ponderado / pesoTotal) : null,
    carteraAbierta: r2(pesoTotal),
    ventasNetas: r2(ventas),
    clientesIncluidos: incluidos,
    clientes,
  };
}
