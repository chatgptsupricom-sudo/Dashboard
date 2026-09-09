import { callOdooRPC } from "@/lib/odoo";

export type Supplier = {
  id: number;
  name: string;
  ref: string | null;
  email: string | null;
  currency: { id: number; name: string } | null;
};

// Id de la etiqueta (res.partner.category) "Proveedor" en Odoo -- se
// resuelve por nombre en vez de hardcodear el id, que puede variar entre
// bases de Odoo. Cache simple en memoria: la etiqueta no cambia de id en
// caliente, no vale la pena resolverla en cada carga del formulario.
let proveedorTagId: number | null | undefined;

async function resolverEtiquetaProveedor(): Promise<number | null> {
  if (proveedorTagId !== undefined) return proveedorTagId;
  const categorias = await callOdooRPC<any[]>(
    "res.partner.category",
    "search_read",
    [[["name", "=", "Proveedor"]]],
    { fields: ["id"], limit: 1 },
  );
  const resuelto: number | null = categorias?.[0]?.id ?? null;
  proveedorTagId = resuelto;
  return resuelto;
}

/**
 * Proveedores para el select del formulario de orden de compra --
 * contactos de Odoo con la etiqueta "Proveedor" (campo `category_id`,
 * "Etiquetas" en la UI de Odoo). Antes se usaba `supplier_rank > 0`, que
 * traia cualquier contacto con al menos una factura de compra registrada
 * (295 contactos) en vez de solo los marcados como proveedores de verdad
 * (33 con la etiqueta) -- pedido explicito para acotar la lista.
 * `company_id = false` en Odoo significa "visible para todas las
 * compañías" -- se incluyen esos ademas de los que pertenecen puntualmente
 * a alguna de `companies`, si se paso alguna.
 */
export async function getSuppliers(companies: number[]): Promise<Supplier[]> {
  const tagId = await resolverEtiquetaProveedor();
  const domain: any[] = tagId ? [["category_id", "in", [tagId]]] : [["supplier_rank", ">", 0]];
  if (companies.length > 0) {
    domain.push("|", ["company_id", "=", false], ["company_id", "in", companies]);
  }

  const partners = await callOdooRPC<any[]>(
    "res.partner",
    "search_read",
    [domain],
    {
      fields: ["id", "name", "ref", "email", "property_purchase_currency_id"],
      order: "name asc",
      limit: 0,
      context: companies.length > 0 ? { allowed_company_ids: companies } : undefined,
    },
  );

  return (partners || []).map((p: any) => ({
    id: p.id,
    name: p.name || "",
    ref: p.ref || null,
    email: p.email || null,
    currency: Array.isArray(p.property_purchase_currency_id)
      ? { id: p.property_purchase_currency_id[0], name: p.property_purchase_currency_id[1] }
      : null,
  }));
}
