import { NextResponse } from "next/server";

/**
 * Sede que puede leer cada usuario segun su token, para los roles que van
 * clavados a su `cids` aunque la pantalla o el query string pidan otra.
 *
 * Hoy aplica al rol Administracion: todo lo que lee (sus modulos y las
 * secciones de Cuentas por Cobrar) queda en la sede de su `cids`. Un usuario
 * de Administracion sin `cids` valido no ve nada (falla cerrado): antes de
 * esto podia leer las tres sedes pasando `?empresa=` o `?company_id=`.
 *
 * Los demas roles no cambian aqui (CxC ya usa `companyIdsEnAlcance`).
 */

export const SEDES_VALIDAS = [7, 9, 10];

export const ROLES_ADMINISTRACION = [
  "administracion",
  "administración",
  "administracion y finanzas",
  "administración y finanzas",
];

const normalizar = (rol: unknown) => String(rol || "").toLowerCase().trim();

export function esRolAdministracion(rol: unknown): boolean {
  return ROLES_ADMINISTRACION.includes(normalizar(rol));
}

/** `cids` del token si es una sede valida; si no, null. */
export function sedeDelToken(payload: { cids?: unknown } | null | undefined): number | null {
  const cids = Number(payload?.cids);
  return SEDES_VALIDAS.includes(cids) ? cids : null;
}

/**
 * Recorta las sedes pedidas a las que el rol puede leer. Vacio = no le
 * corresponde ninguna (responder `respuestaSedeNoPermitida()`).
 */
export function limitarSedesPorRol(
  payload: { role?: unknown; cids?: unknown } | null | undefined,
  companyIds: number[],
): number[] {
  if (!esRolAdministracion(payload?.role)) return companyIds;
  const sede = sedeDelToken(payload);
  if (sede === null) return [];
  return companyIds.includes(sede) ? [sede] : [];
}

export function respuestaSedeNoPermitida() {
  return NextResponse.json(
    { success: false, error: "Tu usuario no tiene acceso a esa sede (o no tiene sede asignada)." },
    { status: 403 },
  );
}

const EMPRESA_DE_SEDE: Record<number, string> = { 9: "valencia", 10: "caracas", 7: "panama" };

/**
 * Para las APIs que filtran por `?empresa=valencia|caracas|panama` ("" =
 * todas): la empresa que de verdad hay que usar.
 *   undefined = el rol no tiene sede fija, usar la pedida.
 *   null      = no le corresponde (otra sede, o sin sede asignada): 403.
 *   string    = su sede, aunque haya pedido "todas".
 */
export function empresaForzadaPorRol(
  payload: { role?: unknown; cids?: unknown } | null | undefined,
  pedida: string,
): string | null | undefined {
  if (!esRolAdministracion(payload?.role)) return undefined;
  const sede = sedeDelToken(payload);
  if (sede === null) return null;
  const propia = EMPRESA_DE_SEDE[sede];
  const p = (pedida || "").toLowerCase().trim();
  return p === "" || p === "todas" || p === propia ? propia : null;
}
