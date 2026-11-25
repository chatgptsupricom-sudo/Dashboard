/**
 * «Mi cuenta» de la tienda web: lo que se lee de Odoo para un cliente. Solo lectura y siempre acotado a
 * sus empresas (`partner_id child_of` sus partners comerciales), en las tres sedes.
 */
import { callOdooRPCEstricto } from "@/lib/odoo";
import { cachear, hoyCaracas } from "@/lib/compras/datosOdoo";
import { nombreBonito } from "@/lib/tienda-web/tipos";
import {
  claveDocumento, COMPANIAS_TIENDA, nucleoDocumento, diasDeAtraso, esCorreoInterno, estadoFactura, etapaPedido, NOMBRE_ESTADO_FACTURA,
  NOMBRE_ETAPA, redondear, SEDE_DE_COMPANIA,
} from "./tipos";

const CONTEXTO = { allowed_company_ids: COMPANIAS_TIENDA };
const leer = <T = any[]>(modelo: string, dominio: any[], kwargs: Record<string, any>) =>
  callOdooRPCEstricto<T>(modelo, "search_read", [dominio], { context: CONTEXTO, ...kwargs });
const contar = (modelo: string, dominio: any[]) =>
  callOdooRPCEstricto<number>(modelo, "search_count", [dominio], { context: CONTEXTO });

export interface ClienteOdoo {
  /** Partners comerciales (empresas) que puede ver: los de su correo y los de su mismo RIF/RUC. */
  partners: number[];
  nombre: string;
  empresa: string;
  documento: string;
}

/**
 * El cliente de un correo: las fichas activas con ese correo cuya empresa es cliente (customer_rank > 0),
 * más las empresas con su mismo RIF/RUC en las otras sedes. null = no es cliente (o es un correo de la
 * empresa). 10 min en memoria: si se le quita el correo en Odoo, pierde el acceso en ese tiempo.
 */
export function clientePorCorreo(correo: string): Promise<ClienteOdoo | null> {
  return cachear(`tienda-web|cliente|${correo}`, async () => {
    if (esCorreoInterno(correo)) return null;
    const contactos = await leer<any[]>("res.partner", [["email", "=ilike", correo], ["active", "=", true]], {
      fields: ["id", "name", "commercial_partner_id"], limit: 50,
    });
    if (!Array.isArray(contactos) || !contactos.length) return null;
    const comerciales = [...new Set(contactos.map((c) => c.commercial_partner_id?.[0]).filter(Boolean))] as number[];
    const empresas = await leer<any[]>("res.partner", [["id", "in", comerciales], ["customer_rank", ">", 0]], {
      fields: ["id", "name", "vat"], limit: 50,
    });
    if (!Array.isArray(empresas) || !empresas.length) return null;
    const documentos = [...new Set(empresas.map((e) => claveDocumento(e.vat)).filter((d) => d.length >= 6))];
    const ids = new Set(empresas.map((e) => e.id as number));
    // Las mismas empresas en otras sedes (cada sede puede tener su ficha con el mismo RIF/RUC). En Odoo el
    // RIF viene con o sin guiones: se busca por su tramo de números más largo y se compara exacto después.
    const nucleos = [...new Set(empresas.map((e) => nucleoDocumento(e.vat)).filter(Boolean))].slice(0, 5) as string[];
    if (documentos.length && nucleos.length) {
      const porNucleo = nucleos.map((n) => ["vat", "ilike", n]);
      const dominio = [["active", "=", true], ["customer_rank", ">", 0], ...Array(porNucleo.length - 1).fill("|"), ...porNucleo];
      const mismos = await leer<any[]>("res.partner", dominio, { fields: ["id", "vat", "commercial_partner_id"], limit: 200 });
      for (const m of Array.isArray(mismos) ? mismos : []) {
        if (documentos.includes(claveDocumento(m.vat))) ids.add(m.commercial_partner_id?.[0] || m.id);
      }
    }
    const contacto = contactos.find((c) => !c.commercial_partner_id || c.commercial_partner_id[0] !== c.id) || contactos[0];
    return {
      partners: [...ids],
      nombre: String(contacto.name || "").trim(),
      empresa: String(empresas[0].name || "").trim(),
      documento: String(empresas[0].vat || "").trim(),
    };
  });
}

