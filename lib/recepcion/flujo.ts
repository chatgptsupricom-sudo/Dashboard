/**
 * Recepcion de mercancia por packing list: Compras lo carga, Almacen lo
 * recibe, lo verifica y lo cierra.
 *
 * El packing list puede venir en varios contenedores, y cada uno tiene su
 * propio recorrido (pueden llegar en dias distintos):
 *
 *   contenedor:  por_llegar ─(llegada: foto + foto precinto + numero)─►
 *                descargando ─(foto de como quedo)─► cerrado
 *
 *   packing list: por_llegar ─(llega el primer contenedor)─► descargando
 *                 ─(todos cerrados + conteo completo)─► cerrado
 *                 (conforme | con_novedades)
 *
 * El conteo contra el packing list es uno solo y se va llenando a medida que
 * llegan los contenedores.
 *
 * Sin dependencias de servidor: lo usan la API (para validar) y las
 * pantallas (para saber que mostrar y a quien le toca).
 */

export const ETAPAS = ["por_llegar", "descargando", "cerrado"] as const;
export type Etapa = (typeof ETAPAS)[number];

export function esEtapa(v: unknown): v is Etapa {
  return typeof v === "string" && (ETAPAS as readonly string[]).includes(v);
}

export const TIPOS_ARCHIVO = [
  "packing_list",
  "foto_llegada",
  "foto_precinto",
  "foto_cierre",
  "foto_golpe",
] as const;
export type TipoArchivo = (typeof TIPOS_ARCHIVO)[number];

export function esTipoArchivo(v: unknown): v is TipoArchivo {
  return typeof v === "string" && (TIPOS_ARCHIVO as readonly string[]).includes(v);
}

/**
 * En que etapa se puede subir cada archivo, quien, y de que es.
 *
 * Un packing list puede venir en varios contenedores que llegan en dias
 * distintos, asi que las fotos de llegada, precinto y cierre son de UN
 * contenedor (`nivel: "contenedor"`) y se miran contra la etapa de ese
 * contenedor. El packing list (el archivo) y la foto de una caja golpeada son
 * del packing list entero: el conteo es uno solo.
 */
export const ARCHIVO_PERMITIDO: Record<
  TipoArchivo,
  { rol: "compras" | "almacen"; nivel: "recepcion" | "contenedor"; etapas: Etapa[] }
> = {
  packing_list: { rol: "compras", nivel: "recepcion", etapas: ["por_llegar"] },
  foto_llegada: { rol: "almacen", nivel: "contenedor", etapas: ["por_llegar"] },
  foto_precinto: { rol: "almacen", nivel: "contenedor", etapas: ["por_llegar"] },
  foto_cierre: { rol: "almacen", nivel: "contenedor", etapas: ["descargando"] },
  foto_golpe: { rol: "almacen", nivel: "recepcion", etapas: ["descargando"] },
};

/** Un contenedor del packing list, cada uno con su propia llegada y cierre. */
export type Contenedor = {
  id: number;
  numero: string;
  /** Un contenedor puede venir con uno o mas precintos. */
  precintos_esperados: string[];
  etapa: Etapa;
  llegada_at: string | null;
  llegada_por: string | null;
  precintos_recibidos: string[];
  precinto_coincide: number | null;
  cerrado_at: string | null;
  cerrado_por: string | null;
  notas_cierre: string | null;
  /** Correcciones de los precintos recibidos, de la mas vieja a la mas nueva. */
  precintos_correcciones: CorreccionPrecintos[];
};

export type RolRecepcion = "compras" | "almacen";

/** A quien le toca cada etapa. Compras ya hizo lo suyo al cargarlo. */
export const RESPONSABLE: Record<Etapa, RolRecepcion | null> = {
  por_llegar: "almacen",
  descargando: "almacen",
  cerrado: null,
};

