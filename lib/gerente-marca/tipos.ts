import { ROL_MARKETING_ELECTRO } from "@/lib/auth/marketingElectro";

/**
 * Gerente de Marca: cada persona con este rol ve solo las marcas que el
 * SuperAdmin le asigna (tabla `gerente_marca_asignaciones`, por correo), en
 * Valencia y Caracas.
 *
 * Una marca se asigna entera o solo su línea de **Cómputo Corporativo**
 * (PCs, laptops, monitores y accesorios): la misma marca puede tener otro
 * gerente para impresión (HP impresoras y consumibles no son de quien lleva
 * HP Cómputo). En Odoo no hay una categoría "Cómputo Corporativo": se arma
 * con todo lo de la marca menos impresión (`CATEGORIAS_IMPRESION`), así una
 * categoría nueva de cómputo entra sola.
 *
 * Sin dependencias de servidor: lo importan las pantallas y el sidebar.
 */

export const ROL_GERENTE_MARCA = "gerente de marca";

/**
 * Roles que llevan marcas asignadas: el Gerente de Marca y Marketing y
 * Electrodomésticos (lib/auth/marketingElectro.ts), que usa las mismas
 * pantallas de Inventario y Ventas y la misma Configuración.
 */
export const ROLES_CON_MARCAS = [ROL_GERENTE_MARCA, ROL_MARKETING_ELECTRO];

export function esRolGerenteMarca(rol: unknown): boolean {
  return String(rol ?? "").toLowerCase().trim() === ROL_GERENTE_MARCA;
}

export type Linea = "todo" | "computo";

export const LINEAS: Record<Linea, string> = {
  todo: "Toda la marca",
  computo: "Cómputo Corporativo",
};

/** Categorías de Odoo (nombre normalizado) que no son Cómputo Corporativo. */
export const CATEGORIAS_IMPRESION = ["IMPRESORA", "CONSUMIBLES", "PAPELERIA", "SERVICIO"];

export const normalizarCategoria = (c: string) =>
  String(c || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();

export const esComputo = (categoria: string) => !CATEGORIAS_IMPRESION.includes(normalizarCategoria(categoria));

export interface Asignacion {
  /** `spiff.brand` de Odoo (la marca de Metas por marca). */
  marcaId: number;
  marca: string;
  linea: Linea;
}

/** "HP · Cómputo Corporativo" / "APC". */
export const etiquetaAsignacion = (a: Pick<Asignacion, "marca" | "linea">) =>
  a.linea === "computo" ? `${a.marca} · ${LINEAS.computo}` : a.marca;

/** Las dos sedes del gerente de marca (Venezuela). */
export const SEDES_GERENTE = [
  { id: 9, nombre: "Valencia" },
  { id: 10, nombre: "Caracas" },
] as const;

export const nombreSedeGerente = (id: number) => SEDES_GERENTE.find((s) => s.id === id)?.nombre ?? `Sede ${id}`;

/**
 * Antigüedad del inventario. La carga inicial de Odoo (lo que venía de
 * Smartbit) quedó con fecha de entrada del 4 al 6 de abril de 2026: de esas
 * unidades no se sabe cuánto tenían de antes, solo que es al menos desde ahí.
 * Por eso van en su propio tramo y no se mezclan con los días reales.
 */
export const FIN_CARGA_INICIAL = "2026-04-07";

export type Tramo = "0-30" | "31-60" | "61-90" | "91-180" | "180+" | "inicial";

export const TRAMOS: { id: Tramo; label: string }[] = [
  { id: "0-30", label: "0-30 días" },
  { id: "31-60", label: "31-60 días" },
  { id: "61-90", label: "61-90 días" },
  { id: "91-180", label: "91-180 días" },
  { id: "180+", label: "Más de 180 días" },
  { id: "inicial", label: "Antes de Odoo" },
];

export function tramoDe(dias: number, cargaInicial: boolean): Tramo {
  if (cargaInicial) return "inicial";
  if (dias <= 30) return "0-30";
  if (dias <= 60) return "31-60";
  if (dias <= 90) return "61-90";
  if (dias <= 180) return "91-180";
  return "180+";
}

/** Lo de un producto en una sede. */
export interface SedeProducto {
  companyId: number;
  /** Unidades en el almacén principal (Existencias + Entrada). */
  fisico: number;
  reservado: number;
  disponible: number;
  /** Por llegar: recepciones de órdenes de compra pendientes. */
  transito: number;
  /** Costo unitario de la sede (USD; 0 = sin costo en Odoo). */
  costo: number;
  /** Unidades por tramo de antigüedad (solo las que hay en el almacén). */
  tramos: Partial<Record<Tramo, number>>;
  /** Día de entrada de la unidad más vieja (Caracas). */
  entradaMasVieja: string | null;
  /** Días promedio en inventario, ponderado por unidades. */
  diasPromedio: number | null;
  vendidasMes: number;
  vendidas6m: number;
  ultimaVenta: string | null;
}

export interface ProductoGerente {
  id: number;
  codigo: string;
  nombre: string;
  marcaId: number;
  marca: string;
  categoria: string;
  activo: boolean;
  sedes: SedeProducto[];
}

export interface DatosInventario {
  asignaciones: Asignacion[];
  sedes: number[];
  hoy: string;
  /** Rango de "vendidas en el mes en curso" y "últimos 6 meses". */
  mes: { desde: string; hasta: string };
  seisMeses: { desde: string; hasta: string };
  productos: ProductoGerente[];
}

export interface VentaProducto {
  productoId: number;
  codigo: string;
  nombre: string;
  marcaId: number;
  marca: string;
  categoria: string;
  companyId: number;
  unidades: number;
  /** Venta sin IVA en USD (las notas de crédito restan). */
  facturado: number;
  /** Parte de lo facturado que ya se cobró (proporcional al pago de cada factura). */
  cobrado: number;
  facturas: number;
}

export interface DatosVentas {
  asignaciones: Asignacion[];
  sedes: number[];
  desde: string;
  hasta: string;
  filas: VentaProducto[];
}
