import {
  almacenSede,
  almacenables,
  cachear,
  costos,
  diasEntre,
  disponible,
  hoyCaracas,
  sumarDias,
  ultimaVenta,
  unidadesVendidas,
} from "@/lib/compras/datosOdoo";
import {
  DIAS_INVENTARIO_DESEADO,
  calcularSugerido,
  clasificarABC,
  nivelAlerta,
  type ClaseABC,
} from "@/lib/compras/sugeridos";
import { leerSugeridos } from "@/lib/compras/sugeridosDatos";

/**
 * Las tablas de Compras armadas sobre lib/compras/datosOdoo.ts. Cada una la
 * usa su pantalla y, cuando corresponde, el resumen de /compras, para que la
 * tarjeta y la pantalla a la que lleva digan lo mismo.
 */

// ---------------------------------------------------------------------------
// Menor rotación (inventario estancado)
// ---------------------------------------------------------------------------

/** Días sin vender desde los que un producto con stock cuenta como estancado. */
export const DIAS_ESTANCADO = 30;

export interface FilaMenorRotacion {
  id: number;
  codigo: string;
  descripcion: string;
  marca: string;
  categoria: string;
  /** Disponible en el almacén principal (físico − reservado para pedidos). */
  stockDisponible: number;
  costo: number;
  /** Días desde la última venta; null = nunca se vendió en la sede. */
  days_inactive: number | null;
  /** Fecha de la última venta (factura o recibo de cliente), o null. */
  ultimaVenta: string | null;
  /** Día en que entró la unidad más vieja del stock (para los que nunca se vendieron). */
  enStockDesde: string | null;
}

/**
 * Productos con stock disponible que no se venden hace DIAS_ESTANCADO días o
 * más. Días inactivos = días desde la última venta del producto en la sede
 * (facturas y recibos de cliente, en Odoo o en Smartbit antes del corte); una
 * nota de crédito no es una venta. Un producto que nunca se vendió entra si
 * lleva DIAS_ESTANCADO días en el almacén: lo que llegó la semana pasada
 * todavía no tuvo tiempo de venderse (en Panamá, 500 impresoras Canon
 * MF465DW II recibidas el 24-sep salían como $152k "estancados").
 */
export function menorRotacion(sedeId: number): Promise<FilaMenorRotacion[]> {
  const hoy = hoyCaracas();
  return cachear(`menor|${sedeId}|${hoy}`, async () => {
    const [productos, almacen, ultima, costo] = await Promise.all([
      almacenables(),
      almacenSede(sedeId),
      ultimaVenta(sedeId),
      costos(sedeId),
    ]);
    const filas: FilaMenorRotacion[] = [];
    for (const p of productos) {
      const stock = disponible(almacen.stock.get(p.id));
      if (stock <= 0) continue;
      const s = almacen.stock.get(p.id)!;
      const u = ultima.get(p.id) ?? null;
      const dias = u ? diasEntre(u, hoy) : null;
      if (dias !== null ? dias < DIAS_ESTANCADO : !s.enStockDesde || diasEntre(s.enStockDesde, hoy) < DIAS_ESTANCADO) continue;
      filas.push({
        id: p.id,
        codigo: p.codigo,
        descripcion: p.nombre,
        marca: p.marca,
        categoria: p.categoria,
        stockDisponible: stock,
        costo: costo.get(p.id) ?? 0,
        days_inactive: dias,
        ultimaVenta: u,
        enStockDesde: s.enStockDesde,
      });
    }
    // Los que nunca se vendieron primero (el que lleva más tiempo en el
    // almacén arriba), después el que lleva más días sin venderse.
    return filas.sort(
      (a, b) =>
        (b.days_inactive ?? Infinity) - (a.days_inactive ?? Infinity) ||
        String(a.enStockDesde ?? "").localeCompare(String(b.enStockDesde ?? "")),
    );
  });
}

