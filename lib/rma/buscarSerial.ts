import { callOdooRPCEstricto } from "@/lib/odoo";
import { partnersIntercompania } from "@/lib/intercompania";
import { OdooNoDisponibleError } from "@/lib/servicio-tecnico/factura";

/**
 * ¿Este equipo se lo vendimos a un cliente? Para Buscar Factura de RMA
 * (/rma/buscar-factura): se busca el serial en Odoo y se sigue por dónde pasó.
 *
 *   stock.lot (el serial, uno por empresa)
 *    └─ stock.move.line hechas (state = done) que lo sacan a un cliente o lo
 *       devuelven de un cliente (ubicación de uso "customer")
 *         └─ stock.move.sale_line_id → account.move.line → la factura
 *
 * Igual que la búsqueda de factura del portal (lib/servicio-tecnico/factura.ts)
 * se enlaza por la línea de venta y no por el nombre de la orden, que se
 * repite entre sedes.
 *
 * Las salidas a empresas del grupo (Valencia le despacha a Caracas, Panamá a
 * Supricom USA, lib/intercompania.ts) son traspasos, no ventas: se muestran
 * pero no cuentan para el veredicto. Lo que define si "lo compró" es la última
 * salida a un cliente de afuera, y si después volvió (devolución), queda como
 * devuelto.
 *
 * Antes de abril de 2026 la venta estaba en Smartbit, que no guarda seriales:
 * un equipo vendido entonces sale "no está en Odoo" o "sin salida" aunque sí
 * se haya vendido.
 */

export type Veredicto = "comprado" | "devuelto" | "solo_entre_sedes" | "sin_salida" | "no_existe";

export interface MovimientoSerial {
  tipo: "salida" | "devolucion";
  fecha: string;
  sede: number | null;
  despacho: string;
  cliente: string;
  /** Empresa del grupo (traspaso entre sedes, no venta). */
  intercompania: boolean;
  facturas: { numero: string; fecha: string | null }[];
}

export interface ResultadoSerial {
  serial: string;
  veredicto: Veredicto;
  /** Producto(s) del serial en Odoo. */
  productos: string[];
  /** La venta que decide el veredicto (última salida a un cliente de afuera). */
  venta: MovimientoSerial | null;
  /** Todo lo que pasó con el serial, del más viejo al más nuevo. */
  movimientos: MovimientoSerial[];
}

type M2O = [number, string] | false | undefined | null;
const id = (v: M2O) => (Array.isArray(v) ? v[0] : null);
const nombre = (v: M2O) => (Array.isArray(v) ? v[1] : "");
const comparable = (s: string) => s.trim().toUpperCase();

async function rpc<T>(model: string, method: string, args: any[], kwargs: Record<string, any> = {}): Promise<T> {
  const r = await callOdooRPCEstricto<T>(model, method, args, kwargs);
  if (r === null || r === undefined) throw new OdooNoDisponibleError();
  return r;
}

/** Quita comodines de `ilike` (% y _ se filtran después comparando exacto). */
export function limpiarSerial(entrada: string): string {
  return entrada.trim().replace(/%/g, "").slice(0, 80);
}

/**
 * `productoIds`: si se buscó también por producto, solo cuentan los seriales
 * de esos productos (el mismo serial puede existir en dos marcas).
 */
