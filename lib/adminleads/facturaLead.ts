import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { resolverFactura } from "@/lib/servicio-tecnico/factura";

export type DatosFactura = { rif: string; empresa: string; estado: string };

/**
 * Cliente de la factura que el vendedor cargó al cerrar el lead: RIF, razón
 * social y estado del partner comercial en Odoo, para corregir el lead con lo
 * que dice la factura y no con lo que escribió el vendedor. La factura se busca
 * en la sede del vendedor. Si no se encuentra (o hay varias) devuelve el aviso
 * para el vendedor y el cierre se guarda igual.
 */
export async function datosDeFactura(
  factura: string,
  sellerId: number | null,
): Promise<{ datos: DatosFactura } | { aviso: string }> {
  try {
    const { rows } = sellerId
      ? await query("SELECT cids FROM sellers WHERE id = ?", [sellerId])
      : { rows: [] as any[] };
    const cid = Number(rows[0]?.cids) || undefined;

    const r = await resolverFactura(factura, undefined, cid);
    if (r.estado === "no_encontrada") return { aviso: `La factura ${factura} no está en Odoo: el lead se cerró sin corregir sus datos.` };
    if (r.estado === "ambiguo") {
      const nums = r.coincidencias.map((c) => c.numero).join(", ");
      return { aviso: `Hay varias facturas con ${factura} (${nums}): escribe el número completo para corregir los datos del lead.` };
    }

    const [mov] = (await callOdooRPC<any[]>("account.move", "read", [[r.id]], { fields: ["commercial_partner_id"] })) || [];
    const partnerId = mov?.commercial_partner_id?.[0] ?? r.partner_id;
    const [p] = partnerId
      ? (await callOdooRPC<any[]>("res.partner", "read", [[partnerId]], { fields: ["name", "vat", "state_id"] })) || []
      : [];
    if (!p) return { aviso: "No se pudo leer el cliente de la factura en Odoo: el lead se cerró sin corregir sus datos." };

    return {
      datos: {
        rif: String(p.vat || "").trim(),
        empresa: String(p.name || "").trim(),
        // Odoo muestra el estado como "Carabobo (VE)": se guarda solo el nombre.
        estado: Array.isArray(p.state_id) ? String(p.state_id[1]).replace(/\s*\([A-Z]{2}\)$/, "") : "",
      },
    };
  } catch (err) {
    console.error("Error al leer la factura del lead en Odoo:", err);
    return { aviso: "Odoo no respondió: el lead se cerró sin corregir sus datos." };
  }
}

/** Pisa en el lead solo lo que la factura trae (un campo vacío en Odoo no borra el del lead). */
export async function corregirLead(id: number, d: DatosFactura) {
  const campos: string[] = [];
  const params: unknown[] = [];
  if (d.rif) { campos.push("rif = ?"); params.push(d.rif); }
  if (d.empresa) { campos.push("name = ?"); params.push(d.empresa); }
  if (d.estado) { campos.push("ubicacion_estado = ?"); params.push(d.estado); }
  if (!campos.length) return;
  await query(`UPDATE leads SET ${campos.join(", ")} WHERE id = ?`, [...params, id]);
}
