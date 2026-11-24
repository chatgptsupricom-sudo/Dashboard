import { callOdooRPCComo, callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Actualización de precios de Compras: el Excel de asignación por sede trae el
 * «precio definitivo» de cada SKU y aquí se lee y se pone en la lista de
 * precios principal de Valencia y de Caracas (en Odoo el precio de venta del
 * producto es 1 en casi todos: el precio real está en estas listas).
 */

/** Lista principal de cada sede: Valencia «Lista de Precios», Caracas «Lista de Precios O» (USD). */
export const LISTAS_PRECIOS = [
  { sede: 9, nombre: "Valencia", lista: 15866 },
  { sede: 10, nombre: "Caracas", lista: 15863 },
] as const;

const CONTEXTO = { context: { allowed_company_ids: [9, 10], active_test: true } };

export interface PrecioActual {
  codigo: string;
  /** null = el código no está en Odoo (o está repetido, ver `error`). */
  productoId: number | null;
  nombreOdoo: string;
  valencia: number | null;
  caracas: number | null;
  error?: string;
}

const m2oId = (v: any): number | null => (Array.isArray(v) ? v[0] : null);

async function plantillasPorCodigo(codigos: string[]) {
  const r =
    (await callOdooRPCEstricto<any[]>("product.template", "search_read", [[["default_code", "in", codigos]]], {
      fields: ["default_code", "name"],
      ...CONTEXTO,
    })) ?? [];
  const porCodigo = new Map<string, any[]>();
  for (const t of r) {
    const c = String(t.default_code || "").trim();
    porCodigo.set(c, [...(porCodigo.get(c) ?? []), t]);
  }
  return porCodigo;
}

/** Reglas de precio fijo (cantidad mínima ≤ 1) de las dos listas para esas plantillas. */
async function reglas(tmplIds: number[]) {
  if (!tmplIds.length) return [];
  return (
    (await callOdooRPCEstricto<any[]>(
      "product.pricelist.item",
      "search_read",
      [[
        ["pricelist_id", "in", LISTAS_PRECIOS.map((l) => l.lista)],
        ["product_tmpl_id", "in", tmplIds],
        ["compute_price", "=", "fixed"],
        ["min_quantity", "<=", 1],
      ]],
      { fields: ["pricelist_id", "product_tmpl_id", "fixed_price"], order: "id desc", ...CONTEXTO },
    )) ?? []
  );
}

export async function preciosActuales(codigos: string[]): Promise<PrecioActual[]> {
  const unicos = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))];
  const porCodigo = await plantillasPorCodigo(unicos);
  const tmplIds = [...porCodigo.values()].filter((ts) => ts.length === 1).map((ts) => ts[0].id);
  const items = await reglas(tmplIds);

  // La regla más nueva (order id desc) es la que se ve primero.
  const precio = new Map<string, number>();
  for (const i of items) {
    const k = `${m2oId(i.pricelist_id)}:${m2oId(i.product_tmpl_id)}`;
    if (!precio.has(k)) precio.set(k, Number(i.fixed_price) || 0);
  }
  const de = (lista: number, tmpl: number) => precio.get(`${lista}:${tmpl}`) ?? null;

  return unicos.map((codigo) => {
    const ts = porCodigo.get(codigo) ?? [];
    if (ts.length !== 1) {
      return {
        codigo, productoId: null, nombreOdoo: "", valencia: null, caracas: null,
        error: ts.length ? `El código está en ${ts.length} productos de Odoo` : "No está en Odoo",
      };
    }
    const t = ts[0];
    return {
      codigo, productoId: t.id, nombreOdoo: String(t.name || ""),
      valencia: de(LISTAS_PRECIOS[0].lista, t.id),
      caracas: de(LISTAS_PRECIOS[1].lista, t.id),
    };
  });
}

