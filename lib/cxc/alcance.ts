/**
 * Sedes que un usuario de CxC puede leer.
 *
 * El alcance sale del token, nunca del query string: sin esto un usuario de
 * una sede lee la cartera de otra pasando `?empresa=`, o directamente con
 * `empresa=todas`, que es el valor por defecto de las pantallas.
 *
 * Solo `superadmin` ve las tres sedes. El resto queda clavado a su `cids`;
 * un `cids` ausente o inválido (usuarios viejos sin sede asignada) cae al
 * alcance completo para no romperles la pantalla.
 */
export const COMPANY_MAP: Record<string, number> = { valencia: 9, caracas: 10, panama: 7 };
export const COMPANY_NAMES: Record<number, string> = { 7: "Panamá", 9: "Valencia", 10: "Caracas" };
export const COMPANY_IDS_ALL = [7, 9, 10];

/**
 * Devuelve los `company_id` a consultar: la sede pedida en `empresa`
 * intersectada con el alcance del token. Vacío = la sede pedida no le
 * corresponde, responder 403.
 */
export function companyIdsEnAlcance(payload: any, empresa: string): number[] {
  const rol = String(payload?.role || "").toLowerCase().trim();
  const cids = Number(payload?.cids);
  const alcance =
    rol === "superadmin" || !COMPANY_IDS_ALL.includes(cids)
      ? COMPANY_IDS_ALL
      : [cids];
  const pedida = COMPANY_MAP[(empresa || "").toLowerCase().trim()];
  const pedidas = pedida ? [pedida] : alcance;
  return pedidas.filter((id) => alcance.includes(id));
}
