import { leerVentasSede, SEDES, esSedeValida, ventaMesPorMarca, type VentasSede } from "./odoo";

export const mesValido = (m: string | null | undefined) => (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null);

/**
 * Hoy en Venezuela (UTC-4 fijo, sin horario de verano), a medianoche local
 * del proceso. El contenedor corre en UTC: con `new Date()` a partir de las
 * 20:00 de Caracas ya era "mañana", el último día del mes se mostraba como
 * mes cerrado y se contaba un día hábil de más.
 */
export function hoyCaracas(ahora = Date.now()): Date {
  const c = new Date(ahora - 4 * 60 * 60 * 1000);
  return new Date(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate());
}

export const isoDia = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const mesActual = (d = hoyCaracas()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function moverMes(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return mesActual(d);
}

export function rangoMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return { desde: `${mes}-01`, hasta: `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

/** `company_id` = 9 | 10 | 7 | "todas". Sin parámetro, Valencia. */
export function sedesDe(param: string | null): number[] | null {
  if (!param) return [9];
  if (param === "todas") return SEDES.map((s) => s.id);
  const id = Number(param);
  return esSedeValida(id) ? [id] : null;
}

const cache = new Map<string, { vence: number; valor: Promise<VentasSede> }>();

/**
 * Ventas de una sede en un mes, con caché de 3 minutos (la página y el Excel
 * piden lo mismo casi a la vez). `refrescar` la salta y deja la lectura nueva
 * en la caché.
 */
export function ventasDelMes(companyId: number, mes: string, refrescar = false): Promise<VentasSede> {
  const llave = `${companyId}|${mes}`;
  const x = cache.get(llave);
  if (!refrescar && x && x.vence > Date.now()) return x.valor;
  const { desde, hasta } = rangoMes(mes);
  const valor = leerVentasSede(companyId, desde, hasta);
  const entrada = { vence: Date.now() + 3 * 60 * 1000, valor };
  cache.set(llave, entrada);
  valor.catch(() => { if (cache.get(llave) === entrada) cache.delete(llave); });
  return valor;
}

/**
 * Venta ($ y unidades) por marca de los `n` meses anteriores a `mes`, sumada
 * entre sedes, del más viejo al más nuevo. Si `mes` es futuro, el mes en
 * curso (incompleto) no entra: el historial termina en el último mes cerrado.
 */
export async function historialMarcas(sedes: number[], mes: string, n: number, incluirIC: boolean, refrescar = false) {
  const actual = mesActual();
  const ultimo = mes > actual ? moverMes(actual, -1) : moverMes(mes, -1);
  const meses = Array.from({ length: n }, (_, i) => moverMes(ultimo, i - n + 1));
  return Promise.all(meses.map(async (m) => {
    const porSede = await Promise.all(sedes.map((s) => ventaMesPorMarca(s, m, incluirIC, refrescar)));
    const porMarca = new Map<string, number>();
    const unidades = new Map<string, number>();
    for (const x of porSede) {
      for (const [k, v] of x.ingreso) porMarca.set(k, (porMarca.get(k) || 0) + v);
      for (const [k, v] of x.unidades) unidades.set(k, (unidades.get(k) || 0) + v);
    }
    return { mes: m, porMarca, unidades };
  }));
}
