import { esRolBI } from "@/lib/auth/inteligenciaNegocio";

/** Sede que ven Inteligencia de Negocio y el Diseñador: Valencia. */
export const SEDE_CATALOGO_VALENCIA = 9;

/**
 * Sede del Catálogo de los vendedores (`/api/vendedores/catalogo` y su
 * export): la del `cids` del token. BI no tiene `cids` y el Diseñador
 * trabaja el catálogo de Valencia, así que esos dos ven la sede 9.
 */
export function sedeDelCatalogo(
  payload: { role?: unknown; cids?: unknown } | null,
): number | null {
  if (!payload) return null;
  const rol = String(payload.role ?? "").toLowerCase().trim();
  if (esRolBI(rol) || rol === "diseñador") return SEDE_CATALOGO_VALENCIA;
  const cids = parseInt(String(payload.cids ?? ""));
  return Number.isInteger(cids) && cids > 0 ? cids : null;
}
