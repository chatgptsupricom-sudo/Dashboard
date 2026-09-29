import { callOdooRPC } from "@/lib/odoo";
import { query } from "@/lib/db";
import { VENCIMIENTO_DESDE } from "@/lib/cxc/carteraVieja";
import { CORTE_ODOO, normalizarRif, RIF_SQL } from "@/lib/smartbit";
import { RELACIONADA } from "@/lib/cxc/cobros";

/**
 * KPI "DSO" (días promedio de cobro), por cliente y global.
 *
 *   DSO cliente = (saldo abierto ÷ ventas netas) × días del período
 *
 *   ventas netas     = facturado − notas de crédito de los últimos 12 meses
 *   días del período = 365, o los días desde la 1ª factura del cliente si
 *                      es más nuevo
 *
 *   DSO global  = Σ (DSO cliente × saldo cliente) ÷ Σ saldo cliente
 *                 (promedio ponderado por saldo, sobre los clientes que deben)
 *
 * Ventana móvil de 12 meses y no toda la historia: el DSO mide qué tan
 * rápido paga el cliente HOY, así que la venta diaria contra la que se
 * compara el saldo tiene que ser reciente. Con historia larga, un cliente que
 * antes compraba mucho y ahora poco sale con un DSO más bajo del real.
 *
 * Un cliente nuevo tiene un período más corto, así que el global no puede ser
 * una sola división Σ CxC ÷ Σ ventas. Ponderar por saldo hace que pesen más
 * los que más deben.
 *
 * Montos con IVA y en moneda de la compañía (`amount_total_signed` /
 * `amount_residual_signed`, igual que lib/cxc/efectividad.ts): con la moneda
 * del documento, una factura vieja en bolívares se sumaría a las de dólares.
 * Los `_signed` ya vienen negativos en las notas de crédito. Se agrupa por
 * `commercial_partner_id` para que las facturas a contactos de una empresa
 * cuenten como una sola cuenta.
 *
 * El saldo va sin la cartera vieja (vencida antes de 2025,
 * lib/cxc/carteraVieja.ts), que se muestra aparte como Incobrables.
 *
 * ── Ventas antes del corte (2026-04-01) ──
 *
 * Antes del corte Odoo solo tiene las facturas que se migraron ABIERTAS desde
 * Smartbit, no la venta real: contarlas como ventas daba días de 2025 sin las
 * ventas de esos días y el DSO salía inflado. Por eso, dentro de los 12 meses:
 *
 *   saldo          = todo lo abierto en Odoo (migrado incluido)
 *   ventas netas   = ventas_smartbit hasta el corte
 *                  + facturado − notas de crédito en Odoo desde el corte
 *   1ª factura     = la más vieja de esas dos fuentes
 *
 * Smartbit se cruza por RIF (`codigo_cliente` = `res.partner.vat` de la
 * empresa) y sede (`company_id`). Su `venta` es neta SIN impuesto y el saldo
 * de Odoo lleva IVA, así que se lleva a bruto con la relación total/base de
 * las facturas de esa sede en Odoo desde el corte. Si la MySQL no responde
 * (o la sede no tiene histórico cargado) el cliente queda solo con Odoo desde
 * el corte.
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
  /** Parte de `ventasNetas` que viene de ventas_smartbit (antes del corte, con IVA estimado). */
  ventasSmartbit: number;
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
  // Inicio de la ventana de 12 meses, en fecha local (hoy viene a las 23:59 y
  // toISOString lo pasaría al día siguiente en UTC).
  const d = new Date(hoy);
  d.setDate(d.getDate() - 365);
  const desdeVentas = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  // Todo el historial por el saldo; las ventas se filtran abajo.
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
      ["commercial_partner_id.name", "not ilike", RELACIONADA],
      "|", ["invoice_date_due", "=", false], ["invoice_date_due", ">=", VENCIMIENTO_DESDE],
    ],
    ["commercial_partner_id", "company_id", "move_type", "invoice_date", "amount_total_signed",
      "amount_untaxed_signed", "amount_residual_signed"],
  );

  const porCliente = new Map<number, {
    name: string; saldo: number; facturado: number; notasCredito: number; smartbit: number; primera: string | null;
  }>();
  // Total/base por sede desde el corte, para llevar Smartbit (sin IVA) a bruto.
  const bruto = new Map<number, { total: number; base: number }>();
  for (const m of movimientos) {
    const pid = Array.isArray(m.commercial_partner_id) ? m.commercial_partner_id[0] : m.commercial_partner_id;
    if (!pid) continue;
    let c = porCliente.get(pid);
    if (!c) {
      c = { name: m.commercial_partner_id?.[1] || "Sin cliente", saldo: 0, facturado: 0, notasCredito: 0, smartbit: 0, primera: null };
      porCliente.set(pid, c);
    }
    c.saldo += Number(m.amount_residual_signed || 0);
    // Antes del corte solo cuenta el saldo (ver arriba): la venta sale de Smartbit.
    const fecha = m.invoice_date ? String(m.invoice_date).slice(0, 10) : null;
    if (!fecha || fecha < CORTE_ODOO) continue;
    const cid = Array.isArray(m.company_id) ? m.company_id[0] : m.company_id;
    const b = bruto.get(cid) || { total: 0, base: 0 };
    b.total += Number(m.amount_total_signed || 0);
    b.base += Number(m.amount_untaxed_signed || 0);
    bruto.set(cid, b);
    if (fecha < desdeVentas) continue;
    if (m.move_type === "out_refund") {
      c.notasCredito -= Number(m.amount_total_signed || 0);
    } else {
      c.facturado += Number(m.amount_total_signed || 0);
      if (!c.primera || fecha < c.primera) c.primera = fecha;
    }
  }

  // Ventas de Smartbit de los clientes que deben (los demás no entran al DSO).
  const deudores = [...porCliente].filter(([, c]) => c.saldo >= 0.005).map(([pid]) => pid);
  if (deudores.length > 0) {
    try {
      const [partners, { rows }] = await Promise.all([
        callOdooRPC<any[]>("res.partner", "read", [deudores], { fields: ["vat"] }),
        query(
          `SELECT company_id, ${RIF_SQL} AS rif, SUM(venta) AS venta, DATE_FORMAT(MIN(fecha), '%Y-%m-%d') AS primera
             FROM ventas_smartbit
            WHERE company_id IN (${companyIds.map(() => "?").join(",")})
              AND fecha >= ? AND fecha < ?
            GROUP BY company_id, rif`,
          [...companyIds, desdeVentas, CORTE_ODOO],
        ),
      ]);
      const pidDeRif = new Map<string, number>();
      for (const p of partners || []) {
        const rif = normalizarRif(p.vat || "");
        if (rif) pidDeRif.set(rif, p.id);
      }
      for (const r of rows as any[]) {
        const pid = pidDeRif.get(r.rif);
        const c = pid !== undefined ? porCliente.get(pid) : undefined;
        if (!c) continue;
        const b = bruto.get(Number(r.company_id));
        // ponytail: factor promedio de la sede; un cliente exento queda un poco inflado.
        const factor = b && b.base > 0 ? b.total / b.base : 1;
        c.smartbit += Number(r.venta || 0) * factor;
        if (r.primera && (!c.primera || r.primera < c.primera)) c.primera = r.primera;
      }
    } catch (e: any) {
      console.error("DSO: ventas_smartbit no disponible, se sigue solo con Odoo:", e.message);
    }
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const clientes: DsoCliente[] = [];
  for (const [partnerId, c] of porCliente) {
    // Sin deuda no hay días de cobro que medir (saldo a favor incluido).
    if (c.saldo < 0.005 || !c.primera) continue;
    const ventasNetas = c.facturado - c.notasCredito + c.smartbit;
    const dias = Math.max(1, Math.floor((hoy.getTime() - new Date(c.primera + "T00:00:00").getTime()) / DIA_MS));
    clientes.push({
      partnerId,
      partnerName: c.name,
      saldo: r2(c.saldo),
      facturado: r2(c.facturado),
      notasCredito: r2(c.notasCredito),
      ventasSmartbit: r2(c.smartbit),
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
