/**
 * Servicio técnico desde «Mi cuenta» de la tienda web: el mismo reporte del portal público
 * (servicio.supricom.com.ve) pero sin pedir número de factura ni RIF, porque ya se sabe quién es el
 * cliente. Elige una factura suya, ve sus productos con serial y garantía (`buscarFacturaConSeriales`,
 * la misma función del portal) y el caso se crea con `crearCasoPortal`, igual que en el portal:
 * origen 'portal' con tracking_token, así le llegan los correos de cada cambio y lo puede seguir.
 *
 * La factura SIEMPRE se resuelve por id y se comprueba que sea de sus empresas (`partner_id child_of`),
 * porque `buscarFacturaConSeriales` sin RIF no revisa de quién es. Solo facturas de Odoo (las de Smartbit,
 * antes de abril de 2026, se reportan en el portal con el número y el RIF).
 */
import { callOdooRPCEstricto } from "@/lib/odoo";
import { query } from "@/lib/db";
import { buscarFacturaConSeriales, type FacturaConItems, type ItemFactura } from "@/lib/servicio-tecnico/factura";
import { crearCasoPortal } from "@/lib/servicio-tecnico/crearCaso";
import { SLUGS_SUCURSAL } from "@/lib/servicio-tecnico/sucursales";
import { productosPublicos } from "@/lib/rma/items";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { nombreBonito } from "@/lib/tienda-web/tipos";
import type { ClienteOdoo } from "./odoo";
import { COMPANIAS_TIENDA, SEDE_DE_COMPANIA } from "./tipos";

const CONTEXTO = { allowed_company_ids: COMPANIAS_TIENDA };
const leer = <T = any[]>(modelo: string, dominio: any[], kwargs: Record<string, any>) =>
  callOdooRPCEstricto<T>(modelo, "search_read", [dominio], { context: CONTEXTO, ...kwargs });

/** Lo que ve el cliente de cada estado (los mismos textos del portal, messages/es.json servicioTecnico.status_*). */
export const ESTADO_PARA_CLIENTE: Record<string, { texto: string; tono: string }> = {
  por_llegar: { texto: "Reporte recibido — esperando tu equipo", tono: "espera" },
  en_diagnostico: { texto: "Recibimos tu equipo — en diagnóstico", tono: "proceso" },
  en_reparacion: { texto: "En reparación", tono: "proceso" },
  recibido: { texto: "Recibido — lo estamos revisando", tono: "proceso" },
  reingresado: { texto: "Reingresado a revisión", tono: "proceso" },
  nc_revision: { texto: "Recibido — lo estamos revisando", tono: "proceso" },
  reparado: { texto: "Reparado — listo para retirar / entregar", tono: "listo" },
  nota_credito: { texto: "Aprobada la nota de crédito", tono: "listo" },
  no_procesado: { texto: "Requiere tu atención (contactar a Supricom)", tono: "alerta" },
};

/** Enlace de seguimiento del portal (el que también llega por correo). */
export function enlaceSeguimiento(companyId: number, token: string | null): string | null {
  const slug = SLUGS_SUCURSAL[companyId];
  if (!slug || !token) return null;
  const host = String(process.env.PORTAL_HOSTS || "servicio.supricom.com.ve").split(",")[0].trim();
  return `https://${host}/es/servicio-tecnico/${slug}/consultar?token=${encodeURIComponent(token)}`;
}

/* ------------------------------------------------------------------ Facturas para elegir */
const POR_PAGINA = 15;

