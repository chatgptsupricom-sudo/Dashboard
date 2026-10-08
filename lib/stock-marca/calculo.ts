import { esMarcaGenerica, SIN_MARCA } from "@/lib/metas-marca/marcas";
import type { InfoProducto, VentaProducto } from "./odoo";
import type { Periodo } from "./periodo";

/**
 * Stock por marca: cuánto de cada marca se vendió frente a lo que había.
 *
 *   % vendido = vendido ÷ (vendido + stock al cierre)
 *
 * El 100% es todo lo que hubo de la marca en el período: lo que se vendió más
 * lo que quedó. Es el "sell-through" del Stoplight de Compras
 * (lib/compras/kpis.ts), con el mismo stock y las mismas unidades.
 *
 * Cobertura = días que dura el stock al ritmo de venta del período. El estado
 * de cada marca sale de la cobertura (ver `ESTADOS`).
 */

export type EstadoStock = "agotada" | "por_agotarse" | "sana" | "lenta" | "sobrestock" | "sin_venta";

/** Límites de cobertura en días. */
export const LIMITES = { porAgotarse: 30, sana: 90, lenta: 180 } as const;

export interface DatosSede {
  companyId: number;
  sede: string;
  almacen: string;
  productos: Map<number, InfoProducto>;
  /** Stock físico al corte. */
  stock: Map<number, number>;
  /** Reservado hoy (null si el corte es un día pasado). */
  reservado: Map<number, number> | null;
  stockAnterior: Map<number, number> | null;
  ventas: Map<number, VentaProducto>;
  ventasAnterior: Map<number, VentaProducto> | null;
  costo: Map<number, number>;
  ultimaVenta: Map<number, string>;
  /** Serie mensual por producto: unidades vendidas (con la regla de intercompañía ya aplicada) y stock al cierre del mes. */
  serie: { meses: string[]; vendido: Map<number, number[]>; stock: Map<number, number[]> };
}

export interface FilaProducto {
  id: number;
  companyId: number;
  codigo: string;
  nombre: string;
  clave: string;
  marcaOdoo: string;
  categoria: string;
  activo: boolean;
  stock: number;
  reservado: number | null;
  disponible: number | null;
  vendido: number;
  ventaUsd: number;
  pct: number | null;
  costo: number;
  valor: number;
  cobertura: number | null;
  ultimaVenta: string | null;
}

export interface PuntoSerie { mes: string; vendido: number; stock: number; pct: number | null }

export interface Agregado {
  stock: number;
  disponible: number | null;
  vendido: number;
  ventaUsd: number;
  pct: number | null;
  pctAnterior: number | null;
  valor: number;
  cobertura: number | null;
  productos: number;
  conStock: number;
  sinVenta: number;
  valorSinVenta: number;
  /** Productos con stock y costo 0 en Odoo (su valor no suma). */
  sinCosto: number;
}

export interface FilaMarca extends Agregado {
  clave: string;
  marca: string;
  generica: boolean;
  estado: EstadoStock;
  /** Parte del stock (unidades) de la sede que es de esta marca. */
  participacionStock: number;
  porSede: { companyId: number; sede: string; stock: number; vendido: number; pct: number | null; valor: number }[];
  serie: PuntoSerie[];
}

export interface Excluido {
  /** Venta de servicios (fletes, servicio técnico): no llevan stock. */
  serviciosUsd: number;
  /** Consumibles: se venden pero Odoo no les lleva stock. */
  consumiblesUnidades: number;
  consumiblesUsd: number;
  /** Venta intercompañía de almacenables fuera del cálculo (0 si se incluye). */
  icUnidades: number;
  icUsd: number;
}

