/**
 * Vendedores con una meta de clientes nuevos propia, distinta de la general de
 * la sede (`kpi_targets.clientes_nuevos`, que es por vendedor). La usan el
 * Stoplight (la meta del equipo es la suma de las de cada vendedor), su
 * detalle de clientes nuevos y el Stoplight del propio vendedor. Lo que capten
 * igual cuenta en el total del equipo.
 *
 * Meta 0 = no se le mide: en su Stoplight sale como sin meta.
 */
export const METAS_CLIENTES_NUEVOS: { userId: number; nombre: string; sede: number; meta: number }[] = [
  { userId: 432, nombre: "EMILI BRICEÑO", sede: 9, meta: 0 },
];

const normalizar = (s: string | null | undefined) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\./g, "")
    .trim()
    .replace(/\s+/g, " ");

/**
 * La meta de clientes nuevos del mes de ese vendedor: la propia si tiene una,
 * si no la general. Acepta una fila de `sellers` ({ user_id, name }).
 */
export function metaClientesNuevosDe(
  vendedor: { user_id?: number | null; name?: string | null },
  metaGeneral: number,
): number {
  const propia = METAS_CLIENTES_NUEVOS.find(
    (m) => (vendedor.user_id != null && Number(vendedor.user_id) === m.userId) || normalizar(vendedor.name) === normalizar(m.nombre),
  );
  return propia ? propia.meta : metaGeneral;
}
