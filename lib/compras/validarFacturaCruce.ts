/**
 * Cruce de los renglones de una factura de compra contra los productos de
 * Odoo, por SKU. Puro (sin Odoo ni base): lo usa lib/compras/validarFactura.ts
 * y lo prueba scripts/check-validar-factura.cjs.
 */

export interface ProductoOdoo {
  id: number;
  codigo: string;
  nombre: string;
  barcode: string;
  activo: boolean;
  categoria: string;
  marca: string;
}

export type EstadoRenglon =
  /** El SKU está tal cual en Odoo. */
  | "en_odoo"
  /** Está, pero archivado: no se crea otro, se desarchiva en Odoo. */
  | "archivado"
  /** El mismo SKU con otro formato (guiones, espacios, puntos, mayúsculas). */
  | "sku_distinto"
  /** El código de la factura es el código de barras de un producto. */
  | "por_barcode"
  /** No coincide el SKU, pero hay productos parecidos: revisar antes de crear. */
  | "posible"
  | "no_existe";

export interface Cruce {
  estado: EstadoRenglon;
  /** Los productos de Odoo que llevaron a ese estado (vacío si no existe). */
  coincidencias: ProductoOdoo[];
}

/** El SKU sin separadores ni mayúsculas: "C11CL-623.01 " = "C11CL62301". */
export const normalizar = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

const MIN_PARECIDO = 5;
const MAX_COINCIDENCIAS = 5;

/** Índice para cruzar muchos renglones contra el catálogo entero de una vez. */
export function indexar(productos: ProductoOdoo[]) {
  const exacto = new Map<string, ProductoOdoo[]>();
  const norm = new Map<string, ProductoOdoo[]>();
  const barcode = new Map<string, ProductoOdoo[]>();
  const meter = (m: Map<string, ProductoOdoo[]>, k: string, p: ProductoOdoo) => {
    if (k) m.set(k, [...(m.get(k) ?? []), p]);
  };
  for (const p of productos) {
    meter(exacto, p.codigo.trim().toUpperCase(), p);
    meter(norm, normalizar(p.codigo), p);
    meter(barcode, p.barcode.trim(), p);
  }
  return { productos, exacto, norm, barcode };
}

export function cruzar(codigo: string, indice: ReturnType<typeof indexar>): Cruce {
  const c = codigo.trim().toUpperCase();
  const n = normalizar(codigo);
  if (!n) return { estado: "no_existe", coincidencias: [] };

  const exactos = indice.exacto.get(c) ?? [];
  if (exactos.length) {
    const activos = exactos.filter((p) => p.activo);
    return activos.length ? { estado: "en_odoo", coincidencias: activos } : { estado: "archivado", coincidencias: exactos };
  }
  const normales = indice.norm.get(n) ?? [];
  if (normales.length) return { estado: "sku_distinto", coincidencias: normales };
  const porBarcode = indice.barcode.get(codigo.trim()) ?? [];
  if (porBarcode.length) return { estado: "por_barcode", coincidencias: porBarcode };

  // Parecidos: un SKU dentro del otro (C11CL62301 y C11CL62301-AL) o el
  // código escrito en el nombre del producto (hay productos sin SKU).
  if (n.length >= MIN_PARECIDO) {
    const parecidos = indice.productos.filter((p) => {
      const pn = normalizar(p.codigo);
      return (pn.length >= MIN_PARECIDO && (pn.includes(n) || n.includes(pn))) || normalizar(p.nombre).includes(n);
    });
    if (parecidos.length) {
      return { estado: "posible", coincidencias: parecidos.sort((a, b) => Number(b.activo) - Number(a.activo)).slice(0, MAX_COINCIDENCIAS) };
    }
  }
  return { estado: "no_existe", coincidencias: [] };
}