/** Sus facturas de Odoo de los últimos 3 años (lo que puede estar en garantía), de la más nueva a la más vieja. */
export async function facturasParaReportar(c: ClienteOdoo, f: { q?: string; pagina?: number }) {
  const hoy = hoyCaracas();
  const desde = `${Number(hoy.slice(0, 4)) - 3}${hoy.slice(4)}`;
  const dominio: any[] = [
    ["partner_id", "child_of", c.partners], ["move_type", "=", "out_invoice"], ["state", "=", "posted"],
    ["company_id", "in", COMPANIAS_TIENDA], ["invoice_date", ">=", desde],
    // La factura migrada de Smartbit no trae los productos reales.
    ["ref", "not ilike", "Importación Masiva"],
  ];
  const q = String(f.q || "").trim().slice(0, 40);
  if (q) dominio.push("|", ["name", "ilike", q], ["invoice_origin", "ilike", q]);
  const pagina = Math.max(1, Math.min(200, Number(f.pagina) || 1));
  const [total, filas] = await Promise.all([
    callOdooRPCEstricto<number>("account.move", "search_count", [dominio], { context: CONTEXTO }),
    leer<any[]>("account.move", dominio, {
      fields: ["id", "name", "invoice_date", "company_id", "invoice_origin", "invoice_line_ids"],
      order: "invoice_date desc, id desc", limit: POR_PAGINA, offset: (pagina - 1) * POR_PAGINA,
    }),
  ]);
  return {
    total: Number(total) || 0, pagina, porPagina: POR_PAGINA,
    facturas: (filas || []).map((x) => ({
      id: x.id, numero: x.name, fecha: x.invoice_date || "", pedido: x.invoice_origin || "",
      sede: SEDE_DE_COMPANIA[x.company_id?.[0]] || { id: "", nombre: x.company_id?.[1] || "" },
    })),
  };
}

