/**
 * Tienda web pública: lo que la página (odoo/landing) lee de Odoo en vivo por
 * `/api/tienda-web/*`. Solo lectura y solo lo público: productos publicados en
 * la web, su categoría, marca y si hay existencia en el almacén principal de la
 * sede (sí/no). Nunca precios, costos ni cantidades.
 */
import { callOdooRPCEstricto } from "@/lib/odoo";
import { almacenSede, cachear, catalogo, disponible, leerTodo } from "@/lib/compras/datosOdoo";
import { categoriaDe, limpiarDescripcion, marcaBonita, nombreBonito, type DescripcionTienda } from "./tipos";

/** Un producto en la página. Claves cortas: son unos 3.000 por sede. */
export interface ProductoTienda {
  /** product.template (el de las fotos y la ficha de Odoo). */
  id: number;
  /** Código (default_code). */
  c: string;
  /** Nombre legible, sin la marca. */
  n: string;
  /** Marca. */
  m: string;
  /** Categoría de la página (impresion, consumibles…, otros). */
  k: string;
  /** 1 = hay existencia en el almacén principal de la sede. */
  d: 0 | 1;
}

const DOMINIO_PUBLICADO = [
  ["is_published", "=", true],
  ["sale_ok", "=", true],
  ["active", "=", true],
  ["type", "!=", "service"],
];

/** Plantillas publicadas en la web que la sede puede vender, con foto. */
async function publicados(companyId: number): Promise<any[]> {
  const dominio = [...DOMINIO_PUBLICADO, ["company_id", "in", [false, companyId]], ["default_code", "!=", false]];
  const campos = ["id", "name", "default_code", "categ_id"];
  try {
    // Sin foto la tarjeta queda vacía: solo las que tienen imagen.
    return await leerTodo("product.template", [...dominio, ["image_128", "!=", false]], campos);
  } catch (e) {
    console.warn("[tienda-web] filtro por foto no disponible, sigo sin él:", e instanceof Error ? e.message : e);
    return leerTodo("product.template", dominio, campos);
  }
}

/** El catálogo publicado de una sede, con «disponible» según su almacén principal. 10 min en memoria. */
export function catalogoTienda(companyId: number): Promise<ProductoTienda[]> {
  return cachear(`tienda-web|catalogo|${companyId}`, async () => {
    const [plantillas, variantes, almacen] = await Promise.all([publicados(companyId), catalogo(), almacenSede(companyId)]);
    // Existencia y marca por plantilla (la existencia vive en la variante).
    const hay = new Set<number>();
    const marcaDe = new Map<number, string>();
    for (const v of variantes.values()) {
      if (!v.tmplId) continue;
      if (disponible(almacen.stock.get(v.id)) > 0) hay.add(v.tmplId);
      if (!marcaDe.has(v.tmplId) && v.marca && v.marca !== "SIN MARCA") marcaDe.set(v.tmplId, v.marca);
    }
    const productos: ProductoTienda[] = [];
    for (const t of plantillas) {
      const codigo = String(t.default_code || "").trim();
      if (!codigo) continue;
      const marca = marcaBonita(marcaDe.get(t.id));
      productos.push({
        id: t.id,
        c: codigo,
        n: nombreBonito(t.name, marca),
        m: marca,
        k: categoriaDe(t.categ_id ? t.categ_id[1] : ""),
        d: hay.has(t.id) ? 1 : 0,
      });
    }
    // Primero lo que hay; dentro, por categoría y nombre (la página ordena a su manera).
    return productos.sort((a, b) => b.d - a.d || a.k.localeCompare(b.k) || a.n.localeCompare(b.n, "es"));
  });
}

/** Resumen y viñetas de la ficha de Odoo de un producto publicado. null = no está publicado. 30 min en memoria. */
export function descripcionTienda(templateId: number): Promise<DescripcionTienda | null> {
  return cachear(`tienda-web|ficha|${templateId}`, async () => {
    const filas = await callOdooRPCEstricto<any[]>("product.template", "search_read", [[["id", "=", templateId], ...DOMINIO_PUBLICADO]], {
      fields: ["description_ecommerce", "website_description"],
      limit: 1,
    });
    if (!Array.isArray(filas) || !filas[0]) return null;
    return limpiarDescripcion(filas[0].description_ecommerce || "", filas[0].website_description || "");
  }, 30 * 60 * 1000);
}