// ---------------------------------------------------------------------------
// Mayor rotación (alerta de quiebre) y Cobertura: mismos datos y cálculo que
// Sugeridos (la hoja del comprador).
// ---------------------------------------------------------------------------

export interface FilaQuiebre {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  ventas45d: number;
  fisico: number;
  reservado: number;
  /** Físico − reservado. */
  stockDisponible: number;
  transito: number;
  /** Lo que la hoja compara contra el punto de reorden (disponible + tránsito, con el tránsito dos veces como en el Excel). */
  stockEfectivo: number;
  demandaDiaria: number;
  eta: number;
  puntoReorden: number;
  cantidadAComprar: number;
  costo: number;
  nivelCritico: "QUIEBRE TOTAL" | "RIESGO ALTO";
  /** Días hasta quedarse sin stock con la demanda actual. */
  diasHastaQuiebre: number;
}

export async function alertasQuiebre(sedeId: number): Promise<FilaQuiebre[]> {
  const { data } = await leerSugeridos(sedeId);
  const filas: FilaQuiebre[] = [];
  for (const f of data) {
    const c = calcularSugerido(f);
    const nivel = nivelAlerta(f, c);
    if (!nivel) continue;
    filas.push({
      id: f.id,
      codigo: f.codigo,
      name: f.name,
      marca: f.marca,
      categoria: f.categoria,
      ventas45d: f.ventas45d,
      fisico: f.fisico,
      reservado: f.reservado,
      stockDisponible: Math.max(0, f.fisico - f.reservado),
      transito: f.transito,
      stockEfectivo: c.stockEfectivo,
      demandaDiaria: c.demandaDiaria,
      eta: c.eta,
      puntoReorden: c.puntoReorden,
      cantidadAComprar: c.compraFinal,
      costo: f.costo,
      nivelCritico: nivel === "quiebre" ? "QUIEBRE TOTAL" : "RIESGO ALTO",
      diasHastaQuiebre: c.diasHastaQuiebre,
    });
  }
  return filas.sort((a, b) => b.ventas45d - a.ventas45d);
}

export interface FilaCobertura {
  id: number;
  codigo: string;
  name: string;
  marca: string;
  categoria: string;
  abc: ClaseABC;
  stockDisponible: number;
  ventas45d: number;
  demandaDiaria: number;
  diasCobertura: number;
  diasInvDeseado: number;
  costo: number;
}

/**
 * Cuántos días alcanza el stock disponible con la venta de los últimos 45
 * días. La clase ABC y los días deseados son los de Sugeridos.
 */
export async function coberturaStock(sedeId: number): Promise<FilaCobertura[]> {
  const { data } = await leerSugeridos(sedeId);
  const filas: FilaCobertura[] = [];
  for (const f of data) {
    const stock = Math.max(0, f.fisico - f.reservado);
    if (f.ventas45d <= 0 || stock <= 0) continue;
    const c = calcularSugerido(f);
    const demandaDiaria = f.ventas45d / 45;
    filas.push({
      id: f.id,
      codigo: f.codigo,
      name: f.name,
      marca: f.marca,
      categoria: f.categoria,
      abc: c.abc,
      stockDisponible: stock,
      ventas45d: f.ventas45d,
      demandaDiaria,
      diasCobertura: Math.floor(stock / demandaDiaria),
      diasInvDeseado: DIAS_INVENTARIO_DESEADO[c.abc],
      costo: f.costo,
    });
  }
  return filas.sort((a, b) => b.ventas45d - a.ventas45d);
}

// ---------------------------------------------------------------------------
// Rotación por categoría
// ---------------------------------------------------------------------------

/** Días sin vender desde los que el stock de una categoría cuenta como estancado. */
export const DIAS_SIN_ROTACION_CATEGORIA = 45;

export interface ProductoRotacion {
  id: number;
  codigo: string;
  nombre: string;
  categoria: string;
  stock: number;
  ventas45d: number;
  costo: number;
  capitalEstancado: number;
  quiebre: boolean;
  abc: ClaseABC;
  ultimaVenta: string | null;
}