const sede = (company: any) => SEDE_DE_COMPANIA[company?.[0]] || { id: "", nombre: company?.[1] || "" };
const moneda = (c: any) => (c?.[1] ? String(c[1]) : "USD");

/* ------------------------------------------------------------------ Pedidos */
const CAMPOS_PEDIDO = ["id", "name", "date_order", "state", "invoice_status", "amount_untaxed", "amount_total", "currency_id", "company_id", "user_id", "client_order_ref"];

async function leerPedidos(dominio: any[], kwargs: Record<string, any>): Promise<any[]> {
  // delivery_status lo agrega sale_stock; si la base no lo tiene, se sigue sin él (no habrá «Despachado»).
  try {
    return (await leer<any[]>("sale.order", dominio, { ...kwargs, fields: [...CAMPOS_PEDIDO, "delivery_status"] })) || [];
  } catch {
    return (await leer<any[]>("sale.order", dominio, { ...kwargs, fields: CAMPOS_PEDIDO })) || [];
  }
}

const pedidoCorto = (p: any) => {
  const etapa = etapaPedido(p);
  return {
    id: p.id,
    numero: p.name,
    referencia: p.client_order_ref || "",
    fecha: String(p.date_order || "").slice(0, 10),
    etapa,
    etapaNombre: NOMBRE_ETAPA[etapa],
    sede: sede(p.company_id),
    moneda: moneda(p.currency_id),
    subtotal: redondear(p.amount_untaxed),
    total: redondear(p.amount_total),
    vendedor: p.user_id ? String(p.user_id[1]) : "",
  };
};

export interface FiltroPedidos { sede?: string; etapa?: string; q?: string; pagina?: number }
const POR_PAGINA = 20;