/**
 * Pone `precio` en las dos listas: cambia las reglas de precio fijo que ya
 * tiene el producto o, si no tiene, crea una. El producto se busca de nuevo
 * por código (no se confía en un id que mande la pantalla).
 */
export async function aplicarPrecio(
  codigo: string,
  precio: number,
  autor: { uid?: number; nombre: string; email: string },
  referencia = "",
) {
  const [actual] = await preciosActuales([codigo]);
  if (!actual?.productoId) throw new Error(actual?.error || "No está en Odoo");
  const tmpl = actual.productoId;
  const items = await reglas([tmpl]);
  const escribir = escritor(autor.uid);

  for (const l of LISTAS_PRECIOS) {
    const ids = items.filter((i) => m2oId(i.pricelist_id) === l.lista).map((i) => i.id);
    if (ids.length) {
      await escribir("product.pricelist.item", "write", [ids, { fixed_price: precio }], CONTEXTO);
    } else {
      await escribir(
        "product.pricelist.item",
        "create",
        [{ pricelist_id: l.lista, applied_on: "1_product", product_tmpl_id: tmpl, compute_price: "fixed", fixed_price: precio, min_quantity: 0 }],
        CONTEXTO,
      );
    }
  }

  // Con la key de la persona, la nota ya sale suya. Si no, el cambio queda a
  // nombre del usuario de la API: la nota sale con la persona como autor (su
  // contacto de Odoo) y dice quién fue.
  const antes = (v: number | null) => (v == null ? "sin precio" : `$${v}`);
  const nota = {
    body:
      `Precio en las listas de Valencia (${antes(actual.valencia)}) y Caracas (${antes(actual.caracas)}) cambiado a $${precio}` +
      `${referencia ? ` según ${referencia}` : ""}, desde el panel por ${autor.nombre || autor.email} (${autor.email}).`,
    message_type: "comment",
    subtype_xmlid: "mail.mt_note",
  };
  const partner = await partnerDeUsuario(autor.uid);
  try {
    await escribir("product.template", "message_post", [[tmpl]], partner ? { ...nota, author_id: partner } : nota);
  } catch (e: any) {
    try {
      if (!partner) throw e;
      await callOdooRPCEstricto("product.template", "message_post", [[tmpl]], nota);
    } catch (e2: any) {
      console.warn("[actualizacion-precios] sin nota en el chatter:", e2?.message);
    }
  }
}

/**
 * Con qué usuario de Odoo se escribe. Si quien está en sesión es el usuario de
 * `ODOO_COMPRAS_UID` y está su API key (`ODOO_COMPRAS_API_KEY`, generada desde
 * su usuario en Odoo), con la suya: «Última modificación por» queda a su
 * nombre. Cualquier otro, con la API del panel (`with_user` en una acción de
 * servidor no sirvió: el módulo account_dual_currency vuelve a escribir la
 * regla con el usuario de la llamada).
 */
export function escritor(uid: number | undefined) {
  const uidCompras = Number(process.env.ODOO_COMPRAS_UID) || 0;
  const key = process.env.ODOO_COMPRAS_API_KEY || "";
  if (uid && key && uid === uidCompras) {
    return (model: string, method: string, args: any[], kwargs: Record<string, any>) =>
      callOdooRPCComo({ uid, key }, model, method, args, kwargs);
  }
  return callOdooRPCEstricto;
}

/** Contacto (res.partner) del usuario de Odoo que inició sesión en el panel; undefined si no se puede leer. */
const partners = new Map<number, number | undefined>();
async function partnerDeUsuario(uid: number | undefined) {
  if (!uid) return undefined;
  if (!partners.has(uid)) {
    try {
      const u = await callOdooRPCEstricto<any[]>("res.users", "read", [[uid]], { fields: ["partner_id"] });
      partners.set(uid, m2oId(u?.[0]?.partner_id) ?? undefined);
    } catch {
      return undefined;
    }
  }
  return partners.get(uid);
}