/**
 * En que estado llego la caja. Una misma caja puede estar en mas de uno
 * (humeda y abierta, por ejemplo), por eso se guarda una lista y no un solo
 * valor. La columna vieja `golpeado` (0/1) queda como "tiene algo".
 */
export const TIPOS_DANO = ["danada", "humeda", "abierta"] as const;
export type TipoDano = (typeof TIPOS_DANO)[number];

export function limpiarTiposDano(v: unknown): TipoDano[] {
  const crudos = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const out: TipoDano[] = [];
  for (const x of crudos) {
    const s = String(x ?? "").trim().toLowerCase() as TipoDano;
    if (TIPOS_DANO.includes(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

/**
 * Un dano con cuantas unidades lo tienen: no siempre es todo el renglon (de
 * 50 pueden venir 3 humedas y 1 abierta). `cantidad` null = todavia no se
 * anoto (lo marcado antes de que se pidiera la cantidad).
 */
export type Dano = { tipo: TipoDano; cantidad: number | null };

/**
 * Limpia la lista de danos. Acepta la forma nueva ({ tipo, cantidad }) y la
 * de antes (solo el nombre del tipo). Sin tipos repetidos ni inventados; una
 * cantidad que no es un entero positivo queda en null.
 */
export function limpiarDanos(v: unknown): Dano[] {
  const crudos = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
  const out: Dano[] = [];
  for (const x of crudos) {
    const tipo = String((x && typeof x === "object" ? (x as any).tipo : x) ?? "")
      .trim()
      .toLowerCase() as TipoDano;
    if (!TIPOS_DANO.includes(tipo) || out.some((d) => d.tipo === tipo)) continue;
    const n = x && typeof x === "object" ? Number((x as any).cantidad) : NaN;
    out.push({ tipo, cantidad: Number.isInteger(n) && n > 0 ? n : null });
  }
  return out;
}

/**
 * Lee los danos guardados (columna golpeado_tipos). Un renglon marcado
 * antes de que existieran los tipos (solo `golpeado = 1`) se lee como una
 * caja danada, sin cantidad.
 */
export function leerDanos(json: unknown, golpeado?: unknown): Dano[] {
  if (typeof json === "string" && json) {
    try {
      const danos = limpiarDanos(JSON.parse(json));
      if (danos.length) return danos;
    } catch {
      // Texto roto: se cae al 0/1 de antes.
    }
  }
  return Number(golpeado) === 1 ? [{ tipo: "danada", cantidad: null }] : [];
}

/** Solo los tipos (sin cantidades), para lo que ya los leia asi. */
export function leerTiposDano(json: unknown, golpeado?: unknown): TipoDano[] {
  return leerDanos(json, golpeado).map((d) => d.tipo);
}

export type ItemConteo = {
  id: number;
  cantidad_esperada: number;
  cantidad_recibida: number | null;
  motivo_diferencia: string | null;
  golpeado: boolean;
  /** Tipos de dano marcados con su cantidad. */
  danos?: Dano[];
};

/**
 * Que falta para poder cerrar, y con que resultado cerraria.
 *
 * Se cierra solo si:
 *  - todos los renglones estan contados (null es "no lo conte", no cero);
 *  - todo renglon con diferencia (falta o sobra) tiene motivo;
 *  - todo renglon golpeado tiene al menos una foto;
 *  - cada tipo de dano marcado dice cuantas unidades, y no mas de las
 *    recibidas.
 * La foto del contenedor al terminar se valida aparte (es de la recepcion,
 * no de un renglon).
 */
export function evaluarConteo(
  items: ItemConteo[],
  fotosGolpePorItem: Set<number>,
): {
  sinContar: number;
  sinMotivo: number;
  golpesSinFoto: number;
  danosSinCantidad: number;
  danosDeMas: number;
  faltantes: number;
  sobrantes: number;
  golpeados: number;
  listo: boolean;
} {
  let sinContar = 0;
  let sinMotivo = 0;
  let golpesSinFoto = 0;
  let danosSinCantidad = 0;
  let danosDeMas = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let golpeados = 0;
  for (const i of items) {
    if (i.cantidad_recibida === null) {
      sinContar++;
    } else {
      const dif = Number(i.cantidad_recibida) - Number(i.cantidad_esperada);
      if (dif < 0) faltantes++;
      if (dif > 0) sobrantes++;
      if (dif !== 0 && !i.motivo_diferencia?.trim()) sinMotivo++;
    }
    if (i.golpeado) {
      golpeados++;
      if (!fotosGolpePorItem.has(i.id)) golpesSinFoto++;
    }
    for (const d of i.danos || []) {
      if (d.cantidad === null) danosSinCantidad++;
      else if (i.cantidad_recibida !== null && d.cantidad > Number(i.cantidad_recibida)) danosDeMas++;
    }
  }
  return {
    sinContar,
    sinMotivo,
    golpesSinFoto,
    danosSinCantidad,
    danosDeMas,
    faltantes,
    sobrantes,
    golpeados,
    listo:
      sinContar === 0 &&
      sinMotivo === 0 &&
      golpesSinFoto === 0 &&
      danosSinCantidad === 0 &&
      danosDeMas === 0,
  };
}

/**
 * Cuanto tarda la recepcion: desde que se sube la foto del contenedor al
 * llegar hasta que se cierra. Para el packing list, desde la primera foto de
 * llegada de cualquiera de sus contenedores hasta el cierre del packing list;
 * para un contenedor, desde su foto de llegada hasta que se termina ese
 * contenedor. Sin cierre todavia, corre hasta `ahora`.
 */
export type ArchivoConFecha = { tipo: string; contenedor_id?: number | null; created_at?: string | null };

export function inicioRecepcion(archivos: ArchivoConFecha[], contenedorId?: number): string | null {
  let min: string | null = null;
  for (const a of archivos) {
    if (a.tipo !== "foto_llegada" || !a.created_at) continue;
    if (contenedorId !== undefined && Number(a.contenedor_id) !== contenedorId) continue;
    if (min === null || new Date(a.created_at) < new Date(min)) min = a.created_at;
  }
  return min;
}

/** Milisegundos entre el inicio y el fin (o ahora, si todavia no termino). */
export function duracion(inicio: string | null, fin: string | null, ahora: Date = new Date()): number | null {
  if (!inicio) return null;
  const desde = new Date(inicio).getTime();
  const hasta = fin ? new Date(fin).getTime() : ahora.getTime();
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return null;
  return Math.max(0, hasta - desde);
}

/** "45 min", "2 h 15 min", "3 d 4 h". */
export function formatearDuracion(ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

/** Normaliza un precinto para compararlo: sin espacios ni guiones, en mayusculas. */
export function normalizarPrecinto(v: string | null | undefined): string {
  return String(v || "")
    .toUpperCase()
    .replace(/[\s\-_.]/g, "");
}

export const MAX_PRECINTOS = 10;

/**
 * Como se muestra un precinto: en mayusculas y sin espacios de sobra, pero
 * con sus guiones y puntos (a diferencia de normalizarPrecinto, que es solo
 * para comparar).
 */
export function mostrarPrecinto(v: string | null | undefined): string {
  return String(v || "").trim().toUpperCase().replace(/\s+/g, " ");
}

/** Largo minimo de un pedazo para contarlo como un precinto entero. */
const MIN_PRECINTO_ENTERO = 5;

/**
 * Un texto con varios precintos se parte en varios. Coma, punto y coma y
 * salto de linea separan siempre. El espacio separa solo si cada pedazo tiene
 * largo de precinto entero: el SEAL NUMBER del packing list suele traerlos
 * asi ("FX44502691 003561" son dos precintos), pero un precinto tambien puede
 * llevar un espacio adentro ("SL 501", "ML 445566") y ese no se parte.
 */
export function separarPrecintos(v: unknown): string[] {
  return String(v ?? "")
    .split(/[,;\n]+/)
    .flatMap((trozo) => {
      const partes = trozo.trim().split(/\s+/).filter(Boolean);
      return partes.length > 1 && partes.every((x) => x.length >= MIN_PRECINTO_ENTERO)
        ? partes
        : [trozo.trim()];
    })
    .filter(Boolean);
}

/**
 * Limpia una lista de precintos: sin vacios, sin repetidos (comparando
 * normalizado: "SL-100" y "sl 100" son el mismo) y como mucho MAX_PRECINTOS.
 * Cada elemento puede traer varios precintos juntos (ver separarPrecintos).
 */
export function limpiarPrecintos(lista: unknown): string[] {
  const crudos = (Array.isArray(lista) ? lista : typeof lista === "string" ? [lista] : []).flatMap(
    separarPrecintos,
  );
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const v of crudos) {
    const s = mostrarPrecinto(String(v ?? "").slice(0, 50));
    const n = normalizarPrecinto(s);
    if (!n || vistos.has(n)) continue;
    vistos.add(n);
    out.push(s);
    if (out.length >= MAX_PRECINTOS) break;
  }
  return out;
}

/**
 * Compara los precintos que dice el packing list con los que Almacen vio.
 *
 * Coincide solo si son exactamente los mismos: un precinto que falta puede
 * ser uno que se rompio o se cambio en el camino, y uno de mas, un precinto
 * puesto despues. Sin esperados no hay contra que comparar (`coincide: null`).
 */
export function compararPrecintos(
  esperados: string[],
  recibidos: string[],
): { coincide: boolean | null; faltan: string[]; sobran: string[] } {
  if (esperados.length === 0) return { coincide: null, faltan: [], sobran: [] };
  const rec = new Set(recibidos.map(normalizarPrecinto));
  const esp = new Set(esperados.map(normalizarPrecinto));
  const faltan = esperados.filter((p) => !rec.has(normalizarPrecinto(p)));
  const sobran = recibidos.filter((p) => !esp.has(normalizarPrecinto(p)));
  return { coincide: faltan.length === 0 && sobran.length === 0, faltan, sobran };
}

/**
 * Los recibidos que son el mismo precinto que uno esperado se escriben igual
 * que en el packing list ("sl 501" -> "SL-501"), para que al compararlos en
 * pantalla se vea a simple vista que coinciden. Los que no coinciden quedan
 * como los anoto Almacen.
 */
export function alinearPrecintos(recibidos: string[], esperados: string[]): string[] {
  const porNorma = new Map(esperados.map((p) => [normalizarPrecinto(p), p]));
  return recibidos.map((p) => porNorma.get(normalizarPrecinto(p)) ?? p);
}

/**
 * Una correccion de los precintos anotados al llegar (ej. un error de
 * tipeo). No se pisa lo anotado sin dejar rastro: queda que habia antes,
 * que quedo, por que y quien lo hizo.
 */
export type CorreccionPrecintos = {
  antes: string[];
  despues: string[];
  motivo: string;
  por: string;
  at: string;
};

export function leerCorrecciones(json: unknown): CorreccionPrecintos[] {
  if (typeof json !== "string" || !json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((c) => c && Array.isArray(c.antes) && Array.isArray(c.despues)) : [];
  } catch {
    return [];
  }
}

/** Lee una lista de precintos guardada como JSON, o el precinto unico de antes. */
export function leerPrecintos(json: unknown, unico?: string | null): string[] {
  if (typeof json === "string" && json) {
    try {
      const v = JSON.parse(json);
      if (Array.isArray(v)) return limpiarPrecintos(v);
    } catch {
      // Texto roto: se cae al precinto unico.
    }
  }
  return unico ? limpiarPrecintos([unico]) : [];
}

export const SUCURSALES: Array<{ cids: number; nombre: string }> = [
  { cids: 9, nombre: "Valencia" },
  { cids: 10, nombre: "Caracas" },
  { cids: 7, nombre: "Panamá" },
];
