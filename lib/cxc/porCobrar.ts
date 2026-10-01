import { callOdooRPC } from "@/lib/odoo";
import { calcularSeriesCxC } from "@/lib/cxc/seriesSemanales";
import { esInterno } from "@/lib/cxc/cobros";

/**
 * "Por cobrar" de Contado/Crédito: lo que quedó abierto al cierre del mes
 * (= CxC inicial del mes siguiente), factura por factura, para repartirlo por
 * plazo igual que Facturado y Cobrado.
 *
 *   corte = último día del período a las 23:59, o hoy si el mes no terminó
 *   saldo = saldo de cada factura en el corte (lib/cxc/seriesSemanales.ts →
 *           saldosEn: saldo de hoy + lo conciliado después del corte)
 *
 * Mismo alcance que las tarjetas del dashboard: facturas de ese mes o
 * anteriores, contado y crédito, sin Supricom, sin Incobrables (vencidas
 * antes de 2025) ni SUPER TECHNO; esos dos se devuelven aparte. Los montos
 * son saldos, con IVA (Facturado muestra la base sin IVA).
 *
 * Mes futuro (proyección): no hay cierre que reconstruir. Se toma el saldo de
 * hoy y se dejan solo las facturas que vencen dentro de ese mes. Lo vencido y
 * lo que vence antes se ve en el mes en curso; cuando el mes futuro pasa a ser
 * el mes en curso, vuelve a mostrar todo el saldo abierto.
 */

export interface RenglonPorCobrar {
  id: number;
  name: string;
  partnerId: number;
  partnerName: string;
  invoiceDate: string | null;
  invoiceDateDue: string | null;
  moveType: string;
  saldo: number;
  /** Plazo de la factura; una nota de crédito sin plazo toma el de la factura que revierte. */
  plazoId: number | undefined;
  sellerId: number | undefined;
  sellerName: string;
  companyId: number | undefined;
}

export interface PorCobrar {
  /** YYYY-MM-DD del corte. */
  corte: string;
  /** Mes que todavía no empieza: renglones = saldo de hoy que vence hasta su fin. */
  proyeccion: boolean;
  renglones: RenglonPorCobrar[];
  /** Incobrables en el corte, factura por factura (id → saldo), para su detalle. */
  viejas: Map<number, number>;
  incobrables: number;
  relacionadas: number;
}

const idDe = (v: any): number | undefined => (Array.isArray(v) ? v[0] : v || undefined);

export async function porCobrarAlCierre(
  companyIds: number[],
  periodoFin: Date,
  partnerId?: number,
): Promise<PorCobrar> {
  const hoy = new Date();
  hoy.setHours(23, 59, 59, 999);
  const finDia = new Date(periodoFin);
  finDia.setHours(23, 59, 59, 999);
  const corte = finDia < hoy ? finDia : hoy;
  const proyeccion = new Date(finDia.getFullYear(), finDia.getMonth(), 1) > hoy;
  const pad = (n: number) => String(n).padStart(2, "0");
  const finStr = `${finDia.getFullYear()}-${pad(finDia.getMonth() + 1)}-${pad(finDia.getDate())}`;
  const inicioMesStr = `${finStr.slice(0, 8)}01`;
  const inicioCorte = new Date(corte);
  inicioCorte.setHours(0, 0, 0, 0);

  // Una "semana" de un día que arranca en el corte: así las conciliaciones se
  // leen desde el corte, que es lo que hace falta para reconstruir su saldo.
  // ponytail: calcula toda la sede aunque se pida un solo cliente (drill-down);
  // acotar por partner en seriesSemanales si se vuelve lento.
  const { saldosEn } = await calcularSeriesCxC(companyIds, [{ inicio: inicioCorte, fin: corte }], hoy);
  const { saldos, viejas, incobrables, relacionadas } = saldosEn(corte);

  const ids = [...saldos.keys()];
  const moves: any[] = [];
  for (let i = 0; i < ids.length; i += 5000) {
    const page = await callOdooRPC<any[]>("account.move", "read", [ids.slice(i, i + 5000)], {
      fields: ["id", "name", "partner_id", "invoice_date", "invoice_date_due", "move_type", "invoice_payment_term_id",
        "reversed_entry_id", "invoice_user_id", "company_id"],
    });
    moves.push(...(page || []));
  }

  // Notas de crédito sin plazo: el de la factura que revierten (lib/cxc/credito.ts).
  const origenIds = [...new Set(moves
    .filter((m) => !m.invoice_payment_term_id && m.reversed_entry_id)
    .map((m) => idDe(m.reversed_entry_id)!))];
  const plazoDeOrigen = new Map<number, number | undefined>();
  if (origenIds.length > 0) {
    const origen = await callOdooRPC<any[]>("account.move", "read", [origenIds], { fields: ["id", "invoice_payment_term_id"] });
    for (const o of origen || []) plazoDeOrigen.set(o.id, idDe(o.invoice_payment_term_id));
  }

  const r2 = (n: number) => Math.round(n * 100) / 100;
  const renglones = moves
    .filter((m) => m.partner_id && !esInterno(m.partner_id[1] || ""))
    .filter((m) => partnerId === undefined || m.partner_id[0] === partnerId)
    .filter((m) => {
      if (!proyeccion) return true;
      const vence = m.invoice_date_due || m.invoice_date || "";
      return vence >= inicioMesStr && vence <= finStr;
    })
    .map((m) => ({
      id: m.id,
      name: m.name || "",
      partnerId: m.partner_id[0],
      partnerName: m.partner_id[1] || "Sin cliente",
      invoiceDate: m.invoice_date || null,
      invoiceDateDue: m.invoice_date_due || null,
      moveType: m.move_type,
      saldo: r2(saldos.get(m.id) || 0),
      plazoId: idDe(m.invoice_payment_term_id) ?? plazoDeOrigen.get(idDe(m.reversed_entry_id) ?? -1),
      sellerId: idDe(m.invoice_user_id),
      sellerName: m.invoice_user_id?.[1] || "Sin vendedor",
      companyId: idDe(m.company_id),
    }));

  return { corte: `${corte.getFullYear()}-${pad(corte.getMonth() + 1)}-${pad(corte.getDate())}`, proyeccion, renglones, viejas, incobrables: r2(incobrables), relacionadas: r2(relacionadas) };
}