export async function pedidosDe(c: ClienteOdoo, f: FiltroPedidos) {
  const companias = f.sede ? COMPANIAS_TIENDA.filter((id) => SEDE_DE_COMPANIA[id].id === f.sede) : COMPANIAS_TIENDA;
  const dominio: any[] = [["partner_id", "child_of", c.partners], ["company_id", "in", companias]];
  if (f.etapa === "cotizacion") dominio.push(["state", "in", ["draft", "sent"]]);
  else if (f.etapa === "anulado") dominio.push(["state", "=", "cancel"]);
  else if (f.etapa === "abiertos") dominio.push(["state", "=", "sale"], ["invoice_status", "!=", "invoiced"]);
  else if (f.etapa === "facturado") dominio.push(["state", "=", "sale"], ["invoice_status", "=", "invoiced"]);
  else dominio.push(["state", "!=", "cancel"]);
  const q = String(f.q || "").trim().slice(0, 40);
  if (q) dominio.push("|", ["name", "ilike", q], ["client_order_ref", "ilike", q]);
  const pagina = Math.max(1, Math.min(500, Number(f.pagina) || 1));
  const [total, filas] = await Promise.all([
    contar("sale.order", dominio),
    leerPedidos(dominio, { order: "date_order desc, id desc", limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
  ]);
  return { total: Number(total) || 0, pagina, porPagina: POR_PAGINA, pedidos: filas.map(pedidoCorto) };
}

/** Un pedido con sus líneas, sus facturas y sus despachos. null = no es de este cliente. */
export async function pedidoDe(c: ClienteOdoo, id: number) {
  const [p] = await leerPedidos([["id", "=", id], ["partner_id", "child_of", c.partners]], { limit: 1 });
  if (!p) return null;
  const [lineas, facturas, despachos] = await Promise.all([
    leer<any[]>("sale.order.line", [["order_id", "=", id], ["display_type", "=", false]], {
      fields: ["id", "product_id", "product_template_id", "name", "product_uom_qty", "qty_delivered", "qty_invoiced", "price_unit", "discount", "price_subtotal", "price_total"],
      order: "sequence asc, id asc",
    }),
    leer<any[]>("account.move", [["invoice_origin", "=", p.name], ["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["partner_id", "child_of", c.partners]], {
      fields: ["id", "name", "invoice_date", "amount_total_signed", "move_type"], order: "invoice_date desc",
    }),
    leer<any[]>("stock.picking", [["sale_id", "=", id], ["picking_type_code", "=", "outgoing"]], {
      fields: ["id", "name", "state", "date_done", "scheduled_date"], order: "id desc",
    }).catch(() => []),
  ]);
  // El código de cada producto, para «Repetir pedido» (la cotización va por código).
  const productos = [...new Set((lineas || []).map((l) => l.product_id?.[0]).filter(Boolean))];
  const codigos = new Map<number, string>();
  if (productos.length) {
    const prods = await leer<any[]>("product.product", [["id", "in", productos]], { fields: ["id", "default_code"], context: { ...CONTEXTO, active_test: false } });
    for (const x of prods || []) if (x.default_code) codigos.set(x.id, String(x.default_code).trim());
  }
  const ESTADO_DESPACHO: Record<string, string> = { draft: "Preparando", waiting: "Esperando mercancía", confirmed: "Esperando mercancía", assigned: "Listo para salir", done: "Despachado", cancel: "Anulado" };
  return {
    ...pedidoCorto(p),
    lineas: (lineas || []).map((l) => ({
      productoId: l.product_template_id?.[0] || null,
      codigo: codigos.get(l.product_id?.[0]) || "",
      // Nombre legible (Odoo lo trae en mayúsculas), sin el [código] de adelante: el código va aparte.
      descripcion: nombreBonito(String(l.name || l.product_id?.[1] || "").split("\n")[0].replace(/^\[[^\]]+\]\s*/, "")),
      cantidad: Number(l.product_uom_qty) || 0,
      despachado: Number(l.qty_delivered) || 0,
      facturado: Number(l.qty_invoiced) || 0,
      precio: redondear(l.price_unit),
      descuento: Number(l.discount) || 0,
      subtotal: redondear(l.price_subtotal),
      total: redondear(l.price_total),
    })),
    facturas: (facturas || []).map((x) => ({ id: x.id, numero: x.name, fecha: x.invoice_date || "", total: redondear(x.amount_total_signed), nota: x.move_type === "out_refund" })),
    despachos: (despachos || []).filter((d) => d.state !== "cancel").map((d) => ({ numero: d.name, estado: ESTADO_DESPACHO[d.state] || d.state, fecha: String(d.date_done || d.scheduled_date || "").slice(0, 10) })),
  };
}

/* ------------------------------------------------------------------ Facturas y estado de cuenta */
export interface FiltroFacturas { sede?: string; estado?: string; q?: string; pagina?: number }

/**
 * Facturas y notas de crédito publicadas del cliente (montos en la moneda de la sede, USD, con los campos
 * *_signed: la NC resta) y el estado de cuenta por sede: lo que debe y lo vencido. Las pagadas, del último año.
 */
export async function facturasDe(c: ClienteOdoo, f: FiltroFacturas) {
  const hoy = hoyCaracas();
  const haceUnAno = `${Number(hoy.slice(0, 4)) - 1}${hoy.slice(4)}`;
  const base: any[] = [["partner_id", "child_of", c.partners], ["move_type", "in", ["out_invoice", "out_refund"]], ["state", "=", "posted"], ["company_id", "in", COMPANIAS_TIENDA]];
  const campos = ["id", "name", "move_type", "invoice_date", "invoice_date_due", "amount_total_signed", "amount_residual_signed", "payment_state", "company_id", "invoice_origin", "ref"];
  // Lo abierto entero (para el estado de cuenta) y lo pagado del último año.
  const [abiertas, pagadas] = await Promise.all([
    leer<any[]>("account.move", [...base, ["amount_residual", "!=", 0]], { fields: campos, order: "invoice_date desc, id desc", limit: 2000 }),
    leer<any[]>("account.move", [...base, ["amount_residual", "=", 0], ["invoice_date", ">=", haceUnAno]], { fields: campos, order: "invoice_date desc, id desc", limit: 1000 }),
  ]);
  const todas = [...(abiertas || []), ...(pagadas || [])].map((x) => {
    const estado = estadoFactura({ move_type: x.move_type, payment_state: x.payment_state, amount_residual: x.amount_residual_signed, invoice_date_due: x.invoice_date_due }, hoy);
    return {
      id: x.id,
      numero: x.name,
      pedido: x.invoice_origin || "",
      fecha: x.invoice_date || "",
      vence: x.invoice_date_due || "",
      atraso: estado === "vencida" ? diasDeAtraso(x.invoice_date_due, hoy) : null,
      sede: sede(x.company_id),
      total: redondear(x.amount_total_signed),
      saldo: redondear(x.amount_residual_signed),
      estado,
      estadoNombre: NOMBRE_ESTADO_FACTURA[estado],
    };
  });

  // Estado de cuenta por sede (con todo lo abierto, sin filtros).
  const cuenta = new Map<string, { sede: { id: string; nombre: string }; saldo: number; vencido: number; facturasAbiertas: number; masVieja: number }>();
  for (const x of todas) {
    if (!x.saldo) continue;
    const k = x.sede.id || x.sede.nombre;
    const s = cuenta.get(k) ?? { sede: x.sede, saldo: 0, vencido: 0, facturasAbiertas: 0, masVieja: 0 };
    s.saldo += x.saldo;
    if (x.estado === "vencida") { s.vencido += x.saldo; s.masVieja = Math.max(s.masVieja, x.atraso || 0); }
    if (x.saldo > 0) s.facturasAbiertas += 1;
    cuenta.set(k, s);
  }

  const q = String(f.q || "").trim().toLowerCase();
  const filtradas = todas.filter((x) =>
    (!f.sede || x.sede.id === f.sede)
    && (!f.estado || (f.estado === "abiertas" ? x.saldo > 0 : x.estado === f.estado))
    && (!q || x.numero.toLowerCase().includes(q) || x.pedido.toLowerCase().includes(q)));
  const pagina = Math.max(1, Math.min(500, Number(f.pagina) || 1));
  return {
    estadoDeCuenta: [...cuenta.values()].map((s) => ({ ...s, saldo: redondear(s.saldo), vencido: redondear(s.vencido) })),
    total: filtradas.length,
    pagina,
    porPagina: POR_PAGINA,
    facturas: filtradas.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA),
  };
}

/** Resumen para la portada de la cuenta: pedidos abiertos, últimos pedidos y estado de cuenta. */
export async function resumenDe(c: ClienteOdoo) {
  const [abiertos, ultimos, facturas] = await Promise.all([
    contar("sale.order", [["partner_id", "child_of", c.partners], ["company_id", "in", COMPANIAS_TIENDA], ["state", "=", "sale"], ["invoice_status", "!=", "invoiced"]]),
    leerPedidos([["partner_id", "child_of", c.partners], ["company_id", "in", COMPANIAS_TIENDA], ["state", "!=", "cancel"]], { order: "date_order desc, id desc", limit: 5 }),
    facturasDe(c, { estado: "abiertas" }),
  ]);
  return { pedidosAbiertos: Number(abiertos) || 0, ultimosPedidos: ultimos.map(pedidoCorto), estadoDeCuenta: facturas.estadoDeCuenta };
}
