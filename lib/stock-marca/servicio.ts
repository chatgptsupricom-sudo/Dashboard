import { CORTE_ODOO } from "@/lib/smartbit";
import { costos } from "@/lib/compras/datosOdoo";
import { nombreSede, SEDES, esSedeValida } from "@/lib/metas-marca/odoo";
import { calcularStockMarca, type DatosSede, type ResultadoStockMarca } from "./calculo";
import {
  almacenPrincipal, costoProductos, idsAlmacenables, infoProductos, quantsHoy, reconstruccion, stockAlCorte,
  ultimaVentaHasta, ventasMensuales, ventasPorProducto,
} from "./odoo";
import { finDeMes, mesDeDia, mesesEntre, MIN_MES, moverMes, type Periodo } from "./periodo";

/** Meses que muestra la serie (los últimos, desde abril 2026). */
const MESES_SERIE = 12;

/** `company_id` = 9 | 10 | 7 | "todas". Sin parámetro, Valencia. */
export function sedesDe(param: string | null): number[] | null {
  if (!param) return [9];
  if (param === "todas") return SEDES.map((s) => s.id);
  const id = Number(param);
  return esSedeValida(id) ? [id] : null;
}

export async function datosSede(companyId: number, periodo: Periodo, incluirIC: boolean, refrescar = false): Promise<DatosSede> {
  const ultimoMes = mesDeDia(periodo.corte);
  let primerMes = moverMes(ultimoMes, -(MESES_SERIE - 1));
  if (primerMes < MIN_MES) primerMes = MIN_MES;
  const meses = mesesEntre(primerMes, ultimoMes);

  // "Actualizar": el stock de hoy se relee una sola vez, aquí, y todo lo
  // demás usa esa misma foto.
  if (refrescar) await quantsHoy(companyId, true);
  // El costo de Compras (catálogo entero) se pide ya, en paralelo con todo lo demás.
  const costosCompras = costos(companyId);
  costosCompras.catch(() => {});
  const [alm, stock, ventas, ventasAnt, recons, mensual, almacenables, ultima] = await Promise.all([
    almacenPrincipal(companyId),
    stockAlCorte(companyId, periodo.corte, refrescar),
    ventasPorProducto(companyId, periodo.desde, periodo.corte, refrescar),
    periodo.anterior ? ventasPorProducto(companyId, periodo.anterior.desde, periodo.anterior.corte, refrescar) : Promise.resolve(null),
    reconstruccion(companyId, CORTE_ODOO, refrescar),
    ventasMensuales(companyId, `${primerMes}-01`, periodo.corte, refrescar),
    idsAlmacenables(refrescar),
    ultimaVentaHasta(companyId, periodo.corte, refrescar),
  ]);

  // Stock al corte anterior y al cierre de cada mes: reconstruido desde los
  // movimientos (coincide con el histórico de Odoo; lo verifica la auditoría).
  const stockAnterior = periodo.anterior ? new Map<number, number>() : null;
  const serieStock = new Map<number, number[]>();
  const cierres = meses.map((m) => (finDeMes(m) < periodo.corte ? finDeMes(m) : periodo.corte));
  // Almacenables más lo que hoy tiene stock (un producto recién pasado a
  // almacenable puede no estar todavía en la lista en caché).
  for (const id of new Set([...almacenables, ...stock.fisico.keys()])) {
    if (stockAnterior) {
      const s = recons.stockAlCierre(id, periodo.anterior!.corte);
      if (s > 0) stockAnterior.set(id, s);
    }
    // El mes del corte toma el mismo stock que la tabla (histórico de Odoo o quants).
    const fila = cierres.map((dia, i) => (i === cierres.length - 1 ? stock.fisico.get(id) ?? 0 : recons.stockAlCierre(id, dia)));
    if (fila.some((x) => x > 0)) serieStock.set(id, fila);
  }
  const serieVendido = new Map<number, number[]>();
  for (const [id, porMes] of mensual.todo) {
    const ic = mensual.ic.get(id);
    const fila = meses.map((m) => (porMes.get(m) ?? 0) - (incluirIC ? 0 : ic?.get(m) ?? 0));
    if (fila.some((x) => x !== 0)) serieVendido.set(id, fila);
  }

  const ids = new Set<number>([...stock.fisico.keys(), ...ventas.keys(), ...serieStock.keys(), ...serieVendido.keys()]);
  if (stockAnterior) for (const id of stockAnterior.keys()) ids.add(id);
  if (ventasAnt) for (const id of ventasAnt.keys()) ids.add(id);
  const [productos, costo] = await Promise.all([
    infoProductos([...ids], refrescar),
    costoProductos(companyId, [...stock.fisico.keys()]),
  ]);

  return {
    companyId,
    sede: nombreSede(companyId),
    almacen: alm.nombre,
    productos,
    stock: stock.fisico,
    reservado: stock.reservado,
    stockAnterior,
    ventas,
    ventasAnterior: ventasAnt,
    costo,
    ultimaVenta: ultima,
    serie: { meses, vendido: serieVendido, stock: serieStock },
  };
}

/** Stock por marca de una o varias sedes. Con varias sedes, sin intercompañía (se contaría dos veces). */
export async function stockPorMarca(sedes: number[], periodo: Periodo, incluirIC: boolean, refrescar = false): Promise<ResultadoStockMarca> {
  const ic = sedes.length === 1 && incluirIC;
  const datos = await Promise.all(sedes.map((s) => datosSede(s, periodo, ic, refrescar)));
  return calcularStockMarca(periodo, datos, ic);
}

export { nombreSede };
