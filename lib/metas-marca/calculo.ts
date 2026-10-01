import { contarDiasUtiles, obtenerSemanasDelMes } from "@/lib/feriados";
import { fechaLocal } from "@/lib/stoplight/margen";
import type { LineaVenta } from "./odoo";
import { SIN_MARCA, esMarcaGenerica } from "./marcas";

/**
 * Cálculo de Metas por marca (puro, sin Odoo ni MySQL).
 *
 * Por marca:
 * - Cumplimiento = vendido ÷ meta del mes completo, SIN tope (una marca puede
 *   ir al 130%).
 * - Al día = vendido ÷ (meta × días hábiles transcurridos ÷ días hábiles del
 *   mes): dice si se va a ritmo de cumplir aunque falten días. En meses
 *   cerrados es igual al cumplimiento.
 * - Proyección = vendido ÷ días hábiles transcurridos × días hábiles del mes.
 * - Ritmo necesario = lo que falta ÷ días hábiles que quedan (sin hoy).
 *
 * Meta en unidades (opcional, lib/metas-marca/inventario.ts): la meta en $
 * sale de la proporción del inventario y es la que manda en el estado; las
 * unidades vendidas se comparan aparte contra la meta en unidades.
 *
 * Global (solo marcas con meta):
 * - Cumplimiento = Σ vendido ÷ Σ meta (lo que una marca vende de más compensa
 *   a otra).
 * - Sin compensar = Σ mín(vendido, meta) ÷ Σ meta: lo que vende de más una
 *   marca no tapa a la que no se vendió (mismo criterio que el tope del KPI
 *   Cobertura de marcas del Stoplight).
 */

export type EstadoMarca = "cumplida" | "en_ritmo" | "atencion" | "riesgo" | "sin_meta" | "pendiente";

export interface MetaEntrada {
  clave: string;
  marca: string;
  meta: number;
  metaUnidades?: number | null;
  stockBase?: number | null;
}
export interface HistorialMes { mes: string; porMarca: Map<string, number>; unidades?: Map<string, number> }

export interface TopItem { nombre: string; ingreso: number; detalle?: number }

export interface FilaMarca {
  clave: string;
  marca: string;
  generica: boolean;
  meta: number | null;
  vendido: number;
  /** % de la venta total de la sede en el mes. */
  participacion: number;
  cumplimiento: number | null;
  metaAlDia: number | null;
  cumplimientoAlDia: number | null;
  proyeccion: number | null;
  proyeccionPct: number | null;
  falta: number | null;
  ritmoNecesario: number | null;
  ritmoActual: number | null;
  estado: EstadoMarca;
  /** Venta de los 6 meses anteriores, del más viejo al más nuevo. */
  historial: number[];
  promedio3m: number;
  /** % vendido (o proyectado si el mes está en curso) vs el promedio de 3 meses. */
  variacionVsPromedio: number | null;
  facturas: number;
  clientes: number;
  /** Unidades netas vendidas en el mes (facturas − notas de crédito). */
  unidades: number;
  metaUnidades: number | null;
  /** Unidades disponibles cuando se cargó la meta en unidades. */
  stockBase: number | null;
  cumplimientoUnidades: number | null;
  promedioUnidades3m: number;
  semanas: { vendido: number; meta: number | null }[];
  topClientes: TopItem[];
  topVendedores: TopItem[];
  topProductos: TopItem[];
}

