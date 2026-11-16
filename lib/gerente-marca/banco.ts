import { asignacionesDe } from "@/lib/gerente-marca/asignaciones";
import { productosDelAlcance } from "@/lib/gerente-marca/datos";
import { CATEGORIAS_IMPRESION, esRolGerenteMarca } from "@/lib/gerente-marca/tipos";

/**
 * El Banco de Flyers del Gerente de Marca muestra solo los flyers de sus
 * marcas: los que apuntan a un producto suyo (`odoo_product_id`, o
 * `product_code` = su número de parte) o, si no tienen producto, los que
 * dicen su marca en `brand`. En una marca de "Cómputo Corporativo" el nombre
 * de la marca no alcanza (HP también es tóner): ahí entra solo si el flyer
 * trae una categoría y no es de impresión (`CATEGORIAS_IMPRESION`).
 *
 * Devuelve la condición SQL sobre `product_images pi`, o null para los demás
 * roles (sin filtro).
 */
export async function filtroBancoGerente(payload: any): Promise<{ sql: string; params: any[] } | null> {
  if (!esRolGerenteMarca(payload?.role)) return null;
  const asignaciones = await asignacionesDe(String(payload?.email || ""));
  const productos = [...(await productosDelAlcance(asignaciones)).values()];
  const ids = productos.map((p) => p.id);
  const codigos = [...new Set(productos.map((p) => p.codigo.toUpperCase()).filter(Boolean))];
  const marca = (linea: "todo" | "computo") =>
    asignaciones.filter((a) => a.linea === linea).map((a) => a.marca.trim().toUpperCase());
  const enteras = marca("todo");
  const computo = marca("computo");
  const enLista = (n: number) => Array(n).fill("?").join(",");

  const partes: string[] = [];
  const params: any[] = [];
  if (ids.length > 0) {
    partes.push(`pi.odoo_product_id IN (${enLista(ids.length)})`);
    params.push(...ids);
  }
  if (codigos.length > 0) {
    partes.push(`(pi.odoo_product_id IS NULL AND UPPER(TRIM(pi.product_code)) IN (${enLista(codigos.length)}))`);
    params.push(...codigos);
  }
  if (enteras.length > 0) {
    partes.push(`(pi.odoo_product_id IS NULL AND UPPER(TRIM(pi.brand)) IN (${enLista(enteras.length)}))`);
    params.push(...enteras);
  }
  if (computo.length > 0) {
    // La categoría del flyer se compara como en Odoo: sin acentos y en mayúsculas
    // (PAPELERÍA y PAPELERIA son la misma).
    const impresion = [...new Set(CATEGORIAS_IMPRESION.flatMap((c) => [c, c.replace("PAPELERIA", "PAPELERÍA")]))];
    partes.push(
      `(pi.odoo_product_id IS NULL AND UPPER(TRIM(pi.brand)) IN (${enLista(computo.length)})` +
        ` AND TRIM(COALESCE(pi.category, '')) <> '' AND UPPER(TRIM(pi.category)) NOT IN (${enLista(impresion.length)}))`,
    );
    params.push(...computo, ...impresion);
  }
  return { sql: partes.length > 0 ? `(${partes.join(" OR ")})` : "1=0", params };
}
