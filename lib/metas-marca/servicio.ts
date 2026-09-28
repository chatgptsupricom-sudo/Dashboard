import { leerVentasSede, SEDES, esSedeValida, ventaMesPorMarca, type VentasSede } from "./odoo";

export const mesValido = (m: string | null | undefined) => (m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : null);

export const mesActual = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export function moverMes(mes: string, delta: number) {
  const [y, m] = mes.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return mesActual(d);
}

export function rangoMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return { desde: `${mes}-01`, hasta: `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}` };
}

/** `company_id` = 9 | 10 | 7 | "todas". */
export function sedesDe(param: string | null): number[] | null {
  if (!param || param === "todas") return param === "todas" ? SEDES.map((s) => s.id) : [9];
  const id = Number(param);
  return esSedeValida(id) ? [id] : null;
}

const cache = new Map<string, { vence: number; valor: Promise<VentasSede> }>();

/**
 * Ventas de una sede en un mes, con caché de 3 minutos (la página, la
 * auditoría y el Excel piden lo mismo casi a la vez). `refrescar` la salta.
 */
export function ventasDelMes(companyId: number, mes: string, refrescar = false): Promise<VentasSede> {
  const llave = `${companyId}|${mes}`;
  const x = cache.get(llave);
  if (!refrescar && x && x.vence > Date.now()) return x.valor;
  const { desde, hasta } = rangoMes(mes);
  const valor = leerVentasSede(companyId, desde, hasta);
  cache.set(llave, { vence: Date.now() + 3 * 60 * 1000, valor });
  valor.catch(() => cache.delete(llave));
  return valor;
}

/** Venta por marca de los `n` meses anteriores a `mes`, sumada entre sedes (del más viejo al más nuevo). */
export async function historialMarcas(sedes: number[], mes: string, n: number, incluirIC: boolean) {
  const meses = Array.from({ length: n }, (_, i) => moverMes(mes, i - n));
  return Promise.all(meses.map(async (m) => {
    const porSede = await Promise.all(sedes.map((s) => ventaMesPorMarca(s, m, incluirIC)));
    const porMarca = new Map<string, number>();
    for (const mapa of porSede) for (const [k, v] of mapa) porMarca.set(k, (porMarca.get(k) || 0) + v);
    return { mes: m, porMarca };
  }));
}
