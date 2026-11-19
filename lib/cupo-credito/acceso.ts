import { ROL_BI, esRolBI, veTodasLasSedes } from "@/lib/auth/inteligenciaNegocio";
import { SEDES_VALIDAS, sedeDelToken } from "@/lib/auth/sedeRol";

/**
 * Quién ve Cupo de crédito (/cupo-credito) y qué parte:
 * - Vendedor: solo su cartera (clientes con él como vendedor en Odoo) y el
 *   histórico de su cartera.
 * - Gerencia de Ventas y Gerente de Operaciones (Gerencia Comercial): toda
 *   su sede (`cids`), con el consolidado por vendedor (equipo) y por zona.
 * - SuperAdmin (Directiva) e Inteligencia de Negocio: eligen sede.
 * Solo lee: Odoo y las fotos de `cxc_credito_fotos`.
 */
export const ROLES_VENDEDOR = ["vendedor", "seller"];
export const ROLES_GERENCIA = ["gerencia de ventas", "gerente de operaciones"];
export const ROLES_CUPO = [...ROLES_VENDEDOR, ...ROLES_GERENCIA, ROL_BI];

const normalizar = (rol: unknown) => String(rol ?? "").toLowerCase().trim();

export function puedeVerCupo(rol: unknown): boolean {
  const r = normalizar(rol);
  return r === "superadmin" || ROLES_CUPO.includes(r) || esRolBI(r);
}

export function esVendedorCupo(rol: unknown): boolean {
  return ROLES_VENDEDOR.includes(normalizar(rol));
}

export interface AlcanceCupo {
  sedes: number[];
  /** Vendedor: solo los clientes con su usuario de Odoo. */
  soloCartera: boolean;
  uid: number | null;
  eligeSede: boolean;
}

/**
 * Sedes y cartera que corresponden al token. `sede` = 9|10|7|"todas" (solo
 * quien elige sede). Devuelve un error legible si no le corresponde nada.
 */
export function alcanceCupo(payload: any, sede: string | null): AlcanceCupo | { error: string; status: number } {
  const rol = normalizar(payload?.role);
  const soloCartera = esVendedorCupo(rol);
  const uid = Number(payload?.uid) || null;
  if (soloCartera && !uid) return { error: "Tu usuario no tiene vendedor en Odoo", status: 403 };

  if (veTodasLasSedes(rol)) {
    const pedida = sede || "todas";
    const sedes = pedida === "todas" ? [...SEDES_VALIDAS] : SEDES_VALIDAS.includes(Number(pedida)) ? [Number(pedida)] : [];
    if (!sedes.length) return { error: "Sede inválida", status: 400 };
    return { sedes, soloCartera, uid, eligeSede: true };
  }
  const propia = sedeDelToken(payload);
  if (propia) return { sedes: [propia], soloCartera, uid, eligeSede: false };
  // Un vendedor sin sede ve su cartera en las tres; la gerencia necesita su sede.
  if (soloCartera) return { sedes: [...SEDES_VALIDAS], soloCartera, uid, eligeSede: false };
  return { error: "Tu usuario no tiene sede asignada", status: 403 };
}
