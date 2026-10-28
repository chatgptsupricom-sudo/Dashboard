import { catalogo } from "@/lib/compras/datosOdoo";
import { crearTrabajo, guardarProductosIA, leerClasificacionProductos } from "@/lib/inteligencia-negocio/clasificacion/datos";
import { pedirJSON } from "@/lib/inteligencia-negocio/clasificacion/ia";
import {
  ESTRUCTURA_GENERAL,
  ESTRUCTURAS,
  nivelDeConfianza,
  type ProductoClasificado,
} from "@/lib/inteligencia-negocio/clasificacion/tipos";

/**
 * Clasificación de productos: cada producto activo de Odoo (no servicio)
 * con su categoría y un nombre corto armado con la estructura de su
 * categoría (Excel "Ejemplo de Categorizacion"), que pone la IA leyendo el
 * nombre de Odoo y que BI corrige a mano.
 */

export async function listarProductos(): Promise<ProductoClasificado[]> {
  const [cat, clasif] = await Promise.all([catalogo(), leerClasificacionProductos()]);
  return [...cat.values()]
    .map((p) => {
      const c = clasif.get(p.id);
      return {
        id: p.id,
        codigo: p.codigo,
        producto: p.nombre,
        marca: p.marca,
        categoriaOdoo: p.categoria,
        categoria: c?.categoria ?? null,
        subcategoria: c?.subcategoria ?? null,
        confianza: c ? c.confianza : null,
        nivel: c ? nivelDeConfianza(c.confianza) : null,
        observaciones: c?.observaciones ?? "",
        origen: c?.origen ?? null,
      };
    })
    .sort((a, b) => a.categoriaOdoo.localeCompare(b.categoriaOdoo) || a.producto.localeCompare(b.producto));
}

/** Del Excel "Ejemplo de Categorizacion" (los que corrigen los errores típicos de la IA). */
const EJEMPLOS: [string, string, string][] = [
  ['HP ALL-IN-ONE 27-CR0252lA PC , AMD Ryzen™ 5 7520U, 27" Full HD, 16GB RAM, 512GB SSD', "AIO", 'AIO 27" Ryzen 5 16GB 512GB SSD'],
  ["FORZA TITAN 1200W ESTACION DE ENERGIA PORTATIL FPP-T1200W", "UPS Y REGULADORES", "Estación de Energía 1200W"],
  ["BLUETTI Premium 200 V2 Portable Power Station 2,600 W 2,073.6Wh", "UPS Y REGULADORES", "Estación de Energía 2600W 2074Wh"],
  ["HP IMPRESORA PRINTER 2874", "IMPRESORA", "Impresora Multifuncional Inyección"],
  ["CANON IMPRESORA LASER DX 529IF", "IMPRESORA", "Impresora Multifuncional Láser Mono"],
  ["IMPRESORA CANON MF462DW LASER MONOCROMATICA", "IMPRESORA", "Impresora Multifuncional Láser Mono"],
  ["CANON IMPRESORA IMAGECLASS X MF1538C", "IMPRESORA", "Impresora Multifuncional Láser Mono"],
  ["EPSON ECOTANK L1350 AIO 110V", "IMPRESORA", "Impresora Solo Impresión Tinta Continua"],
  ["CANON IMPRESORA IPROGRAF TC-20 PLOTTER", "IMPRESORA", "Impresora Solo Impresión Inyección Gran Formato 24in"],
  ["EPSON IMPRESORA SURECOLOR SUBLIMACION  F170 PRINTER A4", "IMPRESORA", "Impresora Solo Impresión Sublimación A4"],
  ["Acer Laptop 15in FHD C5120U 16GB 512GB LINUX-SIL", "LAPTOP", "Laptop Core 5 16GB 512GB SSD"],
  ["ACER LAPTOP 15in FHD C7150U 16GB 512GB LINUX-SILVER", "LAPTOP", "Laptop Core 7 16GB 512GB SSD"],
  ['HP 15-FD0128CA Core™ i5-1334U 512GB SSD 16GB 15.6" (1920x1080)', "LAPTOP", "Laptop Core i5 16GB 512GB SSD"],
];