export interface ResumenMetasMarca {
  mes: string;
  periodo: {
    diasHabiles: number;
    diasTranscurridos: number;
    diasRestantes: number;
    avance: number;
    estado: "en_curso" | "cerrado" | "futuro";
  };
  historialMeses: string[];
  semanas: { label: string; inicio: string; fin: string; diasHabiles: number; vendido: number; meta: number | null; futura: boolean }[];
  totales: {
    ventaTotal: number;
    metaTotal: number;
    vendidoConMeta: number;
    ventaSinMeta: number;
    participacionConMeta: number | null;
    cumplimiento: number | null;
    cumplimientoSinCompensar: number | null;
    cumplimientoAlDia: number | null;
    metaAlDia: number | null;
    proyeccion: number | null;
    proyeccionPct: number | null;
    falta: number | null;
    ritmoNecesario: number | null;
    marcasConMeta: number;
    /** Marcas con meta en unidades, y sus unidades vendidas vs meta. */
    marcasConMetaUnidades: number;
    unidadesVendidasConMeta: number;
    metaUnidades: number;
    cumplimientoUnidades: number | null;
    marcasVendidas: number;
    conteo: Record<EstadoMarca, number>;
  };
  marcas: FilaMarca[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function top(mapa: Map<string, { ingreso: number; detalle: number }>, n = 5): TopItem[] {
  return [...mapa.entries()]
    .map(([nombre, v]) => ({ nombre, ingreso: r2(v.ingreso), detalle: r2(v.detalle) }))
    .sort((a, b) => b.ingreso - a.ingreso)
    .slice(0, n);
}

function sumar(mapa: Map<string, { ingreso: number; detalle: number }>, llave: string, ingreso: number, detalle: number) {
  const x = mapa.get(llave) ?? { ingreso: 0, detalle: 0 };
  x.ingreso += ingreso;
  x.detalle += detalle;
  mapa.set(llave, x);
}

export function estadoMarca(
  meta: number | null, vendido: number, alDia: number | null, periodo: ResumenMetasMarca["periodo"]["estado"],
): EstadoMarca {
  if (!meta || meta <= 0) return "sin_meta";
  if (periodo === "futuro") return "pendiente";
  if (vendido >= meta) return "cumplida";
  // Mes en curso sin ningún día hábil transcurrido (el 1 cae en fin de semana
  // o feriado): todavía no se esperaba vender nada.
  if (periodo === "en_curso" && alDia == null) return "pendiente";
  const base = periodo === "cerrado" ? (vendido / meta) * 100 : alDia ?? 0;
  if (periodo === "en_curso" && base >= 100) return "en_ritmo";
  if (base >= 70) return "atencion";
  return "riesgo";
}

export function calcularMetasMarca(
  mes: string,
  metas: MetaEntrada[],
  lineas: LineaVenta[],
  historial: HistorialMes[],
  hoy = new Date(),
): ResumenMetasMarca {
  const [anio, mesNum] = mes.split("-").map(Number);
  const inicioMes = new Date(anio, mesNum - 1, 1);
  const finMes = new Date(anio, mesNum, 0);
  const hoyDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  const estadoPeriodo = hoyDia > finMes ? "cerrado" : hoyDia < inicioMes ? "futuro" : "en_curso";
  const duMes = Math.max(1, contarDiasUtiles(inicioMes, finMes));
  const duTrans = estadoPeriodo === "cerrado" ? duMes : estadoPeriodo === "futuro" ? 0 : contarDiasUtiles(inicioMes, hoyDia);
  const duRest = Math.max(0, duMes - duTrans);
  const avance = duTrans / duMes;

  const semanasMes = obtenerSemanasDelMes(anio, mesNum);
  const idxSemana = (fecha: string) => {
    const d = fechaLocal(fecha);
    return semanasMes.findIndex((s) => d >= s.inicio && d <= s.fin);
  };

  interface Acum {
    vendido: number; unidades: number; nombres: Map<string, number>; facturas: Set<number>; clientes: Set<number>;
    semanas: number[]; cli: Map<string, { ingreso: number; detalle: number }>;
    ven: Map<string, { ingreso: number; detalle: number }>; prod: Map<string, { ingreso: number; detalle: number }>;
  }
  const acum = new Map<string, Acum>();
  const nuevo = (): Acum => ({
    vendido: 0, unidades: 0, nombres: new Map(), facturas: new Set(), clientes: new Set(),
    semanas: semanasMes.map(() => 0), cli: new Map(), ven: new Map(), prod: new Map(),
  });

  let ventaTotal = 0;
  for (const l of lineas) {
    ventaTotal += l.ingreso;
    const a = acum.get(l.clave) ?? nuevo();
    acum.set(l.clave, a);
    a.vendido += l.ingreso;
    a.unidades += l.cantidad;
    if (l.marcaOdoo) a.nombres.set(l.marcaOdoo, (a.nombres.get(l.marcaOdoo) || 0) + Math.abs(l.ingreso));
    a.facturas.add(l.facturaId);
    if (l.clienteId) a.clientes.add(l.clienteId);
    const i = idxSemana(l.fecha);
    if (i !== -1) a.semanas[i] += l.ingreso;
    sumar(a.cli, l.cliente || "(sin cliente)", l.ingreso, 0);
    sumar(a.ven, l.vendedor || "(sin vendedor)", l.ingreso, 0);
    sumar(a.prod, l.codigo ? `[${l.codigo}] ${l.producto}` : l.producto, l.ingreso, l.cantidad);
  }

  // Con varias sedes, las metas de la misma marca se suman ($ y unidades).
  const metaPorClave = new Map<string, MetaEntrada>();
  for (const m of metas) {
    const x = metaPorClave.get(m.clave);
    if (!x) { metaPorClave.set(m.clave, { ...m }); continue; }
    x.meta += m.meta;
    if (m.metaUnidades) x.metaUnidades = (x.metaUnidades || 0) + m.metaUnidades;
    if (m.stockBase) x.stockBase = (x.stockBase || 0) + m.stockBase;
  }

  const claves = new Set<string>([...acum.keys(), ...metaPorClave.keys()]);
  const marcas: FilaMarca[] = [];
  for (const clave of claves) {
    const a = acum.get(clave) ?? nuevo();
    const m = metaPorClave.get(clave);
    const meta = m && m.meta > 0 ? m.meta : null;
    const nombreOdoo = [...a.nombres.entries()].sort((x, y) => y[1] - x[1])[0]?.[0]?.trim();
    const vendido = a.vendido;
    const metaAlDia = meta != null ? meta * avance : null;
    const alDia = metaAlDia != null && metaAlDia > 0 ? pct(vendido, metaAlDia) : null;
    const proyeccion = estadoPeriodo === "futuro" ? null : estadoPeriodo === "cerrado" ? vendido : duTrans > 0 ? (vendido / duTrans) * duMes : null;
    const falta = meta != null ? Math.max(0, meta - vendido) : null;
    const hist = historial.map((h) => r2(h.porMarca.get(clave) || 0));
    const ult3 = hist.slice(-3);
    const promedio3m = ult3.length ? ult3.reduce((s, x) => s + x, 0) / ult3.length : 0;
    const ult3u = historial.slice(-3).map((h) => h.unidades?.get(clave) || 0);
    const promedioUnidades3m = ult3u.length ? ult3u.reduce((s, x) => s + x, 0) / ult3u.length : 0;
    // Mes futuro: todavía no hay venta que comparar (antes daba -100% en todas).
    const comparable = estadoPeriodo === "futuro" ? null : estadoPeriodo === "en_curso" ? proyeccion : vendido;
    const metaUnidades = m?.metaUnidades && m.metaUnidades > 0 ? m.metaUnidades : null;

    marcas.push({
      clave,
      marca: nombreOdoo || m?.marca || clave,
      generica: clave === SIN_MARCA || esMarcaGenerica(clave),
      meta: meta != null ? r2(meta) : null,
      vendido: r2(vendido),
      participacion: pct(vendido, ventaTotal) ?? 0,
      cumplimiento: meta != null ? pct(vendido, meta) : null,
      metaAlDia: metaAlDia != null ? r2(metaAlDia) : null,
      cumplimientoAlDia: alDia,
      proyeccion: proyeccion != null ? r2(proyeccion) : null,
      proyeccionPct: meta != null && proyeccion != null ? pct(proyeccion, meta) : null,
      falta: falta != null ? r2(falta) : null,
      ritmoNecesario: falta != null && falta > 0 && duRest > 0 ? r2(falta / duRest) : null,
      ritmoActual: duTrans > 0 && estadoPeriodo !== "futuro" ? r2(vendido / duTrans) : null,
      estado: estadoMarca(meta, vendido, alDia, estadoPeriodo),
      historial: hist,
      promedio3m: r2(promedio3m),
      variacionVsPromedio: promedio3m > 0 && comparable != null ? Math.round(((comparable - promedio3m) / promedio3m) * 1000) / 10 : null,
      facturas: a.facturas.size,
      clientes: a.clientes.size,
      unidades: r2(a.unidades),
      metaUnidades: metaUnidades != null ? r2(metaUnidades) : null,
      stockBase: metaUnidades != null && m?.stockBase ? r2(m.stockBase) : null,
      cumplimientoUnidades: metaUnidades != null ? pct(a.unidades, metaUnidades) : null,
      promedioUnidades3m: r2(promedioUnidades3m),
      semanas: a.semanas.map((v, i) => ({
        vendido: r2(v),
        meta: meta != null ? r2((meta * semanasMes[i].diasUtiles) / duMes) : null,
      })),
      topClientes: top(a.cli),
      topVendedores: top(a.ven),
      topProductos: top(a.prod),
    });
  }
  marcas.sort((x, y) => (y.meta ?? -1) - (x.meta ?? -1) || y.vendido - x.vendido);

  const conMeta = marcas.filter((x) => x.meta != null);
  const metaTotal = conMeta.reduce((s, x) => s + (x.meta || 0), 0);
  const vendidoConMeta = conMeta.reduce((s, x) => s + x.vendido, 0);
  const sinCompensar = conMeta.reduce((s, x) => s + Math.min(Math.max(x.vendido, 0), x.meta || 0), 0);
  const metaAlDiaTotal = metaTotal > 0 ? metaTotal * avance : null;
  const proyeccionTotal = estadoPeriodo === "futuro" ? null : estadoPeriodo === "cerrado" ? vendidoConMeta : duTrans > 0 ? (vendidoConMeta / duTrans) * duMes : null;
  const faltaTotal = metaTotal > 0 ? conMeta.reduce((s, x) => s + (x.falta || 0), 0) : null;
  const conMetaU = marcas.filter((x) => x.metaUnidades != null);
  const metaUnidadesTotal = conMetaU.reduce((s, x) => s + (x.metaUnidades || 0), 0);
  const unidadesConMetaU = conMetaU.reduce((s, x) => s + x.unidades, 0);

  const conteo: Record<EstadoMarca, number> = { cumplida: 0, en_ritmo: 0, atencion: 0, riesgo: 0, sin_meta: 0, pendiente: 0 };
  for (const x of marcas) if (x.meta != null || x.vendido !== 0) conteo[x.estado]++;

  return {
    mes,
    periodo: { diasHabiles: duMes, diasTranscurridos: duTrans, diasRestantes: duRest, avance: Math.round(avance * 1000) / 10, estado: estadoPeriodo },
    historialMeses: historial.map((h) => h.mes),
    semanas: semanasMes.map((s, i) => ({
      label: `${s.inicio.getDate()}–${s.fin.getDate()}`,
      inicio: iso(s.inicio),
      fin: iso(s.fin),
      diasHabiles: s.diasUtiles,
      vendido: r2(conMeta.reduce((acc, x) => acc + x.semanas[i].vendido, 0)),
      meta: metaTotal > 0 ? r2((metaTotal * s.diasUtiles) / duMes) : null,
      futura: s.inicio > hoyDia,
    })),
    totales: {
      ventaTotal: r2(ventaTotal),
      metaTotal: r2(metaTotal),
      vendidoConMeta: r2(vendidoConMeta),
      ventaSinMeta: r2(ventaTotal - vendidoConMeta),
      participacionConMeta: pct(vendidoConMeta, ventaTotal),
      cumplimiento: pct(vendidoConMeta, metaTotal),
      cumplimientoSinCompensar: pct(sinCompensar, metaTotal),
      cumplimientoAlDia: metaAlDiaTotal ? pct(vendidoConMeta, metaAlDiaTotal) : null,
      metaAlDia: metaAlDiaTotal != null ? r2(metaAlDiaTotal) : null,
      proyeccion: proyeccionTotal != null ? r2(proyeccionTotal) : null,
      proyeccionPct: proyeccionTotal != null ? pct(proyeccionTotal, metaTotal) : null,
      falta: faltaTotal != null ? r2(faltaTotal) : null,
      ritmoNecesario: faltaTotal && duRest > 0 ? r2(faltaTotal / duRest) : null,
      marcasConMeta: conMeta.length,
      marcasConMetaUnidades: conMetaU.length,
      unidadesVendidasConMeta: r2(unidadesConMetaU),
      metaUnidades: r2(metaUnidadesTotal),
      cumplimientoUnidades: pct(unidadesConMetaU, metaUnidadesTotal),
      marcasVendidas: marcas.filter((x) => x.vendido > 0).length,
      conteo,
    },
    marcas,
  };
}
