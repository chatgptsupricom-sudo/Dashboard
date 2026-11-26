/**
 * «Mi cuenta» de la tienda web: lo que se lee de Odoo para un cliente. Solo lectura y siempre acotado a
 * sus empresas (`partner_id child_of` sus partners comerciales), en las tres sedes.
 */
import { callOdooRPCEstricto } from "@/lib/odoo";
import { cachear, hoyCaracas } from "@/lib/compras/datosOdoo";
import { nombreBonito } from "@/lib/tienda-web/tipos";
import {
  claveDocumento, COMPANIAS_TIENDA, nucleoDocumento, diasDeAtraso, esCorreoInterno, estadoFactura, etapaPedido, NOMBRE_ESTADO_FACTURA,
  NOMBRE_ETAPA, redondear, SEDE_DE_COMPANIA, TRAMOS_DEUDA, tramoDeuda, avanceDespacho, type TramoDeuda,
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
const CAMPOS_PEDIDO = ["id", "name", "date_order", "state", "invoice_status", "amount_untaxed", "amount_total", "currency_id", "company_id", "user_id", "client_order_ref", "validity_date"];

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

/**
 * Lo que la lista muestra de cada pedido además de su cabecera: cuántos productos y unidades, cuánto se ha
 * despachado y las fotos de los primeros productos (plantillas, para /web/image de la tienda).
 */
async function conLineas(pedidos: any[]) {
  const ids = pedidos.map((p) => p.id);
  const lineas = ids.length
    ? await leer<any[]>("sale.order.line", [["order_id", "in", ids], ["display_type", "=", false]], {
      fields: ["order_id", "product_template_id", "product_uom_qty", "qty_delivered"], order: "order_id asc, sequence asc, id asc", limit: 3000,
    })
    : [];
  const porPedido = new Map<number, any[]>();
  for (const l of lineas || []) {
    const k = l.order_id?.[0];
    if (!porPedido.has(k)) porPedido.set(k, []);
    porPedido.get(k)!.push(l);
  }
  return pedidos.map((p) => {
    const ls = porPedido.get(p.id) || [];
    const fotos = [...new Set(ls.map((l) => l.product_template_id?.[0]).filter(Boolean))].slice(0, 3) as number[];
    return {
      ...pedidoCorto(p),
      productos: ls.length,
      unidades: ls.reduce((a, l) => a + (Number(l.product_uom_qty) || 0), 0),
      avance: avanceDespacho(ls.map((l) => ({ cantidad: Number(l.product_uom_qty) || 0, despachado: Number(l.qty_delivered) || 0 }))),
      fotos,
    };
  });
}

const DOMINIO_ETAPA: Record<string, any[]> = {
  cotizacion: [["state", "in", ["draft", "sent"]]],
  abiertos: [["state", "=", "sale"], ["invoice_status", "!=", "invoiced"]],
  facturado: [["state", "=", "sale"], ["invoice_status", "=", "invoiced"]],
  anulado: [["state", "=", "cancel"]],
};

export async function pedidosDe(c: ClienteOdoo, f: FiltroPedidos) {
  const companias = f.sede ? COMPANIAS_TIENDA.filter((id) => SEDE_DE_COMPANIA[id].id === f.sede) : COMPANIAS_TIENDA;
  const base: any[] = [["partner_id", "child_of", c.partners], ["company_id", "in", companias]];
  const q = String(f.q || "").trim().slice(0, 40);
  if (q) base.push("|", ["name", "ilike", q], ["client_order_ref", "ilike", q]);
  const dominio = [...base, ...(DOMINIO_ETAPA[f.etapa || ""] || [["state", "!=", "cancel"]])];
  const pagina = Math.max(1, Math.min(500, Number(f.pagina) || 1));
  // Cuántos hay en cada estado (con la sede y la búsqueda de ahora), para los filtros.
  const etapas = ["", ...Object.keys(DOMINIO_ETAPA)];
  const [total, filas, ...cuentas] = await Promise.all([
    contar("sale.order", dominio),
    leerPedidos(dominio, { order: "date_order desc, id desc", limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA }),
    ...etapas.map((e) => contar("sale.order", [...base, ...(DOMINIO_ETAPA[e] || [["state", "!=", "cancel"]])])),
  ]);
  return {
    total: Number(total) || 0, pagina, porPagina: POR_PAGINA,
    porEtapa: Object.fromEntries(etapas.map((e, i) => [e || "todos", Number(cuentas[i]) || 0])),
    pedidos: await conLineas(filas),
  };
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
    // Cotización: «enRevision» = borrador (su vendedor la revisa); «aceptable» = su vendedor se la envió con los
    // precios finales y la puede aceptar desde Mi cuenta (lib/tienda-web/clientes/seguimiento.ts).
    enRevision: p.state === "draft",
    aceptable: p.state === "sent",
    validaHasta: p.validity_date ? String(p.validity_date).slice(0, 10) : "",
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

  // Estado de cuenta por sede (con todo lo abierto, sin filtros): saldo, vencido, antigüedad y lo próximo a vencer.
  type Cuenta = {
    sede: { id: string; nombre: string }; saldo: number; vencido: number; facturasAbiertas: number; masVieja: number;
    tramos: Record<TramoDeuda, number>; proximos: { numero: string; vence: string; saldo: number }[];
  };
  const cuenta = new Map<string, Cuenta>();
  for (const x of todas) {
    if (!x.saldo) continue;
    const k = x.sede.id || x.sede.nombre;
    const s = cuenta.get(k) ?? {
      sede: x.sede, saldo: 0, vencido: 0, facturasAbiertas: 0, masVieja: 0, proximos: [],
      tramos: Object.fromEntries(TRAMOS_DEUDA.map((t) => [t.id, 0])) as Record<TramoDeuda, number>,
    };
    s.saldo += x.saldo;
    if (x.estado === "vencida") { s.vencido += x.saldo; s.masVieja = Math.max(s.masVieja, x.atraso || 0); }
    if (x.saldo > 0) {
      s.facturasAbiertas += 1;
      s.tramos[tramoDeuda(x.atraso)] += x.saldo;
      if (x.estado !== "vencida" && x.vence) s.proximos.push({ numero: x.numero, vence: x.vence, saldo: x.saldo });
    }
    cuenta.set(k, s);
  }

  const q = String(f.q || "").trim().toLowerCase();
  const filtradas = todas.filter((x) =>
    (!f.sede || x.sede.id === f.sede)
    && (!f.estado || (f.estado === "abiertas" ? x.saldo > 0 : x.estado === f.estado))
    && (!q || x.numero.toLowerCase().includes(q) || x.pedido.toLowerCase().includes(q)));
  const pagina = Math.max(1, Math.min(500, Number(f.pagina) || 1));
  return {
    estadoDeCuenta: [...cuenta.values()].map((s) => ({
      ...s,
      saldo: redondear(s.saldo),
      vencido: redondear(s.vencido),
      tramos: Object.fromEntries(Object.entries(s.tramos).map(([k, v]) => [k, redondear(v)])),
      proximos: s.proximos.sort((a, b) => a.vence.localeCompare(b.vence)).slice(0, 4),
    })),
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
  return { pedidosAbiertos: Number(abiertos) || 0, ultimosPedidos: await conLineas(ultimos), estadoDeCuenta: facturas.estadoDeCuenta };
}

/* ------------------------------------------------------------------ Perfil */
/** La dirección de una ficha como la ve el cliente: calle, calle 2, ciudad, estado y país (la usa también el paso a Odoo). */
export const direccion = (p: any) => [p.street, p.street2, p.city, p.state_id?.[1]?.replace(/\s*\([A-Z]{2}\)$/, ""), p.country_id?.[1]]
  .map((x) => String(x || "").replace(/\s+/g, " ").trim()).filter(Boolean).join(", ");

/**
 * Los datos de su empresa (solo lectura: para cambiarlos se le escribe al vendedor), y por cada sede donde
 * compra: su vendedor, su plazo de pago y su cupo de crédito (campos que en Odoo son por empresa), y sus
 * direcciones de entrega.
 */
export async function perfilDe(c: ClienteOdoo) {
  const campos = ["id", "name", "vat", "street", "street2", "city", "state_id", "country_id", "phone", "mobile", "email"];
  const [empresas, direcciones, porSede] = await Promise.all([
    leer<any[]>("res.partner", [["id", "in", c.partners]], { fields: campos }),
    leer<any[]>("res.partner", [["parent_id", "child_of", c.partners], ["type", "=", "delivery"], ["active", "=", true]], { fields: ["id", "name", "street", "street2", "city", "state_id", "country_id", "phone"], limit: 30 }),
    // Dónde compra: pedidos confirmados por sede.
    callOdooRPCEstricto<any[]>("sale.order", "read_group", [[["partner_id", "child_of", c.partners], ["state", "=", "sale"], ["company_id", "in", COMPANIAS_TIENDA]], ["company_id"], ["company_id"]], { context: CONTEXTO, lazy: false }),
  ]);
  const sedesConCompras = new Set((porSede || []).map((g: any) => g.company_id?.[0]).filter(Boolean));
  const sedes = [];
  for (const cid of COMPANIAS_TIENDA) {
    // Vendedor, plazo y cupo dependen de la empresa con la que se lee.
    const filas = await callOdooRPCEstricto<any[]>("res.partner", "read", [c.partners, ["user_id", "property_payment_term_id", "credit_limit"]], {
      context: { ...CONTEXTO, allowed_company_ids: [cid, ...COMPANIAS_TIENDA.filter((x) => x !== cid)] },
    }).catch(() => []);
    const f = (filas || []).find((x) => x.user_id) || (filas || [])[0];
    if (!sedesConCompras.has(cid) && !f?.user_id) continue;
    let vendedor = null as null | { nombre: string; correo: string; telefono: string };
    if (f?.user_id) {
      const [u] = (await leer<any[]>("res.users", [["id", "=", f.user_id[0]]], { fields: ["name", "email", "phone", "mobile"], limit: 1 }).catch(() => [])) || [];
      vendedor = { nombre: String(u?.name || f.user_id[1] || ""), correo: String(u?.email || ""), telefono: String(u?.mobile || u?.phone || "") };
    }
    sedes.push({
      sede: SEDE_DE_COMPANIA[cid],
      vendedor,
      plazo: f?.property_payment_term_id ? String(f.property_payment_term_id[1]) : "",
      cupo: redondear(Math.max(...(filas || []).map((x) => Number(x.credit_limit) || 0), 0)),
    });
  }
  const e = (empresas || [])[0] || {};
  return {
    empresa: {
      nombre: String(e.name || c.empresa), documento: String(e.vat || c.documento || ""), direccion: direccion(e),
      telefono: String(e.phone || e.mobile || ""), correo: String(e.email || ""),
    },
    sedes,
    direcciones: (direcciones || []).map((d) => ({ nombre: String(d.name || ""), direccion: direccion(d), telefono: String(d.phone || "") })).filter((d) => d.direccion),
  };
}

/**
 * Sus empresas en Odoo con su RIF/RUC, dirección y teléfono, y las direcciones de entrega de cada una: para
 * proponer el perfil la primera vez y para saber qué RIF ya tenemos registrados.
 */
export async function fichasDe(c: ClienteOdoo) {
  const [empresas, entregas] = await Promise.all([
    leer<any[]>("res.partner", [["id", "in", c.partners]], { fields: ["id", "name", "vat", "street", "street2", "city", "state_id", "country_id", "phone", "mobile"] }),
    leer<any[]>("res.partner", [["parent_id", "child_of", c.partners], ["type", "=", "delivery"], ["active", "=", true]], {
      fields: ["id", "name", "commercial_partner_id", "street", "street2", "city", "state_id", "country_id", "phone", "mobile"], limit: 60,
    }),
  ]);
  return (empresas || []).map((e) => ({
    nombre: String(e.name || ""),
    documento: String(e.vat || ""),
    direccion: direccion(e),
    telefono: String(e.phone || e.mobile || ""),
    entregas: (entregas || []).filter((d) => d.commercial_partner_id?.[0] === e.id)
      .map((d) => ({ nombre: String(d.name || ""), direccion: direccion(d), telefono: String(d.phone || d.mobile || "") }))
      .filter((d) => d.direccion),
  }));
}
