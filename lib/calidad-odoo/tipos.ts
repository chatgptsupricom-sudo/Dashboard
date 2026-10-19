/**
 * Calidad de datos de Odoo (SuperAdmin > Auditoría): tipos comunes.
 *
 * Cada chequeo es una regla sobre los datos de Odoo ("clientes con el mismo
 * RIF", "productos sin marca"…) con su explicación, el paso a paso para
 * corregirlo en Odoo y los registros que la incumplen. El panel solo lee:
 * las correcciones las hace el auditor en Odoo.
 */

/** error = dato malo que ya distorsiona reportes o contabilidad;
 *  atencion = algo pendiente o dudoso que hay que revisar;
 *  mejora = orden y estandarización. */
export type Severidad = "error" | "atencion" | "mejora";

export type Area =
  | "contactos"
  | "productos"
  | "precios"
  | "inventario"
  | "ventas"
  | "compras"
  | "contabilidad"
  | "segmentacion";

export const AREAS: { id: Area; nombre: string }[] = [
  { id: "contactos", nombre: "Contactos" },
  { id: "productos", nombre: "Productos" },
  { id: "precios", nombre: "Precios y costos" },
  { id: "inventario", nombre: "Inventario" },
  { id: "ventas", nombre: "Ventas" },
  { id: "compras", nombre: "Compras" },
  { id: "contabilidad", nombre: "Contabilidad" },
  { id: "segmentacion", nombre: "Segmentación y configuración" },
];

export type TipoColumna = "texto" | "numero" | "dinero" | "fecha" | "dias";

export interface Columna {
  clave: string;
  titulo: string;
  tipo?: TipoColumna;
}

/** Un registro que incumple la regla. `id` + `modelo` arman el enlace a Odoo. */
export interface Fila {
  id: number;
  modelo: string;
  /** Empresa del registro; null = compartido entre empresas. */
  companyId: number | null;
  /** Agrupa filas que van juntas (los contactos duplicados entre sí). */
  grupo?: string;
  [campo: string]: unknown;
}

export interface Chequeo {
  id: string;
  area: Area;
  severidad: Severidad;
  titulo: string;
  /** Qué se encontró, en una línea. */
  descripcion: string;
  /** Por qué importa (qué distorsiona si no se corrige). */
  porQue: string;
  /** Paso a paso para corregirlo en Odoo. */
  pasos: string[];
  columnas: Columna[];
  filas: Fila[];
}

/** Lo que viaja en el resumen: el chequeo sin las filas. */
export type ChequeoResumen = Omit<Chequeo, "filas" | "columnas"> & {
  /** Cuántas cosas hay que arreglar (en los duplicados, grupos; si no, registros). */
  total: number;
  agrupado: boolean;
  porSede: Record<string, number>;
};
