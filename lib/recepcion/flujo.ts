/**
 * Recepcion de mercancia por packing list: Compras lo carga, Almacen lo
 * recibe, lo verifica y lo cierra.
 *
 *   por_llegar ─(Almacen: llegada + foto contenedor + foto precinto)─►
 *   descargando ─(Almacen: conteo contra el packing list + foto de cierre)─►
 *   cerrado (conforme | con_novedades)
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
 * En que etapa se puede subir cada archivo y quien. El packing list lo sube
 * Compras mientras el contenedor no llega; las fotos son de Almacen, cada una
 * en su momento (la de cierre no tiene sentido antes de descargar).
 */
export const ARCHIVO_PERMITIDO: Record<TipoArchivo, { rol: "compras" | "almacen"; etapas: Etapa[] }> = {
  packing_list: { rol: "compras", etapas: ["por_llegar"] },
  foto_llegada: { rol: "almacen", etapas: ["por_llegar"] },
  foto_precinto: { rol: "almacen", etapas: ["por_llegar"] },
  foto_golpe: { rol: "almacen", etapas: ["descargando"] },
  foto_cierre: { rol: "almacen", etapas: ["descargando"] },
};

export type RolRecepcion = "compras" | "almacen";

/** A quien le toca cada etapa. Compras ya hizo lo suyo al cargarlo. */
export const RESPONSABLE: Record<Etapa, RolRecepcion | null> = {
  por_llegar: "almacen",
  descargando: "almacen",
  cerrado: null,
};

export type ItemConteo = {
  id: number;
  cantidad_esperada: number;
  cantidad_recibida: number | null;
  motivo_diferencia: string | null;
  golpeado: boolean;
};

/**
 * Que falta para poder cerrar, y con que resultado cerraria.
 *
 * Se cierra solo si:
 *  - todos los renglones estan contados (null es "no lo conte", no cero);
 *  - todo renglon con diferencia (falta o sobra) tiene motivo;
 *  - todo renglon golpeado tiene al menos una foto.
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
  faltantes: number;
  sobrantes: number;
  golpeados: number;
  listo: boolean;
} {
  let sinContar = 0;
  let sinMotivo = 0;
  let golpesSinFoto = 0;
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
  }
  return {
    sinContar,
    sinMotivo,
    golpesSinFoto,
    faltantes,
    sobrantes,
    golpeados,
    listo: sinContar === 0 && sinMotivo === 0 && golpesSinFoto === 0,
  };
}

/** Normaliza un precinto para compararlo: sin espacios ni guiones, en mayusculas. */
export function normalizarPrecinto(v: string | null | undefined): string {
  return String(v || "")
    .toUpperCase()
    .replace(/[\s\-_.]/g, "");
}

export const SUCURSALES: Array<{ cids: number; nombre: string }> = [
  { cids: 9, nombre: "Valencia" },
  { cids: 10, nombre: "Caracas" },
  { cids: 7, nombre: "Panamá" },
];
