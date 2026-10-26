// Clientes que compraron en un mes o en varios (desde/hasta): cuántos,
// cuáles, sus facturas del período y el detalle de cada una. Facturas de
// cliente publicadas de Odoo por fecha de factura (las NC salen en la lista y
// restan), sin intercompañía. Montos en USD (`*_signed` / `balance`, moneda
// de la sede; Caracas factura en bolívares). Antes del corte (CORTE_ODOO)
// Odoo no tiene la venta real: esos meses salen vacíos.

import { idM2o, leerTodo, nombreM2o, redondear } from "@/lib/administracion/lectura";
import { sedeDelToken } from "@/lib/auth/sedeRol";
import { sinIntercompania } from "@/lib/intercompania";

export const SEDES_COMPRAS: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

const TIPOS = ["out_invoice", "out_receipt", "out_refund"];
// ponytail: tope para que la respuesta (con el detalle de cada factura) no pase de ~20 MB; paginar si piden más.
export const MAX_MESES = 12;

export type LineaFactura = { producto: string; descripcion: string; cantidad: number; precio: number; descuento: number; subtotal: number };
export type FacturaMes = {
  id: number;
  numero: string;
  nc: boolean;
  fecha: string;
  vendedor: string;
  referencia: string;
  subtotal: number;
  iva: number;
  total: number;
  lineas: LineaFactura[];
};
export type ClienteMes = { id: number; cliente: string; rif: string; sede: number; subtotal: number; iva: number; total: number; facturas: FacturaMes[] };
/** Un mes de una sede, con el mismo criterio que si se pidiera solo ese mes. */
export type ResumenMes = { mes: string; sede: number; clientes: number; facturas: number; nc: number; subtotal: number; iva: number; total: number };
export type ReporteComprasMes = {
  desde: string;
  hasta: string;
  meses: string[];
  sedes: number[];
  clientes: ClienteMes[];
  porMes: ResumenMes[];
  resumen: { clientes: number; facturas: number; subtotal: number; total: number };
};

/**
 * Sedes que puede ver quien llama: AdminLeads solo la de su `cids` (null si
 * no tiene una válida → 403); los demás, la pedida en `?sede=` o todas.
 */
export function sedesDelUsuario(payload: any, sp: URLSearchParams): number[] | null {
  if (String(payload?.role || "").toLowerCase().trim() === "adminleads") {
    const propia = sedeDelToken(payload);
    return propia === null ? null : [propia];
  }
  const pedida = Number(sp.get("sede"));
  return SEDES_COMPRAS[pedida] ? [pedida] : Object.keys(SEDES_COMPRAS).map(Number);
}

const ES_MES = /^\d{4}-(0[1-9]|1[0-2])$/;

function sumarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * `?desde=YYYY-MM&hasta=YYYY-MM` (o `?mes=` para uno solo). Sin fechas
 * válidas, el mes en curso (hora de Caracas). Al revés se invierten y más de
 * MAX_MESES se recorta por el principio.
 */
export function periodoPedido(sp: URLSearchParams): { desde: string; hasta: string } {
  const actual = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Caracas" }).slice(0, 7);
  const leer = (k: string) => (ES_MES.test(sp.get(k) || "") ? sp.get(k)! : null);
  let desde = leer("desde") ?? leer("mes");
  let hasta = leer("hasta") ?? leer("mes");
  desde ??= hasta ?? actual;
  hasta ??= desde;
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (desde < sumarMeses(hasta, 1 - MAX_MESES)) desde = sumarMeses(hasta, 1 - MAX_MESES);
  return { desde, hasta };
}

function finDeMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(a, m, 0).getDate()).padStart(2, "0")}`;
}

async function leerSede(desde: string, hasta: string, sede: number) {
  const fechas = [["invoice_date", ">=", `${desde}-01`], ["invoice_date", "<=", finDeMes(hasta)]];
  const [facturas, lineas] = await Promise.all([
    leerTodo(
      "account.move",
      [["move_type", "in", TIPOS], ["state", "=", "posted"], ["company_id", "=", sede], ...fechas, await sinIntercompania()],
      ["name", "move_type", "invoice_date", "commercial_partner_id", "invoice_user_id", "ref", "invoice_origin",
        "amount_untaxed_signed", "amount_tax_signed", "amount_total_signed"],
      [sede],
      "invoice_date asc, name asc",
    ),
    leerTodo(
      "account.move.line",
      [["move_type", "in", TIPOS], ["parent_state", "=", "posted"], ["display_type", "=", "product"], ["company_id", "=", sede],
        ...fechas, await sinIntercompania("move_id.commercial_partner_id")],
      ["move_id", "product_id", "name", "quantity", "price_unit", "discount", "balance"],
      [sede],
      "move_id asc, sequence asc, id asc",
    ),
  ]);
  return { sede, facturas, lineas };
}

export async function comprasDelPeriodo(desde: string, hasta: string, sedes: number[]): Promise<ReporteComprasMes> {
  const meses: string[] = [];
  for (let m = desde; m <= hasta; m = sumarMeses(m, 1)) meses.push(m);

  const leido = await Promise.all(sedes.map((s) => leerSede(desde, hasta, s)));

  const partners = [...new Set(leido.flatMap((l) => l.facturas.map((f) => idM2o(f.commercial_partner_id))).filter((x): x is number => x != null))];
  const rifs = new Map<number, string>();
  if (partners.length) {
    const filas = await leerTodo("res.partner", [["id", "in", partners], ["active", "in", [true, false]]], ["vat"], sedes);
    for (const p of filas) rifs.set(p.id, String(p.vat || ""));
  }

  const clientes = new Map<string, ClienteMes>();
  const porMes: ResumenMes[] = [];
  for (const { sede, facturas, lineas } of leido) {
    const lineasDe = new Map<number, LineaFactura[]>();
    for (const l of lineas) {
      const move = idM2o(l.move_id);
      if (move == null) continue;
      const subtotal = redondear(-(Number(l.balance) || 0)); // venta = crédito (negativo); NC = débito
      const cantidad = (subtotal < 0 ? -1 : 1) * Math.abs(Number(l.quantity) || 0);
      const lista = lineasDe.get(move) ?? [];
      lista.push({
        producto: nombreM2o(l.product_id),
        descripcion: String(l.name || ""),
        cantidad,
        // Precio en USD sale del subtotal: `price_unit` va en la moneda de la factura.
        precio: cantidad ? redondear(subtotal / cantidad) : 0,
        descuento: Number(l.discount) || 0,
        subtotal,
      });
      lineasDe.set(move, lista);
    }

    // Por mes: cuenta quien tuvo al menos una factura ese mes (igual que pedir el mes solo).
    const delMes = new Map<string, any[]>(meses.map((m) => [m, []]));
    for (const f of facturas) delMes.get(String(f.invoice_date || "").slice(0, 7))?.push(f);
    for (const [mes, fs] of delMes) {
      const compraron = new Set(fs.filter((f) => f.move_type !== "out_refund").map((f) => idM2o(f.commercial_partner_id)));
      const suyas = fs.filter((f) => compraron.has(idM2o(f.commercial_partner_id)));
      const suma = (k: string) => redondear(suyas.reduce((s, f) => s + (Number(f[k]) || 0), 0));
      porMes.push({
        mes,
        sede,
        clientes: compraron.size,
        facturas: suyas.filter((f) => f.move_type !== "out_refund").length,
        nc: suyas.filter((f) => f.move_type === "out_refund").length,
        subtotal: suma("amount_untaxed_signed"),
        iva: suma("amount_tax_signed"),
        total: suma("amount_total_signed"),
      });
    }

    for (const f of facturas) {
      const id = idM2o(f.commercial_partner_id);
      if (id == null) continue;
      const llave = `${sede}|${id}`;
      let c = clientes.get(llave);
      if (!c) {
        c = { id, cliente: nombreM2o(f.commercial_partner_id), rif: rifs.get(id) || "", sede, subtotal: 0, iva: 0, total: 0, facturas: [] };
        clientes.set(llave, c);
      }
      const fac: FacturaMes = {
        id: f.id,
        numero: f.name || "",
        nc: f.move_type === "out_refund",
        fecha: String(f.invoice_date || ""),
        vendedor: nombreM2o(f.invoice_user_id),
        referencia: [f.invoice_origin, f.ref].filter(Boolean).join(" · "),
        subtotal: redondear(Number(f.amount_untaxed_signed) || 0),
        iva: redondear(Number(f.amount_tax_signed) || 0),
        total: redondear(Number(f.amount_total_signed) || 0),
        lineas: lineasDe.get(f.id) ?? [],
      };
      c.facturas.push(fac);
      c.subtotal += fac.subtotal;
      c.iva += fac.iva;
      c.total += fac.total;
    }
  }

  // Compró = al menos una factura en el período; quien solo tuvo NC no entra.
  const lista = [...clientes.values()]
    .filter((c) => c.facturas.some((f) => !f.nc))
    .map((c) => ({ ...c, subtotal: redondear(c.subtotal), iva: redondear(c.iva), total: redondear(c.total) }))
    .sort((a, b) => b.subtotal - a.subtotal);

  return {
    desde,
    hasta,
    meses,
    sedes,
    clientes: lista,
    porMes,
    resumen: {
      clientes: lista.length,
      facturas: lista.reduce((s, c) => s + c.facturas.filter((f) => !f.nc).length, 0),
      subtotal: redondear(lista.reduce((s, c) => s + c.subtotal, 0)),
      total: redondear(lista.reduce((s, c) => s + c.total, 0)),
    },
  };
}
