import { analizarAnuladas, analizarNotas, analizarReabiertas, resumir, type FilaAnulada, type FilaNC, type FilaReabierta } from "./analisis";
import {
  aCaracas, facturasCercanas, idsReabiertos, leerAnulados, leerDocumentos, leerHistorial, leerNotasCredito,
  ncPorFactura, nombreSede, serieMensual, SEDES, esSedeValida, totalesSede, ventasPorVendedor,
  type Cambio, type Documento, type Evento,
} from "./odoo";

export const fechaValida = (s: string | null | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) ? s : null);

/** Hoy en Caracas ("YYYY-MM-DD"): el servidor corre en UTC. */
export const hoyCaracas = () => (aCaracas(new Date().toISOString().slice(0, 19).replace("T", " ")) || "").slice(0, 10);

/** `company_id` = 9 | 10 | 7 | "todas". Sin parámetro, Valencia. */
export function sedesDe(param: string | null): number[] | null {
  if (!param) return [9];
  if (param === "todas") return SEDES.map((s) => s.id);
  const id = Number(param);
  return esSedeValida(id) ? [id] : null;
}

export interface DatosSede {
  companyId: number;
  notas: FilaNC[];
  anuladas: FilaAnulada[];
  reabiertas: FilaReabierta[];
  totales: { ventas: number; facturas: number };
  serie: { mes: string; ventas: number; notas: number; cantidadNotas: number }[];
  ventasVendedor: Map<string, number>;
  /** Para la verificación de datos. */
  crudo: { notas: Documento[]; anulados: Documento[]; origenes: Map<number, Documento>; eventos: Evento[]; cambios: Cambio[] };
}

async function leerSede(companyId: number, desde: string, hasta: string): Promise<DatosSede> {
  const hoy = hoyCaracas();
  const [notas, anulados, reabIds, totales, serie, ventasVendedor] = await Promise.all([
    leerNotasCredito(companyId, desde, hasta),
    leerAnulados(companyId, desde, hasta),
    idsReabiertos(companyId, desde, hasta),
    totalesSede(companyId, desde, hasta),
    serieMensual(companyId, hasta, 12),
    ventasPorVendedor(companyId, desde, hasta),
  ]);

  const origenIds = [...new Set(notas.map((n) => n.origenId).filter((x): x is number => !!x))];
  const [origenesLista, ncFactura, reabDocs, historial] = await Promise.all([
    leerDocumentos(origenIds),
    ncPorFactura(origenIds),
    leerDocumentos(reabIds),
    leerHistorial([...new Set([...anulados.map((a) => a.id), ...reabIds])]),
  ]);
  const origenes = new Map(origenesLista.map((d) => [d.id, d]));

  // Posibles reemplazos de las anuladas: facturas al mismo cliente cerca de la anulación.
  const fechasAnulacion = historial.eventos.filter((e) => e.a === "cancel").map((e) => e.fecha.slice(0, 10));
  let candidatas: Documento[] = [];
  if (anulados.length && fechasAnulacion.length) {
    const min = fechasAnulacion.reduce((a, b) => (a < b ? a : b));
    const max = fechasAnulacion.reduce((a, b) => (a > b ? a : b));
    const ini = new Date(Date.parse(min) - 3 * 86400000).toISOString().slice(0, 10);
    const fin = new Date(Date.parse(max) + 15 * 86400000).toISOString().slice(0, 10);
    candidatas = await facturasCercanas(companyId, [...new Set(anulados.map((a) => a.clienteId).filter(Boolean))], ini, fin);
  }

  return {
    companyId,
    notas: analizarNotas(notas, origenes, ncFactura, hoy),
    anuladas: analizarAnuladas(anulados, historial.eventos, historial.cambios, candidatas, desde, hasta),
    reabiertas: analizarReabiertas(reabDocs, historial.eventos, historial.cambios, desde, hasta),
    totales,
    serie,
    ventasVendedor,
    crudo: { notas, anulados, origenes, eventos: historial.eventos, cambios: historial.cambios },
  };
}

const cache = new Map<string, { vence: number; valor: Promise<DatosSede> }>();

/** Datos de una sede y rango, con caché de 3 minutos (`refrescar` la salta). */
export function datosSede(companyId: number, desde: string, hasta: string, refrescar = false): Promise<DatosSede> {
  const llave = `${companyId}|${desde}|${hasta}`;
  const x = cache.get(llave);
  if (!refrescar && x && x.vence > Date.now()) return x.valor;
  const valor = leerSede(companyId, desde, hasta);
  const entrada = { vence: Date.now() + 3 * 60 * 1000, valor };
  cache.set(llave, entrada);
  valor.catch(() => { if (cache.get(llave) === entrada) cache.delete(llave); });
  return valor;
}

/** Junta varias sedes y arma el resumen. */
export async function auditoriaPeriodo(sedes: number[], desde: string, hasta: string, refrescar = false) {
  const porSede = await Promise.all(sedes.map((s) => datosSede(s, desde, hasta, refrescar)));
  const conSede = <T extends { companyId: number }>(x: T) => ({ ...x, sede: nombreSede(x.companyId) });
  const notas = porSede.flatMap((d) => d.notas).map(conSede);
  const anuladas = porSede.flatMap((d) => d.anuladas).map(conSede);
  const reabiertas = porSede.flatMap((d) => d.reabiertas).map(conSede);
  const totales = porSede.reduce((a, d) => ({ ventas: a.ventas + d.totales.ventas, facturas: a.facturas + d.totales.facturas }), { ventas: 0, facturas: 0 });
  const ventasVendedor = new Map<string, number>();
  for (const d of porSede) for (const [k, v] of d.ventasVendedor) ventasVendedor.set(k, (ventasVendedor.get(k) || 0) + v);
  const serie = porSede[0]?.serie.map((m, i) => ({
    mes: m.mes,
    ventas: porSede.reduce((s, d) => s + (d.serie[i]?.ventas || 0), 0),
    notas: porSede.reduce((s, d) => s + (d.serie[i]?.notas || 0), 0),
    cantidadNotas: porSede.reduce((s, d) => s + (d.serie[i]?.cantidadNotas || 0), 0),
  })) ?? [];

  return {
    desde, hasta,
    sedes: sedes.map((id) => ({ id, nombre: nombreSede(id) })),
    resumen: resumir(notas, anuladas, reabiertas, totales, ventasVendedor),
    serie: serie.map((m) => ({ ...m, pct: m.ventas > 0 ? Math.round((m.notas / m.ventas) * 10000) / 100 : null })),
    notas, anuladas, reabiertas,
    generado: new Date().toISOString(),
  };
}