/** La factura (por id) si es del cliente, ya resuelta con sus productos, seriales y garantía. */
async function facturaDelCliente(c: ClienteOdoo, id: number): Promise<{ resultado: FacturaConItems; cid: number } | null> {
  const [m] = (await leer<any[]>("account.move", [
    ["id", "=", id], ["partner_id", "child_of", c.partners], ["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["company_id", "in", COMPANIAS_TIENDA],
  ], { fields: ["id", "name", "company_id"], limit: 1 })) || [];
  if (!m) return null;
  const cid = m.company_id?.[0];
  const r = await buscarFacturaConSeriales(String(m.name), undefined, cid);
  // Se busca por el nombre exacto en su sede: si Odoo devolviera otra cosa, no se arriesga.
  if (r.estado !== "ok" || r.factura.numero !== m.name) return null;
  return { resultado: r, cid };
}

const itemParaCliente = (i: ItemFactura) => ({
  id: i.id,
  productoId: i.producto_id || null,
  codigo: i.codigo,
  nombre: nombreBonito(i.nombre, i.marca),
  marca: i.marca,
  serial: i.serial,
  llevaSerial: i.lleva_serial,
  garantia: { estado: i.garantia?.estado || "indeterminada", vence: i.garantia?.fecha_vencimiento ? i.garantia.fecha_vencimiento.slice(0, 10) : "", meses: i.garantia?.meses_cubiertos ?? null, dias: i.garantia?.dias_restantes ?? null },
  yaReportado: i.ya_reportado,
  caso: i.rma_case_number,
});

/** Los productos de una factura suya, para elegir cuál falla. null = no es suya. */
export async function productosDeFactura(c: ClienteOdoo, id: number) {
  const f = await facturaDelCliente(c, id);
  if (!f) return null;
  return {
    factura: { id, numero: f.resultado.factura.numero, fecha: f.resultado.factura.fecha, sede: SEDE_DE_COMPANIA[f.cid] },
    productos: f.resultado.items.map(itemParaCliente),
  };
}

/* ------------------------------------------------------------------ Crear el caso */
export interface PedidoReporte { itemId: string; serialManual: string; falla: string; uploadToken: string }
export type ResultadoReporte =
  | { ok: true; numero: string; seguimiento: string | null }
  | { ok: false; error: string; status?: number };

const MAX_PRODUCTOS = 10;

/** Mismas reglas del portal: producto de esa factura, serial a mano si Odoo no lo tiene, falla y al menos un adjunto. */
export async function reportarFalla(c: ClienteOdoo, facturaId: number, pedidos: PedidoReporte[], telefono: string): Promise<ResultadoReporte> {
  if (!pedidos.length || pedidos.length > MAX_PRODUCTOS) return { ok: false, error: `Elige de 1 a ${MAX_PRODUCTOS} productos.` };
  if (new Set(pedidos.map((p) => p.itemId)).size !== pedidos.length || new Set(pedidos.map((p) => p.uploadToken)).size !== pedidos.length) {
    return { ok: false, error: "Hay un producto repetido en el reporte." };
  }
  const f = await facturaDelCliente(c, facturaId);
  if (!f) return { ok: false, error: "No encontramos esa factura en tu cuenta.", status: 404 };
  const elegidos = [];
  for (const p of pedidos) {
    const matched = f.resultado.items.find((i) => i.id === p.itemId);
    if (!matched) return { ok: false, error: "Ese producto no es de esta factura. Vuelve a elegirlo." };
    if (p.falla.length < 10) return { ok: false, error: `Cuéntanos con más detalle qué le pasa a ${matched.nombre}.` };
    if (matched.lleva_serial && !matched.serial && !p.serialManual) return { ok: false, error: `Necesitamos el serial de ${matched.nombre} para identificarlo.` };
    const adjuntos = await query("SELECT COUNT(*) AS total FROM rma_ticket_adjuntos WHERE tracking_token = ? AND ticket_id IS NULL", [p.uploadToken]);
    if (!p.uploadToken || Number((adjuntos.rows as any[])?.[0]?.total || 0) === 0) return { ok: false, error: `Adjunta al menos una foto o un video de ${matched.nombre}.` };
    // Manda el serial de Odoo; el escrito a mano solo rellena el hueco.
    elegidos.push({ matched, falla: p.falla, uploadToken: p.uploadToken, serialFinal: matched.serial || p.serialManual || null });
  }
  const caso = await crearCasoPortal({
    resultado: f.resultado,
    elegidos,
    telefono: telefono || null,
    facturaEscrita: f.resultado.factura.numero,
    nota: "Caso creado desde Mi cuenta (tienda web)",
  });
  return { ok: true, numero: caso.caseNumber, seguimiento: enlaceSeguimiento(f.cid, caso.trackingToken) };
}

/* ------------------------------------------------------------------ Sus casos */
/**
 * Los casos de sus empresas: los que tienen como cliente alguno de sus contactos en Odoo (los del portal y
 * «Mi cuenta» guardan el partner de la factura). Los 40 más recientes, con sus productos y su estado.
 */
export async function casosDe(c: ClienteOdoo) {
  const ids = await callOdooRPCEstricto<number[]>("res.partner", "search", [[["id", "child_of", c.partners]]], { context: { ...CONTEXTO, active_test: false }, limit: 1000 });
  const partners = (ids || []).filter((x) => Number.isInteger(x));
  if (!partners.length) return [];
  const marcas = partners.map(() => "?").join(",");
  const r = await query(
    `SELECT id, case_number, status, created_at, model, hardware, serial, invoice_number, company_id, origen, tracking_token
       FROM rma_cases WHERE odoo_partner_id IN (${marcas}) ORDER BY created_at DESC, id DESC LIMIT 40`,
    partners,
  );
  const filas = (r.rows as any[]) || [];
  return Promise.all(filas.map(async (x) => {
    const productos = await productosPublicos(Number(x.id));
    const estado = ESTADO_PARA_CLIENTE[x.status] || { texto: String(x.status || ""), tono: "proceso" };
    return {
      numero: String(x.case_number),
      fecha: x.created_at ? new Date(x.created_at).toISOString().slice(0, 10) : "",
      estado: String(x.status || ""),
      estadoTexto: estado.texto,
      tono: estado.tono,
      factura: String(x.invoice_number || ""),
      sede: SEDE_DE_COMPANIA[Number(x.company_id)] || { id: "", nombre: "" },
      productos: (productos.length ? productos : [{ nombre: x.model || x.hardware || "", serial: x.serial || null }]).map((p) => ({ nombre: p.nombre, serial: p.serial })),
      seguimiento: x.origen === "portal" ? enlaceSeguimiento(Number(x.company_id), x.tracking_token) : null,
    };
  }));
}