export interface ResultadoStockMarca {
  periodo: Periodo;
  incluyeIntercompania: boolean;
  sedes: { id: number; nombre: string; almacen: string }[];
  totales: Agregado & { marcas: number; conteo: Record<EstadoStock, number>; excluido: Excluido };
  marcas: FilaMarca[];
  serie: PuntoSerie[];
  productos: FilaProducto[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export const pctVendido = (vendido: number, stock: number): number | null => {
  const v = Math.max(0, vendido);
  return v + stock > 0 ? r1((v / (v + stock)) * 100) : null;
};

export const coberturaDias = (stock: number, vendido: number, dias: number): number | null =>
  vendido > 0 && dias > 0 ? Math.round(stock / (vendido / dias)) : null;

export function estadoDe(stock: number, vendido: number, cobertura: number | null): EstadoStock {
  if (stock <= 0) return "agotada";
  if (vendido <= 0 || cobertura == null) return "sin_venta";
  if (cobertura < LIMITES.porAgotarse) return "por_agotarse";
  if (cobertura <= LIMITES.sana) return "sana";
  if (cobertura <= LIMITES.lenta) return "lenta";
  return "sobrestock";
}

const vacio = (): Agregado => ({
  stock: 0, disponible: null, vendido: 0, ventaUsd: 0, pct: null, pctAnterior: null, valor: 0, cobertura: null,
  productos: 0, conStock: 0, sinVenta: 0, valorSinVenta: 0, sinCosto: 0,
});

export function calcularStockMarca(periodo: Periodo, datos: DatosSede[], incluirIC: boolean): ResultadoStockMarca {
  const neto = (v: VentaProducto | undefined) =>
    v ? { u: incluirIC ? v.unidades : v.unidades - v.unidadesIC, usd: incluirIC ? v.usd : v.usd - v.usdIC } : { u: 0, usd: 0 };
  const hayReservado = datos.every((d) => d.reservado != null);
  const meses = datos[0]?.serie.meses ?? [];

  const productos: FilaProducto[] = [];
  const excluido: Excluido = { serviciosUsd: 0, consumiblesUnidades: 0, consumiblesUsd: 0, icUnidades: 0, icUsd: 0 };

  interface Acum extends Agregado {
    clave: string; nombres: Map<string, number>; vendidoAnt: number; stockAnt: number; hayAnterior: boolean;
    porSede: Map<number, { companyId: number; sede: string; stock: number; vendido: number; valor: number }>;
    serieV: number[]; serieS: number[];
  }
  const marcas = new Map<string, Acum>();
  const serieV = meses.map(() => 0);
  const serieS = meses.map(() => 0);
  const tot = { ...vacio(), disponible: hayReservado ? 0 : null } as Agregado;
  let vendidoAnt = 0;
  let stockAnt = 0;
  const hayAnterior = datos.every((d) => d.stockAnterior && d.ventasAnterior);

  for (const d of datos) {
    // Venta de lo que no lleva stock: queda fuera, pero se informa.
    for (const [id, v] of d.ventas) {
      const p = d.productos.get(id);
      if (!p || p.tipo === "product") {
        if (!incluirIC) { excluido.icUnidades += v.unidadesIC; excluido.icUsd += v.usdIC; }
        continue;
      }
      const n = neto(v);
      if (p.tipo === "service") excluido.serviciosUsd += n.usd;
      else { excluido.consumiblesUnidades += n.u; excluido.consumiblesUsd += n.usd; }
    }

    const ids = new Set<number>();
    for (const id of d.stock.keys()) ids.add(id);
    for (const [id, v] of d.ventas) { const n = neto(v); if (n.u !== 0 || n.usd !== 0) ids.add(id); }
    for (const id of d.serie.vendido.keys()) ids.add(id);
    for (const id of d.serie.stock.keys()) ids.add(id);
    if (d.stockAnterior) for (const id of d.stockAnterior.keys()) ids.add(id);

    for (const id of ids) {
      const p = d.productos.get(id);
      if (!p || p.tipo !== "product") continue;
      const stock = d.stock.get(id) ?? 0;
      const n = neto(d.ventas.get(id));
      const sv = d.serie.vendido.get(id);
      const ss = d.serie.stock.get(id);
      const sAnt = d.stockAnterior?.get(id) ?? 0;
      const vAnt = neto(d.ventasAnterior?.get(id)).u;
      const enPeriodo = stock > 0 || n.u !== 0 || n.usd !== 0;

      const clave = p.clave;
      let m = marcas.get(clave);
      if (!m) {
        m = { ...vacio(), disponible: hayReservado ? 0 : null, clave, nombres: new Map(), vendidoAnt: 0, stockAnt: 0, hayAnterior,
          porSede: new Map(), serieV: meses.map(() => 0), serieS: meses.map(() => 0) };
        marcas.set(clave, m);
      }
      for (let i = 0; i < meses.length; i++) {
        const v = sv?.[i] ?? 0;
        const s = ss?.[i] ?? 0;
        m.serieV[i] += v; m.serieS[i] += s; serieV[i] += v; serieS[i] += s;
      }
      m.vendidoAnt += vAnt; m.stockAnt += sAnt; vendidoAnt += vAnt; stockAnt += sAnt;
      if (!enPeriodo) continue;

      const reservado = d.reservado ? d.reservado.get(id) ?? 0 : null;
      const disponible = reservado != null ? Math.max(0, stock - reservado) : null;
      const costo = d.costo.get(id) ?? 0;
      const valor = r2(stock * costo);
      const cobertura = coberturaDias(stock, n.u, periodo.dias);
      productos.push({
        id, companyId: d.companyId, codigo: p.codigo, nombre: p.nombre, clave, marcaOdoo: p.marcaOdoo,
        categoria: p.categoria, activo: p.activo, stock, reservado, disponible, vendido: n.u, ventaUsd: r2(n.usd),
        pct: pctVendido(n.u, stock), costo, valor, cobertura, ultimaVenta: d.ultimaVenta.get(id) ?? null,
      });

      if (p.marcaOdoo) m.nombres.set(p.marcaOdoo, (m.nombres.get(p.marcaOdoo) ?? 0) + 1);
      for (const a of [m, tot]) {
        a.stock += stock;
        if (a.disponible != null && disponible != null) a.disponible += disponible;
        a.vendido += n.u;
        a.ventaUsd += n.usd;
        a.valor += valor;
        a.productos++;
        if (stock > 0) a.conStock++;
        if (stock > 0 && n.u <= 0) { a.sinVenta++; a.valorSinVenta += valor; }
        if (stock > 0 && costo <= 0) a.sinCosto++;
      }
      const ps = m.porSede.get(d.companyId) ?? { companyId: d.companyId, sede: d.sede, stock: 0, vendido: 0, valor: 0 };
      ps.stock += stock; ps.vendido += n.u; ps.valor += valor;
      m.porSede.set(d.companyId, ps);
    }
  }

  const cerrar = (a: Agregado, vAnt: number, sAnt: number) => {
    a.stock = r2(a.stock);
    if (a.disponible != null) a.disponible = r2(a.disponible);
    a.vendido = r2(a.vendido);
    a.ventaUsd = r2(a.ventaUsd);
    a.valor = r2(a.valor);
    a.valorSinVenta = r2(a.valorSinVenta);
    a.pct = pctVendido(a.vendido, a.stock);
    a.pctAnterior = hayAnterior ? pctVendido(vAnt, sAnt) : null;
    a.cobertura = coberturaDias(a.stock, a.vendido, periodo.dias);
  };
  const serie = (v: number[], s: number[]): PuntoSerie[] =>
    meses.map((mes, i) => ({ mes, vendido: r2(v[i]), stock: r2(s[i]), pct: pctVendido(v[i], s[i]) }));

  cerrar(tot, vendidoAnt, stockAnt);
  const conteo: Record<EstadoStock, number> = { agotada: 0, por_agotarse: 0, sana: 0, lenta: 0, sobrestock: 0, sin_venta: 0 };
  const filas: FilaMarca[] = [];
  for (const m of marcas.values()) {
    if (m.productos === 0) continue;
    cerrar(m, m.vendidoAnt, m.stockAnt);
    const nombre = [...m.nombres.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const estado = estadoDe(m.stock, m.vendido, m.cobertura);
    conteo[estado]++;
    filas.push({
      clave: m.clave,
      marca: m.clave === SIN_MARCA ? "Sin marca" : nombre || m.clave,
      generica: m.clave === SIN_MARCA || esMarcaGenerica(m.clave),
      stock: m.stock, disponible: m.disponible, vendido: m.vendido, ventaUsd: m.ventaUsd, pct: m.pct, pctAnterior: m.pctAnterior,
      valor: m.valor, cobertura: m.cobertura, productos: m.productos, conStock: m.conStock, sinVenta: m.sinVenta,
      valorSinVenta: m.valorSinVenta, sinCosto: m.sinCosto, estado,
      participacionStock: tot.stock > 0 ? r1((m.stock / tot.stock) * 100) : 0,
      porSede: [...m.porSede.values()].map((x) => ({ ...x, stock: r2(x.stock), vendido: r2(x.vendido), valor: r2(x.valor), pct: pctVendido(x.vendido, x.stock) })),
      serie: serie(m.serieV, m.serieS),
    });
  }
  filas.sort((a, b) => b.stock - a.stock || b.vendido - a.vendido);

  for (const k of Object.keys(excluido) as (keyof Excluido)[]) excluido[k] = r2(excluido[k]);
  return {
    periodo,
    incluyeIntercompania: incluirIC,
    sedes: datos.map((d) => ({ id: d.companyId, nombre: d.sede, almacen: d.almacen })),
    totales: { ...tot, marcas: filas.filter((f) => f.clave !== SIN_MARCA).length, conteo, excluido },
    marcas: filas,
    serie: serie(serieV, serieS),
    productos,
  };
}
