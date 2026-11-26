/**
 * Mercancía que Caracas le compra a Valencia (lib/ventas/mercanciaValencia.ts):
 * Valencia le factura todo a SUPRICOM CCS de una vez, pero la despacha por
 * partes. Lo que queda en Valencia = facturado − despachado de cada línea del
 * pedido. Sin imports: lo prueba `node scripts/check-mercancia-valencia.cjs`.
 */

export interface LineaMercancia {
  lineaId: number;
  pedido: string;
  pedidoId: number;
  /** Facturas de la línea (sin NC), la más vieja primero. */
  facturas: string[];
  /** Fecha de la primera factura (YYYY-MM-DD). */
  fechaFactura: string | null;
  productoId: number;
  codigo: string;
  producto: string;
  marca: string;
  facturado: number;
  despachado: number;
  /** Facturado y todavía en Valencia (nunca negativo). */
  pendiente: number;
  precio: number;
  montoFacturado: number;
  montoPendiente: number;
  /** Días desde la primera factura hasta hoy (solo si queda pendiente). */
  diasEsperando: number | null;
  /** Despacho abierto en Valencia (nombre y fecha prevista), si hay. */
  despachoAbierto: string | null;
  fechaPrevista: string | null;
}

export interface ProductoMercancia {
  productoId: number;
  codigo: string;
  producto: string;
  marca: string;
  facturado: number;
  despachado: number;
  pendiente: number;
  montoPendiente: number;
  pedidos: number;
  /** Factura pendiente más vieja (YYYY-MM-DD). */
  desde: string | null;
  diasEsperando: number | null;
}

export interface ResumenMercancia {
  facturado: number;
  despachado: number;
  pendiente: number;
  montoFacturado: number;
  montoPendiente: number;
  pedidos: number;
  productosPendientes: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

const diasEntre = (desde: string, hoy: string) =>
  Math.max(0, Math.round((Date.parse(hoy) - Date.parse(desde)) / 86_400_000));

/** Arma la línea con lo que queda en Valencia. `hoy` = YYYY-MM-DD. */
export function armarLinea(
  base: Omit<LineaMercancia, "pendiente" | "montoFacturado" | "montoPendiente" | "diasEsperando">,
  hoy: string,
): LineaMercancia {
  const pendiente = r2(Math.max(0, base.facturado - base.despachado));
  return {
    ...base,
    pendiente,
    montoFacturado: r2(base.facturado * base.precio),
    montoPendiente: r2(pendiente * base.precio),
    diasEsperando: pendiente > 0 && base.fechaFactura ? diasEntre(base.fechaFactura, hoy) : null,
  };
}

/** Líneas facturadas en el mes (YYYY-MM); "todos" = todas. */
export function delMes(lineas: LineaMercancia[], mes: string): LineaMercancia[] {
  if (mes === "todos") return lineas;
  return lineas.filter((l) => (l.fechaFactura || "").startsWith(mes));
}

export function resumir(lineas: LineaMercancia[]): ResumenMercancia {
  const s = { facturado: 0, despachado: 0, pendiente: 0, montoFacturado: 0, montoPendiente: 0 };
  for (const l of lineas) {
    s.facturado += l.facturado;
    s.despachado += Math.min(l.despachado, l.facturado);
    s.pendiente += l.pendiente;
    s.montoFacturado += l.montoFacturado;
    s.montoPendiente += l.montoPendiente;
  }
  return {
    facturado: r2(s.facturado),
    despachado: r2(s.despachado),
    pendiente: r2(s.pendiente),
    montoFacturado: r2(s.montoFacturado),
    montoPendiente: r2(s.montoPendiente),
    pedidos: new Set(lineas.map((l) => l.pedidoId)).size,
    productosPendientes: new Set(lineas.filter((l) => l.pendiente > 0).map((l) => l.productoId)).size,
  };
}

/** Lo pendiente agrupado por producto (varios pedidos del mismo producto suman). */
export function porProducto(lineas: LineaMercancia[], hoy: string): ProductoMercancia[] {
  const mapa = new Map<number, ProductoMercancia & { _pedidos: Set<number> }>();
  for (const l of lineas) {
    if (l.pendiente <= 0) continue;
    let p = mapa.get(l.productoId);
    if (!p) {
      p = {
        productoId: l.productoId, codigo: l.codigo, producto: l.producto, marca: l.marca,
        facturado: 0, despachado: 0, pendiente: 0, montoPendiente: 0, pedidos: 0,
        desde: null, diasEsperando: null, _pedidos: new Set(),
      };
      mapa.set(l.productoId, p);
    }
    p.facturado += l.facturado;
    p.despachado += l.despachado;
    p.pendiente += l.pendiente;
    p.montoPendiente += l.montoPendiente;
    p._pedidos.add(l.pedidoId);
    if (l.fechaFactura && (!p.desde || l.fechaFactura < p.desde)) p.desde = l.fechaFactura;
  }
  return [...mapa.values()]
    .map(({ _pedidos, ...p }) => ({
      ...p,
      facturado: r2(p.facturado),
      despachado: r2(p.despachado),
      pendiente: r2(p.pendiente),
      montoPendiente: r2(p.montoPendiente),
      pedidos: _pedidos.size,
      diasEsperando: p.desde ? diasEntre(p.desde, hoy) : null,
    }))
    .sort((a, b) => b.montoPendiente - a.montoPendiente);
}
