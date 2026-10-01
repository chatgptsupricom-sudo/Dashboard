import { callOdooRPC } from "@/lib/odoo";

/**
 * Ventas intercompañía: facturas y cotizaciones entre empresas del grupo
 * (Valencia le factura a Caracas, Panamá a Supricom USA / Supricom LLC, etc.).
 *
 * No son venta a un cliente: en sep-2026 Valencia le facturó $1,56M a
 * SUPRICOM CCS 21 (~45% de su facturación) y Panamá $951k a SUPRICOM USA y
 * SUPRICOM, LLC (~62%). Contarlas inflaba la sede que vende y volvía a contar
 * la mercancía cuando la otra sede se la vende al cliente final. En Valencia y
 * Caracas las emite "Asistente de Ventas" / "Asistente de Ventas CCS", pero en
 * Panamá salen a nombre de un vendedor (Hercilio Camacho), así que filtrar por
 * vendedor no alcanza.
 *
 * La usan el Stoplight (`lib/stoplight/*`, grilla y modales) y Metas por
 * marca (`lib/metas-marca/odoo.ts`): una sola detección para que las dos
 * secciones no diverjan.
 */

/**
 * Se cachea la promesa (no el resultado): las consultas que llegan mientras la
 * primera sigue en vuelo la comparten (el Stoplight llama a sinIntercompania()
 * varias veces por request y Metas por marca ~18 veces en frío con todas las
 * sedes × 6 meses). Si la lectura falla, la entrada se borra para no cachear
 * el error.
 */
let cacheIC: { vence: number; valor: Promise<Map<number, string>> } | null = null;

/**
 * Contactos (empresa comercial) que son del grupo: las propias empresas del
 * Odoo y los clientes creados con su nombre o RIF en cada sede (en Odoo hay un
 * "SUPRICOM CCS 21, C.A." distinto por empresa, ninguno es el partner de la
 * compañía). Se compara contra `commercial_partner_id`, así los contactos
 * hijos también quedan fuera.
 *
 * Incluye SUPRICOM USA, LLC y SUPRICOM, LLC (EE. UU.), que no son empresas en
 * este Odoo pero sí del grupo (confirmado 2026-09-28): son el grueso de lo
 * que factura Panamá (62% en sep-2026).
 *
 * Los RIF van sin guiones y recortados: en Odoo están escritos de varias
 * formas ("87-1576706", "J-31163115-1", "RUC155595002").
 */
export function partnersIntercompania(refrescar = false): Promise<Map<number, string>> {
  if (!refrescar && cacheIC && cacheIC.vence > Date.now()) return cacheIC.valor;
  const valor = leerIntercompania();
  const entrada = { vence: Date.now() + 30 * 60 * 1000, valor };
  cacheIC = entrada;
  valor.catch(() => { if (cacheIC === entrada) cacheIC = null; });
  return valor;
}

async function leerIntercompania(): Promise<Map<number, string>> {
  const [partners, empresas] = await Promise.all([
    callOdooRPC<any[]>("res.partner", "search_read", [[
      "|", "|", "|", "|", "|", "|",
      ["name", "ilike", "supricom"],
      ["name", "ilike", "office solutions center"],
      ["name", "ilike", "ofimaster"],
      ["vat", "ilike", "501193738"],
      ["vat", "ilike", "31163115"],
      ["vat", "ilike", "155595002"],
      ["vat", "ilike", "1576706"],
    ]], { fields: ["id", "name"], limit: 0, context: { active_test: false } }),
    callOdooRPC<any[]>("res.company", "search_read", [[]], { fields: ["partner_id"], limit: 0 }),
  ]);
  if (!Array.isArray(partners) || !Array.isArray(empresas)) throw new Error("Odoo no respondió los contactos intercompañía");
  const mapa = new Map<number, string>();
  for (const p of partners) mapa.set(p.id, p.name || "");
  for (const e of empresas) if (e.partner_id) mapa.set(e.partner_id[0], e.partner_id[1] || "");
  return mapa;
}

/**
 * Término de dominio que deja fuera la intercompañía. `campo` es la ruta al
 * partner comercial desde el modelo consultado:
 * - `account.move` y `res.partner`: "commercial_partner_id" (default).
 * - `sale.order`: "partner_id.commercial_partner_id".
 */
export async function sinIntercompania(campo = "commercial_partner_id"): Promise<any[]> {
  const ic = await partnersIntercompania();
  return [campo, "not in", [...ic.keys()]];
}
