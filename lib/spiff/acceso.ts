import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";

/** Roles que ven el Spiff de cualquier sede (con `?company_id=`). */
const ROLES_ELIGEN_SEDE = ["superadmin", "gerencia de ventas", "gerente de operaciones", ROL_BI];

/**
 * Roles que abren las facturas de cualquier vendedor desde el ranking del
 * administrador de reglas; el resto solo las suyas. Son los que usan
 * SpiffManager (el Asistente de Ventas lo ve en solo lectura).
 */
const ROLES_VEN_FACTURAS_DE_OTROS = [...ROLES_ELIGEN_SEDE, "asistente de ventas"];

const rolDe = (payload: any) => String(payload?.role || "").toLowerCase().trim();

/** Sede del Spiff: la de `?company_id=` si el rol puede elegirla; si no, la suya. */
export function sedeDelSpiff(payload: any, sp: URLSearchParams): number {
  const param = parseInt(sp.get("company_id") || "", 10);
  return ROLES_ELIGEN_SEDE.includes(rolDe(payload)) && Number.isFinite(param) ? param : Number(payload?.cids) || 9;
}

export const veFacturasDeOtros = (payload: any) => ROLES_VEN_FACTURAS_DE_OTROS.includes(rolDe(payload));