export async function buscarSerial(entrada: string, productoIds: number[] = []): Promise<ResultadoSerial> {
  const serial = limpiarSerial(entrada);
  const vacio: ResultadoSerial = { serial, veredicto: "no_existe", productos: [], venta: null, movimientos: [] };
  if (!serial) return vacio;

  // ilike + comparación exacta: el serial en Odoo a veces trae espacios o
  // mayúsculas distintas, y un `=` no lo encontraría.
  const lotes = (
    await rpc<any[]>("stock.lot", "search_read", [[["name", "ilike", serial]]], {
      fields: ["id", "name", "product_id", "company_id"],
      limit: 50,
    })
  ).filter(
    (l) =>
      comparable(l.name || "") === comparable(serial) &&
      (productoIds.length === 0 || productoIds.includes(id(l.product_id) ?? -1)),
  );
  if (!lotes.length) return vacio;

  const productos = [...new Set(lotes.map((l) => nombre(l.product_id)).filter(Boolean))];
  const loteIds = lotes.map((l) => l.id);
  const campos = ["date", "move_id", "picking_id", "company_id"];
  const [salidas, devoluciones] = await Promise.all([
    rpc<any[]>("stock.move.line", "search_read", [[["lot_id", "in", loteIds], ["state", "=", "done"], ["location_dest_id.usage", "=", "customer"]]], { fields: campos, limit: 200 }),
    rpc<any[]>("stock.move.line", "search_read", [[["lot_id", "in", loteIds], ["state", "=", "done"], ["location_id.usage", "=", "customer"]]], { fields: campos, limit: 200 }),
  ]);
  if (!salidas.length && !devoluciones.length) return { ...vacio, veredicto: "sin_salida", productos };

  // Cliente de cada despacho y línea de venta de cada movimiento.
  const pickingIds = [...new Set([...salidas, ...devoluciones].map((m) => id(m.picking_id)).filter(Boolean))] as number[];
  const moveIds = [...new Set(salidas.map((m) => id(m.move_id)).filter(Boolean))] as number[];
  const [pickings, moves, grupo] = await Promise.all([
    pickingIds.length ? rpc<any[]>("stock.picking", "read", [pickingIds], { fields: ["name", "partner_id"] }) : Promise.resolve([]),
    moveIds.length ? rpc<any[]>("stock.move", "read", [moveIds], { fields: ["sale_line_id"] }) : Promise.resolve([]),
    partnersIntercompania(),
  ]);
  const picking = new Map(pickings.map((p) => [p.id, p]));
  const ventaDe = new Map(moves.map((m) => [m.id, id(m.sale_line_id)]));

  const partnerIds = [...new Set(pickings.map((p) => id(p.partner_id)).filter(Boolean))] as number[];
  const partners = partnerIds.length
    ? await rpc<any[]>("res.partner", "read", [partnerIds], { fields: ["commercial_partner_id"] })
    : [];
  const comercial = new Map(partners.map((p) => [p.id, id(p.commercial_partner_id) ?? p.id]));

  // Facturas publicadas de las líneas de venta.
  const ventaIds = [...new Set([...ventaDe.values()].filter(Boolean))] as number[];
  const lineas = ventaIds.length
    ? await rpc<any[]>("account.move.line", "search_read", [[
        ["sale_line_ids", "in", ventaIds],
        ["display_type", "=", "product"],
        ["move_id.move_type", "=", "out_invoice"],
        ["parent_state", "=", "posted"],
      ]], { fields: ["move_id", "sale_line_ids"], limit: 500 })
    : [];
  const facturaIds = [...new Set(lineas.map((l) => id(l.move_id)).filter(Boolean))] as number[];
  const facturas = facturaIds.length
    ? await rpc<any[]>("account.move", "read", [facturaIds], { fields: ["name", "invoice_date"] })
    : [];
  const facturaPorId = new Map(facturas.map((f) => [f.id, { numero: f.name || "", fecha: f.invoice_date || null }]));
  const facturasDeVenta = new Map<number, { numero: string; fecha: string | null }[]>();
  for (const l of lineas) {
    const f = facturaPorId.get(id(l.move_id) ?? 0);
    if (!f) continue;
    for (const v of l.sale_line_ids || []) {
      const lista = facturasDeVenta.get(v) ?? [];
      if (!lista.some((x) => x.numero === f.numero)) lista.push(f);
      facturasDeVenta.set(v, lista);
    }
  }

  const movimiento = (m: any, tipo: MovimientoSerial["tipo"]): MovimientoSerial => {
    const p = picking.get(id(m.picking_id) ?? 0);
    const partner = id(p?.partner_id);
    const venta = tipo === "salida" ? ventaDe.get(id(m.move_id) ?? 0) : null;
    return {
      tipo,
      fecha: String(m.date || ""),
      sede: id(m.company_id),
      despacho: p?.name || nombre(m.picking_id),
      cliente: nombre(p?.partner_id) || "Sin cliente",
      intercompania: partner !== null && grupo.has(comercial.get(partner) ?? partner),
      facturas: venta ? facturasDeVenta.get(venta) ?? [] : [],
    };
  };
  const movimientos = [...salidas.map((m) => movimiento(m, "salida")), ...devoluciones.map((m) => movimiento(m, "devolucion"))]
    .sort((a, b) => a.fecha.localeCompare(b.fecha));

  const aClientes = movimientos.filter((m) => !m.intercompania);
  const venta = [...aClientes].reverse().find((m) => m.tipo === "salida") ?? null;
  let veredicto: Veredicto;
  if (venta) {
    const volvio = aClientes.some((m) => m.tipo === "devolucion" && m.fecha > venta.fecha);
    veredicto = volvio ? "devuelto" : "comprado";
  } else {
    veredicto = movimientos.some((m) => m.tipo === "salida") ? "solo_entre_sedes" : "sin_salida";
  }
  return { serial, veredicto, productos, venta, movimientos };
}
