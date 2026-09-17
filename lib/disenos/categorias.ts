/**
 * Categorías de diseño del rol Diseñador. Son fijas: cada diseño que se sube
 * tiene que pertenecer a una, y los KPIs se agrupan por ellas.
 *
 * El valor guardado en `designer_designs.category` es el `id` (estable, no se
 * traduce); el `label` es lo único que se muestra. No se borran ids viejos: si
 * una categoría deja de usarse, se marca como inactiva y los diseños que ya la
 * tienen siguen mostrándose bien.
 */

export interface CategoriaDiseno {
  id: string;
  label: string;
}

export const CATEGORIAS_DISENO: CategoriaDiseno[] = [
  { id: "post_instagram", label: "Diseño de post Instagram" },
  { id: "banner_web", label: "Diseño de banner web" },
  { id: "historia", label: "Diseño de historia" },
  { id: "solicitud_corporativa", label: "Diseños de solicitudes corporativas" },
  { id: "catalogo", label: "Diseños de catálogos" },
  { id: "apoyo_piso_ventas", label: "Diseños de solicitudes de cliente en apoyo a piso de ventas" },
];

const POR_ID = new Map(CATEGORIAS_DISENO.map((c) => [c.id, c]));

export const esCategoriaValida = (id: unknown): id is string =>
  typeof id === "string" && POR_ID.has(id);

/** Etiqueta para mostrar. Los diseños viejos (sin categoría) caen en "Sin categoría". */
export const etiquetaCategoria = (id: string | null | undefined): string =>
  (id && POR_ID.get(id)?.label) || "Sin categoría";
