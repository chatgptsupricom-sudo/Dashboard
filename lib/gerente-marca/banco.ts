import { asignacionesDe } from "@/lib/gerente-marca/asignaciones";
import { productosDelAlcance } from "@/lib/gerente-marca/datos";
import { esRolGerenteMarca } from "@/lib/gerente-marca/tipos";

/**
 * El Banco de Flyers del Gerente de Marca muestra solo los flyers de sus
 * marcas: los que apuntan a un producto suyo (`odoo_product_id`) o, si no
 * tienen producto, los que dicen su marca en `brand` (solo en las marcas que
 * lleva enteras: en "Cómputo Corporativo" el nombre de la marca no dice si el
 * flyer es de una laptop o de un tóner).
 *
 * Devuelve la condición SQL sobre `product_images pi`, o null para los demás
 * roles (sin filtro).
 */
export async function filtroBancoGerente(payload: any): Promise<{ sql: string; params: any[] } | null> {
  if (!esRolGerenteMarca(payload?.role)) return null;
  const asignaciones = await asignacionesDe(String(payload?.email || ""));
  const ids = [...(await productosDelAlcance(asignaciones)).keys()];
  const marcas = asignaciones.filter((a) => a.linea === "todo").map((a) => a.marca.trim().toUpperCase());
  const partes: string[] = [];
  const params: any[] = [];
  if (ids.length > 0) {
    partes.push(`pi.odoo_product_id IN (${ids.map(() => "?").join(",")})`);
    params.push(...ids);
  }
  if (marcas.length > 0) {
    partes.push(`(pi.odoo_product_id IS NULL AND UPPER(TRIM(pi.brand)) IN (${marcas.map(() => "?").join(",")}))`);
    params.push(...marcas);
  }
  return { sql: partes.length > 0 ? `(${partes.join(" OR ")})` : "1=0", params };
}
