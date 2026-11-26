/**
 * Precios para el cliente con sesión en la tienda web: los de **su** lista de precios de Odoo en la sede que está
 * viendo (`property_product_pricelist` de su ficha en esa sede; si la que tiene guardada está archivada, Odoo da
 * la que le corresponde). Sin sesión no hay precios: la página es pública. Solo lectura.
 *
 * Todas las listas de las tiendas son de precio fijo por producto o por variante (nov-2026); un producto sin
 * precio en su lista se cotiza con el vendedor. La lista entera se lee una vez y queda 10 min en memoria.
 */
import { callOdooRPCEstricto } from "@/lib/odoo";
import { cachear, hoyCaracas } from "@/lib/compras/datosOdoo";
import type { ClienteOdoo } from "./odoo";
import { COMPANIAS_TIENDA, preciosDeLista, SEDE_DE_COMPANIA, type ItemLista } from "./tipos";

const ctx = (cid: number) => ({ allowed_company_ids: [cid, ...COMPANIAS_TIENDA.filter((c) => c !== cid)], lang: "es_VE" });

export type PreciosCliente =
  | { ok: true; sede: string; lista: string; moneda: string; precios: Record<number, number> }
  | { ok: false; sede: string; motivo: "sin_ficha" | "sin_lista" };

/** La lista entera, por id: precio de cada product.template. */
function preciosDeLaLista(lista: number, cid: number): Promise<{ moneda: string; precios: Record<number, number> }> {
  return cachear(`tienda-web|precios|${lista}|${cid}`, async () => {
    const [cabecera] = (await callOdooRPCEstricto<any[]>("product.pricelist", "read", [[lista], ["currency_id"]], { context: ctx(cid) })) || [];
    const items = (await callOdooRPCEstricto<ItemLista[]>("product.pricelist.item", "search_read", [[
      ["pricelist_id", "=", lista], ["compute_price", "=", "fixed"], ["fixed_price", ">", 0], ["applied_on", "in", ["1_product", "0_product_variant"]],
    ]], { fields: ["applied_on", "product_tmpl_id", "product_id", "fixed_price", "min_quantity", "date_start", "date_end"], context: ctx(cid) })) || [];
    const variantes = [...new Set(items.filter((i) => i.applied_on === "0_product_variant" && i.product_id).map((i) => (i.product_id as [number, string])[0]))];
    const plantillaDe = new Map<number, number>();
    for (let i = 0; i < variantes.length; i += 1000) {
      const filas = (await callOdooRPCEstricto<any[]>("product.product", "read", [variantes.slice(i, i + 1000), ["product_tmpl_id"]], { context: { ...ctx(cid), active_test: false } })) || [];
      for (const f of filas) if (f.product_tmpl_id) plantillaDe.set(f.id, f.product_tmpl_id[0]);
    }
    return { moneda: String(cabecera?.currency_id?.[1] || "USD"), precios: preciosDeLista(items, plantillaDe, hoyCaracas()) };
  });
}

export async function preciosDe(c: ClienteOdoo, sede: string): Promise<PreciosCliente> {
  const cid = COMPANIAS_TIENDA.find((id) => SEDE_DE_COMPANIA[id].id === sede) ?? 9;
  const sedeId = SEDE_DE_COMPANIA[cid].id;
  // Su ficha en esa sede (las que puede ver al entrar). Si no compra en esa sede, no hay lista que mostrarle.
  const fichas = (await callOdooRPCEstricto<any[]>("res.partner", "read", [c.partners, ["company_id", "property_product_pricelist"]], { context: ctx(cid) })) || [];
  const enLaSede = fichas.filter((f) => Number(f.company_id?.[0]) === cid);
  if (!enLaSede.length) return { ok: false, sede: sedeId, motivo: "sin_ficha" };
  const conLista = enLaSede.find((f) => f.property_product_pricelist);
  if (!conLista) return { ok: false, sede: sedeId, motivo: "sin_lista" };
  const [lista, nombre] = conLista.property_product_pricelist as [number, string];
  const { moneda, precios } = await preciosDeLaLista(lista, cid);
  return { ok: true, sede: sedeId, lista: nombre, moneda, precios };
}