export interface CategoriaRotacion {
  nombre: string;
  skus: number;
  clasA: number;
  clasB: number;
  clasC: number;
  pctA: number;
  pctB: number;
  pctC: number;
  ventas45d: number;
  stockTotal: number;
  capitalEstancado: number;
  skusQuiebre: number;
}

/**
 * Productos almacenables con stock o con venta en 45 días, agrupados por
 * categoría. ABC = la de Sugeridos (valor vendido en el año); estancado =
 * stock sin venta hace más de DIAS_SIN_ROTACION_CATEGORIA días (los que nunca
 * se vendieron, desde que entraron al almacén); quiebre = sin stock
 * disponible con venta en 45 días.
 */
export function rotacionPorCategoria(sedeId: number): Promise<{ categorias: CategoriaRotacion[]; productos: ProductoRotacion[] }> {
  const hoy = hoyCaracas();
  return cachear(`rotcat|${sedeId}|${hoy}`, async () => {
    const [productos, almacen, v45, v365, ultima, costo] = await Promise.all([
      almacenables(),
      almacenSede(sedeId),
      unidadesVendidas(sedeId, sumarDias(hoy, -44), hoy),
      unidadesVendidas(sedeId, sumarDias(hoy, -364), hoy),
      ultimaVenta(sedeId),
      costos(sedeId),
    ]);

    const filas: ProductoRotacion[] = [];
    for (const p of productos) {
      const s = almacen.stock.get(p.id);
      const stock = disponible(s);
      const ventas45d = Math.max(0, Math.round(v45.get(p.id) ?? 0));
      if (stock <= 0 && ventas45d <= 0) continue;
      const c = costo.get(p.id) ?? 0;
      const u = ultima.get(p.id) ?? null;
      // Igual que Menor rotación: desde la última venta, o si nunca se vendió,
      // desde que entró al almacén (lo recién llegado no está estancado).
      const desde = u ?? s?.enStockDesde ?? null;
      const sinRotar = !!desde && diasEntre(desde, hoy) > DIAS_SIN_ROTACION_CATEGORIA;
      filas.push({
        id: p.id,
        codigo: p.codigo,
        nombre: p.nombre,
        categoria: p.categoria,
        stock,
        ventas45d,
        costo: Math.round(c * 100) / 100,
        capitalEstancado: stock > 0 && sinRotar ? Math.round(stock * c) : 0,
        quiebre: stock <= 0 && ventas45d > 0,
        abc: clasificarABC(Math.max(0, v365.get(p.id) ?? 0), c),
        ultimaVenta: u,
      });
    }
    filas.sort((a, b) => b.ventas45d - a.ventas45d);

    const porCategoria = new Map<string, CategoriaRotacion>();
    for (const f of filas) {
      let cat = porCategoria.get(f.categoria);
      if (!cat) {
        cat = { nombre: f.categoria, skus: 0, clasA: 0, clasB: 0, clasC: 0, pctA: 0, pctB: 0, pctC: 0, ventas45d: 0, stockTotal: 0, capitalEstancado: 0, skusQuiebre: 0 };
        porCategoria.set(f.categoria, cat);
      }
      cat.skus++;
      if (f.abc === "A") cat.clasA++;
      else if (f.abc === "B") cat.clasB++;
      else cat.clasC++;
      cat.ventas45d += f.ventas45d;
      cat.stockTotal += f.stock;
      cat.capitalEstancado += f.capitalEstancado;
      if (f.quiebre) cat.skusQuiebre++;
    }
    const categorias = [...porCategoria.values()]
      .map((c) => ({
        ...c,
        stockTotal: Math.round(c.stockTotal),
        pctA: Math.round((c.clasA / c.skus) * 100),
        pctB: Math.round((c.clasB / c.skus) * 100),
        pctC: Math.round((c.clasC / c.skus) * 100),
      }))
      .sort((a, b) => b.ventas45d - a.ventas45d);
    return { categorias, productos: filas };
  });
}
