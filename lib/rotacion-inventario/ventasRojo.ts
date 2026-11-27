import { cachear, dominioVentas, leerTodo, signoDocumento } from "@/lib/compras/datosOdoo";
import { idsACredito, nombresPlazos } from "@/lib/cxc/credito";
import { datosSede, planRojoDeSede } from "@/lib/rotacion-inventario/datos";
import { diasEntre, type VentaPlanRojo } from "@/lib/rotacion-inventario/tipos";

/**
 * Cada venta de la mercancía del plan para salir del rojo (lo que estaba en
 * rojo el día que arrancó el plan de la sede): factura, cliente, vendedor,
 * precio, margen sobre el costo de la foto, contado o crédito, plazo y si ya
 * se cobró. Mismas líneas que cuenta el plan (`dominioVentas` de Compras, por
 * fecha de factura, sin intercompañía; las notas de crédito restan), así lo que
 * suma aquí es lo vendido del apartado.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const idDe = (v: any): number | null => (Array.isArray(v) ? v[0] : v) || null;
const nombreDe = (v: any): string => (Array.isArray(v) ? String(v[1] ?? "") : "");
const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "").replace(/\/$/, "");

const ESTADO_PAGO: Record<string, string> = {
  not_paid: "Sin pagar",
  partial: "Pago parcial",
  in_payment: "En proceso de pago",
  paid: "Pagada",
  reversed: "Revertida",
  invoicing_legacy: "Pagada",
};

async function leer(model: string, ids: number[], fields: string[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 1000) {
    out.push(...(await leerTodo(model, [["id", "in", ids.slice(i, i + 1000)]], fields, { context: { active_test: false } })));
  }
  return out;
}

export interface VentasRojoSede {
  companyId: number;
  inicio: string;
  ventas: VentaPlanRojo[];
}

export function ventasDelPlanRojo(companyId: number): Promise<VentasRojoSede | null> {
  return cachear(`rotacion-ventas-rojo|${companyId}`, () => leerVentas(companyId));
}

async function leerVentas(companyId: number): Promise<VentasRojoSede | null> {
  const d = await datosSede(companyId);
  const plan = await planRojoDeSede(companyId, d);
  if (!plan || !plan.lineas.length) return plan ? { companyId, inicio: plan.inicio, ventas: [] } : null;
  const enPlan = new Map(plan.lineas.map((l) => [l.productoId, l]));

  const lineas = await leerTodo(
    "account.move.line",
    [
      ...(await dominioVentas(companyId)),
      ["product_id", "in", [...enPlan.keys()]],
      ["invoice_date", ">=", plan.inicio],
      ["invoice_date", "<=", d.hoy],
    ],
    ["move_id", "product_id", "quantity", "balance", "move_type", "invoice_date"],
  );
  if (!lineas.length) return { companyId, inicio: plan.inicio, ventas: [] };

  const moves = await leer(
    "account.move",
    [...new Set(lineas.map((l) => idDe(l.move_id)!).filter(Boolean))],
    [
      "id", "name", "move_type", "invoice_date", "invoice_date_due", "commercial_partner_id", "invoice_user_id",
      "invoice_payment_term_id", "payment_state", "amount_residual_signed", "reversed_entry_id", "invoice_origin",
    ],
  );
  const movePor = new Map(moves.map((m) => [m.id, m]));
  const [credito, plazos, partners] = await Promise.all([
    idsACredito(moves),
    nombresPlazos([...new Set(moves.map((m) => idDe(m.invoice_payment_term_id)).filter((x): x is number => !!x))]),
    leer("res.partner", [...new Set(moves.map((m) => idDe(m.commercial_partner_id)).filter((x): x is number => !!x))], ["id", "vat"]),
  ]);
  const rif = new Map(partners.map((p) => [p.id, String(p.vat || "").trim()]));

  // Lo que cuenta para la cuota: en orden de fecha, cada producto hasta las
  // unidades que había en la foto (una NC devuelve lo que restó).
  lineas.sort((a, b) => String(a.invoice_date).localeCompare(String(b.invoice_date)) || idDe(a.move_id)! - idDe(b.move_id)! || a.id - b.id);
  const acumulado = new Map<number, number>();
  const ventas: VentaPlanRojo[] = [];
  for (const l of lineas) {
    const pid = idDe(l.product_id)!;
    const base = enPlan.get(pid);
    const m = movePor.get(idDe(l.move_id)!);
    if (!base || !m) continue;
    const signo = signoDocumento(l.move_type);
    const cantidad = signo * (Number(l.quantity) || 0);
    const antes = acumulado.get(pid) ?? 0;
    const despues = antes + cantidad;
    acumulado.set(pid, despues);
    const tope = (n: number) => Math.min(base.unidades, Math.max(0, n));
    const cuentaCuota = r2(tope(despues) - tope(antes));

    const venta = r2(-(Number(l.balance) || 0));
    const costoTotal = r2(cantidad * base.costo);
    const esCredito = credito.has(m.id);
    const fecha = String(m.invoice_date || l.invoice_date || "").slice(0, 10);
    const vence = m.invoice_date_due ? String(m.invoice_date_due).slice(0, 10) : null;
    const saldo = r2(Math.abs(Number(m.amount_residual_signed) || 0));
    const pagada = ["paid", "in_payment", "reversed", "invoicing_legacy"].includes(m.payment_state);
    ventas.push({
      companyId,
      fecha,
      moveId: m.id,
      factura: String(m.name || ""),
      tipo: m.move_type === "out_refund" ? "Nota de crédito" : "Factura",
      pedido: String(m.invoice_origin || ""),
      urlOdoo: ODOO ? `${ODOO}/web#id=${m.id}&model=account.move&view_type=form&cids=${companyId}` : "",
      clienteId: idDe(m.commercial_partner_id),
      cliente: nombreDe(m.commercial_partner_id),
      rif: rif.get(idDe(m.commercial_partner_id) ?? 0) ?? "",
      vendedor: nombreDe(m.invoice_user_id) || "Sin vendedor",
      productoId: pid,
      codigo: base.codigo,
      nombre: base.nombre,
      marca: base.marca,
      categoria: base.categoria,
      cantidad: r2(cantidad),
      cuentaCuota,
      precioUnitario: cantidad ? r2(venta / cantidad) : 0,
      venta,
      costoUnitario: base.costo,
      costoTotal,
      margen: r2(venta - costoTotal),
      margenPct: venta ? Math.round(((venta - costoTotal) / venta) * 1000) / 10 : null,
      condicion: esCredito ? "Crédito" : "Contado",
      plazo: plazos.get(idDe(m.invoice_payment_term_id) ?? 0) ?? "",
      // Una NC no tiene plazo propio: los días son los de la factura que revierte.
      diasCredito: m.move_type === "out_refund" ? null : esCredito && fecha && vence ? Math.max(0, diasEntre(fecha, vence)) : esCredito ? null : 0,
      vence,
      estadoPago: ESTADO_PAGO[m.payment_state] ?? String(m.payment_state || ""),
      saldo,
      diasVencida: !pagada && saldo > 0 && vence && vence < d.hoy ? diasEntre(vence, d.hoy) : 0,
    });
  }
  ventas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.moveId - a.moveId);
  return { companyId, inicio: plan.inicio, ventas };
}
