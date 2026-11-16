import { veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";

/** Atienden las solicitudes los mismos que suben flyers al banco (superadmin siempre entra). */
export const ROLES_ADMIN_FLYERS = ["adminleads", "gerente de operaciones", "diseñador"];
export const ROLES_VENDEDOR_FLYERS = ["vendedor", "seller"];

/**
 * Sede de la bandeja: la del `cids` del token; el SuperAdmin ve todas. El banco
 * de flyers es uno solo para todas las sedes, así que quien lo administra sin
 * sede en el token (algún diseñador) ve todas las solicitudes en vez de ninguna.
 */
export function sedeDe(payload: any): number | null {
  if (veTodasLasSedes(payload?.role)) return null;
  const cids = Number(payload?.cids);
  return Number.isInteger(cids) && cids > 0 ? cids : null;
}

/** Id del vendedor en el panel (`sub` = users_config.id, el mismo que usa Material POP). */
export function vendedorDe(payload: any): number | null {
  const id = Number(payload?.sub);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const nombreDe = (payload: any): string => String(payload?.name || payload?.email || "Usuario");
