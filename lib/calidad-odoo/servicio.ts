import { chequeosContactos, chequeosSegmentacion } from "./contactos";
import { chequeosOperaciones } from "./operaciones";
import { chequeosPrecios } from "./precios";
import { chequeosProductos } from "./productos";
import {
  IDS_SEDES, costoYStock, leerCategorias, leerContactos, leerEquipos, leerEtiquetas, leerMarcas, leerProductos,
  leerUsuarios, listasPrincipales, nombreSede, paisDeEstados,
} from "./odoo";
import { AREAS, type Chequeo, type ChequeoResumen, type Severidad } from "./tipos";

/**
 * Corre todos los chequeos sobre las 3 sedes. Tarda (lee contactos,
 * productos, listas de precios y documentos pendientes), así que el
 * resultado se guarda 10 minutos; «Actualizar» lo vuelve a leer de Odoo.
 */

interface Resultado {
  chequeos: Chequeo[];
  generado: string;
}

async function correr(): Promise<Resultado> {
  const [contactos, usuarios, etiquetas, equipos, productos, marcas, categorias, listas, costos, operaciones] = await Promise.all([
    leerContactos(),
    leerUsuarios(),
    leerEtiquetas(),
    leerEquipos(),
    leerProductos(),
    leerMarcas(),
    leerCategorias(),
    listasPrincipales(),
    Promise.all(IDS_SEDES.map((s) => costoYStock(s))),
    chequeosOperaciones(),
  ]);
  const paisEstado = await paisDeEstados([...new Set(contactos.map((c) => c.estado?.[0]).filter((x): x is number => !!x))]);

  const chequeos: Chequeo[] = [
    ...chequeosContactos(contactos, paisEstado, usuarios),
    ...chequeosSegmentacion(contactos, etiquetas, equipos),
    ...chequeosProductos(productos, marcas, categorias),
    ...chequeosPrecios(productos, IDS_SEDES.map((s, i) => ({ companyId: s, costoStock: costos[i], lista: listas.find((l) => l.companyId === s) }))),
    ...operaciones,
  ];
  return { chequeos, generado: new Date().toISOString() };
}

let cache: { vence: number; valor: Promise<Resultado> } | null = null;

export function resultado(refrescar = false): Promise<Resultado> {
  if (!refrescar && cache && cache.vence > Date.now()) return cache.valor;
  const valor = correr();
  const entrada = { vence: Date.now() + 10 * 60 * 1000, valor };
  cache = entrada;
  valor.catch(() => { if (cache === entrada) cache = null; });
  return valor;
}

/** `company_id` = 9 | 10 | 7 | "todas" (default). */
export function sedesDe(param: string | null): number[] | null {
  if (!param || param === "todas") return IDS_SEDES;
  const id = Number(param);
  return IDS_SEDES.includes(id) ? [id] : null;
}

/** Filas de la(s) sede(s) pedida(s). Lo compartido entre empresas (marcas, categorías, etiquetas) sale siempre. */
export function filtrar(c: Chequeo, sedes: number[]): Chequeo {
  return { ...c, filas: c.filas.filter((f) => f.companyId == null || sedes.includes(f.companyId)) };
}

const ORDEN_SEV: Record<Severidad, number> = { error: 0, atencion: 1, mejora: 2 };

export function resumir(chequeos: Chequeo[], sedes: number[]) {
  const lista: ChequeoResumen[] = chequeos.map((c) => {
    const f = filtrar(c, sedes).filas;
    const porSede: Record<string, number> = {};
    for (const x of f) {
      const k = nombreSede(x.companyId);
      porSede[k] = (porSede[k] || 0) + 1;
    }
    const { filas: _f, columnas: _c, ...meta } = c;
    // Los duplicados se cuentan por grupo (un grupo = una cosa que arreglar).
    const agrupado = f.some((x) => x.grupo);
    const total = agrupado ? new Set(f.map((x) => x.grupo)).size : f.length;
    return { ...meta, total, agrupado, porSede };
  });
  lista.sort((a, b) => ORDEN_SEV[a.severidad] - ORDEN_SEV[b.severidad] || b.total - a.total);

  const conHallazgos = lista.filter((c) => c.total > 0);
  const porSeveridad = (s: Severidad) => ({
    chequeos: conHallazgos.filter((c) => c.severidad === s).length,
    registros: conHallazgos.filter((c) => c.severidad === s).reduce((a, c) => a + c.total, 0),
  });
  return {
    chequeos: lista,
    totales: { error: porSeveridad("error"), atencion: porSeveridad("atencion"), mejora: porSeveridad("mejora"), revisados: lista.length, limpios: lista.length - conHallazgos.length },
    areas: AREAS.map((a) => ({ ...a, hallazgos: conHallazgos.filter((c) => c.area === a.id).reduce((s, c) => s + c.total, 0) })),
  };
}
