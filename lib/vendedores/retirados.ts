/**
 * Vendedores que dejaron de vender: siguen en la tabla `sellers` (sus leads
 * y cierres viejos lo necesitan) pero ya no salen como vendedor en las
 * pantallas de ventas: Stoplight, Cuota, Reporte diario, Reporte de ventas,
 * Alertas, Visitas y los rankings de ventas. Lo que facturaron queda en Odoo
 * a su nombre; en las pantallas que suman las filas de los vendedores cuenta
 * como lo de cualquier usuario que no es vendedor (no entra en la cuota).
 *
 * Al retirar a alguien: reasignar sus clientes en Odoo (`res.partner.user_id`)
 * y apagarlo en Monitoreo Leads › Configuración (`sellers.activo = 0`, para
 * que la rotación de n8n no le mande leads). Spiff no lo usa: es lo que se le
 * paga por lo que vendió.
 */
export const VENDEDORES_RETIRADOS: { userId: number; nombre: string; sede: number; desde: string }[] = [
  // Sus clientes pasaron a Daniel Espinoza, Maryori Villanueva y Arturo Aray.
  { userId: 367, nombre: "Bladimir Vasquez", sede: 9, desde: "2026-10-29" },
];

const normalizar = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ");

const IDS = new Set(VENDEDORES_RETIRADOS.map((v) => v.userId));
const NOMBRES = new Set(VENDEDORES_RETIRADOS.map((v) => normalizar(v.nombre)));

/** Ids de Odoo (`res.users`) de los vendedores retirados. */
export const USER_IDS_RETIRADOS = [...IDS];

/**
 * true si ese vendedor está retirado. Acepta una fila de `sellers`
 * ({ user_id, name }), un par de Odoo ([id, nombre]) o un id suelto.
 */
export function esVendedorRetirado(
  v: { user_id?: number | null; name?: string | null } | [number, string] | number | null | undefined,
): boolean {
  if (v == null) return false;
  if (typeof v === "number") return IDS.has(v);
  if (Array.isArray(v)) return IDS.has(Number(v[0])) || NOMBRES.has(normalizar(v[1]));
  return (v.user_id != null && IDS.has(Number(v.user_id))) || NOMBRES.has(normalizar(v.name));
}

/** Las filas de `sellers` sin los vendedores retirados. */
export function sinRetirados<T>(filas: T[]): T[] {
  return (filas || []).filter((f) => !esVendedorRetirado(f as { user_id?: number | null; name?: string | null }));
}
