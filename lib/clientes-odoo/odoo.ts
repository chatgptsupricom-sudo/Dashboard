import { callOdooRPCEstricto } from "@/lib/odoo";
import { sinRetirados } from "@/lib/vendedores/retirados";
import { esNoVendedor } from "@/lib/cxc/vendedoresExcluidos";
import { claveRif, rifCompacto, type ClienteNuevo } from "./validar";

/**
 * Alta de clientes de Venezuela en Odoo desde el panel (Valencia y Caracas).
 * La validación está en `validar.ts`; aquí solo se lee y se crea.
 */

const VENEZUELA = 238;
const SEDES_VE = [9, 10];
const ETIQUETA_CLIENTE = 5;
const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "").replace(/\/+$/, "");

export const urlContacto = (id: number) => `${ODOO}/web#id=${id}&model=res.partner&view_type=form`;

export interface Coincidencia {
  id: number;
  nombre: string;
  comercial: string;
  rif: string;
  sede: number | null;
  sedeNombre: string;
  vendedor: string;
  url: string;
}

const m2o = (v: any): [number, string] | null => (Array.isArray(v) ? [v[0], v[1]] : null);

/** Fichas (empresa, no contactos hijos) de Valencia o Caracas con el mismo RIF/cédula. */
export async function buscarPorRif(rif: string): Promise<Coincidencia[]> {
  const clave = claveRif(rif);
  const numero = clave.slice(1);
  if (numero.length < 5) return [];
  const filas =
    (await callOdooRPCEstricto<any[]>(
      "res.partner",
      "search_read",
      [[["parent_id", "=", false], ["vat", "ilike", numero], "|", ["company_id", "in", SEDES_VE], ["company_id", "=", false]]],
      { fields: ["name", "ref", "vat", "company_id", "user_id"], limit: 50, context: { allowed_company_ids: SEDES_VE } },
    )) || [];
  return filas
    .filter((p) => claveRif(String(p.vat || "")) === clave)
    .map((p) => {
      const c = m2o(p.company_id);
      return {
        id: p.id,
        nombre: p.name || "",
        comercial: p.ref || "",
        rif: rifCompacto(String(p.vat || "")),
        sede: c?.[0] ?? null,
        sedeNombre: c?.[1] ?? "Todas las sedes",
        vendedor: m2o(p.user_id)?.[1] ?? "",
        url: urlContacto(p.id),
      };
    });
}

export async function estadosVenezuela(): Promise<{ id: number; nombre: string }[]> {
  const r =
    (await callOdooRPCEstricto<any[]>("res.country.state", "search_read", [[["country_id", "=", VENEZUELA]]], {
      fields: ["name"],
      order: "name",
    })) || [];
  return r.map((s) => ({ id: s.id, nombre: String(s.name) }));
}

/**
 * Vendedores de la sede = usuarios activos de Odoo que ya son vendedor de algún
 * cliente de esa sede (la tabla `sellers` es solo la de leads: le faltaban casi todos).
 */
export async function vendedoresDeSede(sede: number): Promise<{ id: number; nombre: string }[]> {
  const grupos =
    (await callOdooRPCEstricto<any[]>(
      "res.partner",
      "read_group",
      [[["customer_rank", ">", 0], ["company_id", "=", sede], ["user_id", "!=", false], ["user_id.active", "=", true]], ["user_id"], ["user_id"]],
      { lazy: false, context: { allowed_company_ids: [sede] } },
    )) || [];
  const ids = grupos.map((g) => m2o(g.user_id)?.[0]).filter((id): id is number => !!id);
  // Solo usuarios de la sede (hay clientes de Valencia con un vendedor de Panamá) y que venden.
  const usuarios =
    (await callOdooRPCEstricto<any[]>("res.users", "read", [ids], { fields: ["name", "company_ids"] })) || [];
  const filas = usuarios
    .filter((u) => (u.company_ids || []).includes(sede) && !esNoVendedor(u.name, sede))
    .map((u) => ({ user_id: Number(u.id), name: String(u.name).trim() }));
  return sinRetirados(filas)
    .map((u) => ({ id: u.user_id, nombre: u.name }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

export class ClienteDuplicado extends Error {
  constructor(public coincidencias: Coincidencia[]) {
    super("Ese RIF ya está registrado en esta sede");
  }
}

/**
 * Crea la ficha en la sede elegida. Antes vuelve a buscar el RIF (otra persona
 * pudo crearlo mientras se llenaba el formulario): en la misma sede no se crea.
 * En Odoo queda a nombre del usuario de la API; la nota del chatter dice quién fue.
 */
export async function crearCliente(c: ClienteNuevo, autor: { nombre: string; email: string }): Promise<number> {
  const mismas = (await buscarPorRif(c.rif)).filter((x) => x.sede === c.sede || x.sede === null);
  if (mismas.length) throw new ClienteDuplicado(mismas);

  const persona = c.tipo === "persona";
  const valores: Record<string, unknown> = {
    company_type: persona ? "person" : "company",
    is_company: !persona,
    name: c.nombre,
    ref: c.comercial,
    vat: c.rif,
    phone: c.telefono,
    // Las fichas de Odoo llevan el mismo número en los dos campos si hay uno solo.
    mobile: c.telefono2 || c.telefono,
    email: c.email,
    street: c.direccion,
    city: c.ciudad,
    state_id: c.estadoId,
    country_id: VENEZUELA,
    user_id: c.vendedorId,
    company_id: c.sede,
    customer_rank: 1,
    // Etiqueta «Cliente» (res.partner.category 5), la que ponen a mano en Odoo.
    category_id: [[4, ETIQUETA_CLIENTE]],
    lang: "es_VE",
    ...(persona ? { identification_id: c.rif, nationality: c.rif[0] } : {}),
  };
  const id = await callOdooRPCEstricto<number>("res.partner", "create", [valores], {
    context: { allowed_company_ids: [c.sede], company_id: c.sede },
  });
  if (!id) throw new Error("Odoo no devolvió la ficha creada");

  try {
    await callOdooRPCEstricto("res.partner", "message_post", [[id]], {
      body: `Cliente creado desde el panel por ${autor.nombre || autor.email} (${autor.email}).`,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
  } catch (e: any) {
    console.warn("[clientes-odoo] sin nota en el chatter:", e?.message);
  }
  return id;
}
