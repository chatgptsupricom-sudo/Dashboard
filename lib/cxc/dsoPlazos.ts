// DSO por tipo de cobro (plazo de pago) y sin las negociaciones especiales
// (lib/cxc/dso.ts). Puro, sin imports: lo prueba `node scripts/check-cupo-credito.cjs`.
//
// El DSO general mezcla clientes que pagan a 15 días con otros que pagan a 60:
// un DSO de 40 días es bueno para la cartera a 45 y malo para la de 15. Por
// eso, además del número general, cada tramo de plazo tiene su DSO y se
// compara con el plazo que se le dio (días de atraso = DSO − plazo promedio).
//
// Plazo de una factura = vencimiento − fecha de factura, en días (el nombre
// del plazo en Odoo no es confiable, ver CLAUDE.md). Una nota de crédito toma
// el plazo de la factura que revierte; si no se sabe, el más reciente del
// cliente; si tampoco, queda en "Sin plazo".

export type TramoPlazo = "hasta15" | "hasta30" | "hasta45" | "hasta60" | "mas60" | "sin_plazo";

export const TRAMOS_PLAZO: { id: TramoPlazo; label: string; hasta: number }[] = [
  { id: "hasta15", label: "Hasta 15 días", hasta: 15 },
  { id: "hasta30", label: "16 a 30 días", hasta: 30 },
  { id: "hasta45", label: "31 a 45 días", hasta: 45 },
  { id: "hasta60", label: "46 a 60 días", hasta: 60 },
  { id: "mas60", label: "Más de 60 días", hasta: Infinity },
];

export function tramoDePlazo(dias: number | null): TramoPlazo {
  if (dias == null || !Number.isFinite(dias)) return "sin_plazo";
  for (const t of TRAMOS_PLAZO) if (dias <= t.hasta) return t.id;
  return "mas60";
}

const DIA_MS = 86_400_000;
/** Días entre la fecha de la factura y su vencimiento; null si falta alguna. */
export function diasDePlazo(fecha: string | null | undefined, vence: string | null | undefined): number | null {
  if (!fecha || !vence) return null;
  const d = Math.round((new Date(`${vence}T00:00:00Z`).getTime() - new Date(`${fecha}T00:00:00Z`).getTime()) / DIA_MS);
  return Number.isFinite(d) ? Math.max(0, d) : null;
}

/** Documento para el cálculo: una factura o NC con su saldo y/o su venta del período. */
export interface DocDso {
  id: number;
  companyId: number;
  partnerId: number;
  esNC: boolean;
  /** Factura que revierte (solo NC). */
  revierte: number | null;
  fecha: string | null;
  vence: string | null;
  /** Saldo a crédito al cierre (0 si no está abierto). */
  saldo: number;
  /** Venta del período con signo (NC en negativo); 0 si no es del período. */
  venta: number;
}

export interface TramoDso {
  id: TramoPlazo;
  label: string;
  saldo: number;
  ventas: number;
  /** null sin ventas en el período. */
  dso: number | null;
  /** Plazo promedio de lo vendido en el tramo, ponderado por venta. */
  plazoPromedio: number | null;
  /** DSO − plazo promedio: cuánto más (o menos) de lo pactado tarda en cobrarse. */
  atraso: number | null;
  clientes: number;
}

export interface GrupoDso {
  saldo: number;
  ventas: number;
  dso: number | null;
  clientes: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Plazo de cada documento: el suyo; una NC el de la factura que revierte; si
 * no, el plazo de la factura más reciente de ese cliente.
 */
export function plazosDeDocs(docs: DocDso[], plazoExterno: Map<number, number | null> = new Map()): Map<number, number | null> {
  const propio = new Map<number, number | null>();
  const ultimoDelCliente = new Map<number, { fecha: string; dias: number }>();
  for (const d of docs) {
    if (d.esNC) continue;
    const dias = diasDePlazo(d.fecha, d.vence);
    propio.set(d.id, dias);
    if (dias != null && d.fecha) {
      const u = ultimoDelCliente.get(d.partnerId);
      if (!u || d.fecha > u.fecha) ultimoDelCliente.set(d.partnerId, { fecha: d.fecha, dias });
    }
  }
  const out = new Map<number, number | null>();
  for (const d of docs) {
    if (!d.esNC) { out.set(d.id, propio.get(d.id) ?? null); continue; }
    const deLaFactura = d.revierte != null ? (propio.get(d.revierte) ?? plazoExterno.get(d.revierte) ?? null) : null;
    out.set(d.id, deLaFactura ?? ultimoDelCliente.get(d.partnerId)?.dias ?? null);
  }
  return out;
}

/** DSO de cada tramo de plazo (solo documentos que no son de negociaciones especiales). */
export function dsoPorTramo(docs: DocDso[], plazos: Map<number, number | null>, dias: number): TramoDso[] {
  const acc = new Map<TramoPlazo, { saldo: number; ventas: number; diasPorVenta: number; ventaConPlazo: number; clientes: Set<number> }>();
  for (const d of docs) {
    const plazo = plazos.get(d.id) ?? null;
    const t = tramoDePlazo(plazo);
    if (!acc.has(t)) acc.set(t, { saldo: 0, ventas: 0, diasPorVenta: 0, ventaConPlazo: 0, clientes: new Set() });
    const a = acc.get(t)!;
    a.saldo += d.saldo;
    a.ventas += d.venta;
    if (plazo != null && d.venta > 0) { a.diasPorVenta += plazo * d.venta; a.ventaConPlazo += d.venta; }
    if (Math.abs(d.saldo) >= 0.005 || Math.abs(d.venta) >= 0.005) a.clientes.add(d.partnerId);
  }
  const tramos = [...TRAMOS_PLAZO, { id: "sin_plazo" as const, label: "Sin plazo identificado", hasta: NaN }];
  return tramos
    .filter((t) => acc.has(t.id))
    .map((t) => {
      const a = acc.get(t.id)!;
      const dso = a.ventas > 0 ? Math.round((a.saldo / a.ventas) * dias) : null;
      const plazoPromedio = a.ventaConPlazo > 0 ? Math.round(a.diasPorVenta / a.ventaConPlazo) : null;
      return {
        id: t.id,
        label: t.label,
        saldo: r2(a.saldo),
        ventas: r2(a.ventas),
        dso,
        plazoPromedio,
        atraso: dso != null && plazoPromedio != null ? dso - plazoPromedio : null,
        clientes: a.clientes.size,
      };
    })
    .filter((t) => Math.abs(t.saldo) >= 0.005 || Math.abs(t.ventas) >= 0.005);
}

/** Suma de saldo y ventas de un grupo de documentos, con su DSO. */
export function grupoDso(docs: DocDso[], dias: number): GrupoDso {
  const saldo = docs.reduce((s, d) => s + d.saldo, 0);
  const ventas = docs.reduce((s, d) => s + d.venta, 0);
  return {
    saldo: r2(saldo),
    ventas: r2(ventas),
    dso: ventas > 0 ? Math.round((saldo / ventas) * dias) : null,
    clientes: new Set(docs.filter((d) => Math.abs(d.saldo) >= 0.005 || Math.abs(d.venta) >= 0.005).map((d) => d.partnerId)).size,
  };
}