const SISTEMA = `Clasificas productos del catálogo de Supricom, un mayorista de tecnología de Venezuela.
Por cada producto recibes su código, su nombre en el sistema (Odoo), su marca y su categoría en Odoo.
Devuelves:
- categoria: una de estas si el producto pertenece a ella: ${ESTRUCTURAS.map((e) => e.categoria).join(", ")}. Si no, la categoría de Odoo tal cual (en mayúsculas). Si la de Odoo es genérica ("All", "GENERAL") o está mal, la que corresponda al producto.
- subcategoria: un nombre corto, sin marca ni modelo, armado con la estructura de su categoría:
${ESTRUCTURAS.map((e) => `  ${e.categoria}: ${e.estructura}. Ejemplo: ${e.ejemplo}`).join("\n")}
  Otras categorías: ${ESTRUCTURA_GENERAL}. Ejemplos: "Mouse Inalámbrico Ergonómico", "Cámara IP WiFi 4MP Exterior", "Audífonos Bluetooth Over-Ear".
  Usa siempre el mismo orden y la misma forma de escribir para que productos equivalentes queden con el mismo nombre corto (ej. "Core i5", "Ryzen 5", "16GB", "512GB SSD", "27\\"", "Láser Mono", "Estación de Energía").
  Si un dato no está en el nombre pero conoces el modelo con seguridad (ej. un monitor MSI MAG 275CQF es 27" QHD 180Hz), complétalo y baja la confianza a 0.75-0.9. Si no lo sabes, no lo inventes: déjalo fuera y anótalo en observaciones.
  Pistas de nombres: en Canon "MF" en el modelo y en HP "MFP" o "Smart Tank" son multifuncionales; "LBP" de Canon es solo impresión; los procesadores Intel "C5 120U" o "C7150U" son "Core 5" y "Core 7" (sin la i), "Core Ultra 7 255U" es "Core Ultra 7", "i5-1334U" es "Core i5"; "512HD" o "SSD 512G" es "512GB SSD"; un plotter es "Impresora Solo Impresión Inyección Gran Formato" con el ancho si se sabe.
  Laptop gamer (TUF, Nitro, Victus, Legion, ROG, Omen o con tarjeta RTX/GTX): "Laptop Gamer" + procesador + RAM + almacenamiento + la tarjeta (ej. "Laptop Gamer Core i7 16GB 1TB SSD RTX 4060"); nunca la palabra "GPU" sola.
- confianza: 1 si todos los datos del nombre corto están en el nombre del producto; entre 0.75 y 0.9 si completaste datos con tu conocimiento del modelo; 0.65 o menos si tuviste que inferir o asumir.
- observaciones: qué hay que verificar (dato faltante, nombre ambiguo, modelo asumido); "" si no hay nada que verificar.
Ejemplos ya revisados por Supricom (nombre en Odoo → categoría | nombre corto):
${EJEMPLOS.map(([nombre, categoria, corto]) => `  ${nombre} → ${categoria} | ${corto}`).join("\n")}
Devuelve exactamente un elemento por producto recibido, con su mismo id.`;

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: ["productos"],
  properties: {
    productos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "categoria", "subcategoria", "confianza", "observaciones"],
        properties: {
          id: { type: "integer" },
          categoria: { type: "string" },
          subcategoria: { type: "string" },
          confianza: { type: "number" },
          observaciones: { type: "string" },
        },
      },
    },
  },
};

export interface Pendiente {
  id: number;
  codigo: string;
  nombre: string;
  marca: string;
  categoriaOdoo: string;
}

/** Lo que propone la IA para un lote (sin guardar). */
export async function pedirClasificacionProductos(lote: Pendiente[]) {
  const r = await pedirJSON<{ productos: any[] }>(
    SISTEMA,
    JSON.stringify(lote.map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, marca: p.marca, categoria_odoo: p.categoriaOdoo }))),
    ESQUEMA,
    120 * lote.length + 500,
  );
  const delLote = new Map(lote.map((p) => [p.id, p]));
  return (r.productos || [])
    .filter((x) => delLote.has(Number(x.id)) && String(x.subcategoria || "").trim())
    .map((x) => ({
      id: Number(x.id),
      nombre: delLote.get(Number(x.id))!.nombre,
      categoria: String(x.categoria || delLote.get(Number(x.id))!.categoriaOdoo),
      subcategoria: String(x.subcategoria),
      confianza: Number(x.confianza),
      observaciones: String(x.observaciones || ""),
    }));
}

async function clasificarLote(lote: Pendiente[]): Promise<void> {
  await guardarProductosIA(await pedirClasificacionProductos(lote));
}

const trabajo = crearTrabajo();
export const estadoClasificacionProductos = trabajo.estado;

export type AlcanceProductos = "pendientes" | "bajos" | "todos";

/**
 * Empieza a clasificar en segundo plano: los que no tienen clasificación,
 * los de confianza baja o todos (lo corregido a mano nunca). Devuelve
 * cuántos van, o null si ya hay una clasificación corriendo.
 */
export async function clasificarProductos(alcance: AlcanceProductos): Promise<number | null> {
  const productos = await listarProductos();
  const pendientes: Pendiente[] = productos
    .filter((p) =>
      p.origen === "manual"
        ? false
        : alcance === "todos"
          ? true
          : alcance === "bajos"
            ? p.nivel === "Bajo"
            : p.categoria === null,
    )
    .map((p) => ({ id: p.id, codigo: p.codigo, nombre: p.producto, marca: p.marca, categoriaOdoo: p.categoriaOdoo }));
  // Lotes de la misma categoría: la IA nombra igual lo que es igual.
  pendientes.sort((a, b) => a.categoriaOdoo.localeCompare(b.categoriaOdoo) || a.nombre.localeCompare(b.nombre));
  return trabajo.iniciar(pendientes, 40, 3, clasificarLote) ? pendientes.length : null;
}
