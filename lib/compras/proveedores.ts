import { callOdooRPC } from "@/lib/odoo";

export type Supplier = {
  id: number;
  name: string;
  ref: string | null;
  email: string | null;
  currency: { id: number; name: string } | null;
};

/**
 * Proveedores (res.partner con supplier_rank > 0) para el select del
 * formulario de orden de compra. `company_id = false` en Odoo significa
 * "visible para todas las compañías" -- se incluyen esos ademas de los que
 * pertenecen puntualmente a alguna de `companies`, si se paso alguna.
 */
export async function getSuppliers(companies: number[]): Promise<Supplier[]> {
  const domain: any[] = [["supplier_rank", ">", 0]];
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
