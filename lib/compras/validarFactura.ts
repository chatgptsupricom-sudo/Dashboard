import { leerConIA } from "@/lib/administracion/binance";
import { escritor } from "@/lib/compras/actualizacionPrecios";
import { cruzar, indexar, type Cruce, type ProductoOdoo } from "@/lib/compras/validarFacturaCruce";
import { hayIA, pedirJSON } from "@/lib/inteligencia-negocio/clasificacion/ia";
import { callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Compras › Validar factura: se carga la factura de compra (Excel, PDF o
 * foto), se cruza cada SKU con los productos de Odoo (validarFacturaCruce.ts)
 * y los que no están se crean desde el panel con una vista previa editable,
 * prellenada como los crea Compras hoy (nov-2026, ej. los de Oscar):
 * almacenable, nombre en mayúsculas «MARCA TIPO MODELO specs», categoría y
 * marca (`spiff_brand_id`), seguimiento por serie en equipos, unidad Units,
 * precio de venta 1 (el real va en las listas de precios), sin empresa y con
 * el IVA de ventas/compras de todas las empresas (como sale al crearlo en Odoo).
 * El costo y el proveedor no se ponen: los trae la recepción de la OC.
 */

const ODOO = (process.env.NEXT_PUBLIC_ODOO_URL || "").replace(/\/$/, "");
export const urlProducto = (id: number) => `${ODOO}/web#id=${id}&model=product.template&view_type=form`;

const m2o = (v: any): [number, string] | null => (Array.isArray(v) ? [v[0], String(v[1])] : null);
const txt = (v: any) => (v === false || v == null ? "" : String(v));

export interface Renglon {
  codigo: string;
  descripcion: string;
  cantidad: number | null;
  precio: number | null;
}

export interface Opcion {
  id: number;
  nombre: string;
}

export interface Sugerencia {
  nombre: string;
  categoriaId: number | null;
  marcaId: number | null;
  seguimiento: Seguimiento;
}

export type Seguimiento = "serial" | "lot" | "none";
export type TipoProducto = "product" | "consu" | "service";

async function leerTodo(model: string, domain: any[], fields: string[], extra: Record<string, any> = {}) {
  const todo: any[] = [];
  for (let offset = 0; ; offset += 5000) {
    const r = (await callOdooRPCEstricto<any[]>(model, "search_read", [domain], { fields, limit: 5000, offset, order: "id asc", ...extra })) ?? [];
    todo.push(...r);
    if (r.length < 5000) return todo;
  }
}

/** Todos los productos de Odoo, también los archivados (para no duplicarlos). */
async function catalogo(): Promise<ProductoOdoo[]> {
  const r = await leerTodo("product.template", [], ["default_code", "name", "barcode", "active", "categ_id", "spiff_brand_id"], {
    context: { active_test: false },
  });
  return r.map((p) => ({
    id: p.id,
    codigo: txt(p.default_code),
    nombre: txt(p.name),
    barcode: txt(p.barcode),
    activo: !!p.active,
    categoria: m2o(p.categ_id)?.[1] ?? "",
    marca: m2o(p.spiff_brand_id)?.[1] ?? "",
  }));
}

/** Categorías de producto (sin las de fábrica «All / …») y marcas. */
export async function opciones(): Promise<{ categorias: Opcion[]; marcas: Opcion[] }> {
  const [cats, marcas] = await Promise.all([
    leerTodo("product.category", [], ["complete_name"]),
    leerTodo("spiff.brand", [], ["name"]),
  ]);
  const orden = (a: Opcion, b: Opcion) => a.nombre.localeCompare(b.nombre, "es");
  return {
    categorias: cats
      .map((c) => ({ id: c.id, nombre: txt(c.complete_name) }))
      .filter((c) => c.nombre && !c.nombre.startsWith("All /"))
      .sort(orden),
    marcas: marcas.map((m) => ({ id: m.id, nombre: txt(m.name).trim() })).filter((m) => m.nombre).sort(orden),
  };
}

/** Nombres de productos creados hace poco, de ejemplo para la IA. */
async function ejemplos(): Promise<string[]> {
  const r =
    (await callOdooRPCEstricto<any[]>(
      "product.template",
      "search_read",
      [[["detailed_type", "=", "product"], ["spiff_brand_id", "!=", false], ["categ_id.parent_id", "=", false], ["default_code", "!=", false]]],
      { fields: ["name", "categ_id", "spiff_brand_id", "tracking"], limit: 30, order: "id desc" },
    )) ?? [];
  return r.map((p) => `${txt(p.name).trim()} | categoría: ${m2o(p.categ_id)?.[1]} | marca: ${m2o(p.spiff_brand_id)?.[1]} | seguimiento: ${p.tracking}`);
}

const INSTRUCCIONES_SUGERIR =
  "Eres el asistente de Compras de una empresa venezolana que importa equipos de computación, impresión y oficina, " +
  "y que crea los productos nuevos en Odoo. Para cada producto de la factura propón cómo crearlo, con la misma " +
  "convención de los ejemplos: nombre TODO EN MAYÚSCULAS y en español, empezando por la MARCA, luego el TIPO de " +
  "producto (LAPTOP, MONITOR, IMPRESORA, MEMORIA RAM, DISCO DURO, TINTA…), luego el MODELO y las especificaciones " +
  "principales (pantalla, procesador, memoria, almacenamiento, capacidad, potencia). Traduce lo genérico del inglés; " +
  "deja tal cual los nombres comerciales y los modelos. No pongas el SKU, el precio ni la cantidad. Máximo 150 caracteres. " +
  "categoria: copia exacta una de la lista de categorías. marca: copia exacta una de la lista de marcas, o vacío si " +
  "la marca no está en la lista. seguimiento: 'serial' para equipos que traen número de serie (laptops, PC, monitores, " +
  "impresoras, UPS, discos, consolas, cámaras, routers, proyectores, tablets, estaciones de energía), 'none' para " +
  "consumibles (tintas, tóner, papel), cables, accesorios menores, repuestos y licencias. " +
  "Devuelve un elemento por producto, con su mismo indice.";

const ESQUEMA_SUGERIR = {
  type: "object",
  additionalProperties: false,
  required: ["productos"],
  properties: {
    productos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["indice", "nombre", "categoria", "marca", "seguimiento"],
        properties: {
          indice: { type: "integer" },
          nombre: { type: "string" },
          categoria: { type: "string" },
          marca: { type: "string" },
          seguimiento: { type: "string", enum: ["serial", "none"] },
        },
      },
    },
  },
};

const LOTE_IA = 40;

async function sugerir(renglones: Renglon[], ops: { categorias: Opcion[]; marcas: Opcion[] }): Promise<Map<number, Sugerencia>> {
  const porNombre = (lista: Opcion[], n: string) => lista.find((o) => o.nombre.toUpperCase() === n.trim().toUpperCase())?.id ?? null;
  const salida = new Map<number, Sugerencia>();
  const ej = await ejemplos();
  for (let i = 0; i < renglones.length; i += LOTE_IA) {
    const lote = renglones.slice(i, i + LOTE_IA).map((r, j) => ({ indice: i + j, sku: r.codigo, descripcion: r.descripcion }));
    const pedido =
      `Ejemplos de productos ya creados:\n${ej.join("\n")}\n\n` +
      `Categorías: ${ops.categorias.map((c) => c.nombre).join(" · ")}\n\n` +
      `Marcas: ${ops.marcas.map((m) => m.nombre).join(" · ")}\n\n` +
      `Productos de la factura:\n${JSON.stringify(lote)}`;
    const r = await pedirJSON<{ productos: { indice: number; nombre: string; categoria: string; marca: string; seguimiento: Seguimiento }[] }>(
      INSTRUCCIONES_SUGERIR,
      pedido,
      ESQUEMA_SUGERIR,
      8000,
    );
    for (const p of r.productos ?? []) {
      if (!lote.some((l) => l.indice === p.indice)) continue;
      salida.set(p.indice, {
        nombre: p.nombre.trim().slice(0, 200),
        categoriaId: porNombre(ops.categorias, p.categoria),
        marcaId: porNombre(ops.marcas, p.marca),
        seguimiento: p.seguimiento === "serial" ? "serial" : "none",
      });
    }
  }
  return salida;
}

export interface RenglonValidado extends Renglon, Cruce {
  /** Prellenado para crearlo; solo en los que no están en Odoo o son «posible». */
  sugerencia: Sugerencia | null;
}

/** Cruza los renglones con Odoo y prepara lo que falta crear. */
export async function validar(renglones: Renglon[]) {
  const [productos, ops] = await Promise.all([catalogo(), opciones()]);
  const indice = indexar(productos);
  const cruces = renglones.map((r) => ({ ...r, ...cruzar(r.codigo, indice) }));

  const porCrear = cruces.map((c, i) => ({ c, i })).filter(({ c }) => c.estado === "no_existe" || c.estado === "posible");
  let sugerencias = new Map<number, Sugerencia>();
  let aviso = "";
  if (porCrear.length) {
    if (!hayIA()) aviso = "No hay IA configurada: el nombre, la categoría y la marca hay que ponerlos a mano.";
    else {
      try {
        const s = await sugerir(porCrear.map(({ c }) => c), ops);
        sugerencias = new Map(porCrear.map(({ i }, k) => [i, s.get(k)!]).filter(([, v]) => v) as [number, Sugerencia][]);
      } catch (e: any) {
        console.error("[validar-factura] sugerencias IA:", e?.message);
        aviso = "La IA no respondió: el nombre, la categoría y la marca hay que ponerlos a mano.";
      }
    }
  }

  const resultado: RenglonValidado[] = cruces.map((c, i) => {
    const crear = c.estado === "no_existe" || c.estado === "posible";
    return {
      ...c,
      sugerencia: crear
        ? sugerencias.get(i) ?? { nombre: c.descripcion.toUpperCase().slice(0, 200), categoriaId: null, marcaId: null, seguimiento: "serial" }
        : null,
    };
  });
  return { renglones: resultado, ...ops, aviso };
}

// ───────────────────────── Lectura de PDF / foto ─────────────────────────

const INSTRUCCIONES_LEER =
  "Te dan una factura de compra (o proforma, orden de compra o packing list) de productos, que puede tener varias " +
  "páginas. Lee TODAS las páginas y devuelve solo lo que está en el documento, sin inventar: si un dato no aparece, " +
  "déjalo vacío o en 0. proveedor: quien emite la factura. numero: el número de la factura. " +
  "renglones: una fila por producto, en el orden del documento, con su código (la columna SKU, CODE, ITEM, PART NUMBER, " +
  "MODEL o CÓDIGO; si hay varias, la del número de parte del fabricante), la descripción tal cual, la cantidad y el " +
  "precio unitario (sin símbolo ni separador de miles: 1,015.50 es 1015.50). No incluyas subtotales, impuestos, " +
  "fletes, seguros ni otras líneas que no sean productos.";

const ESQUEMA_LEER = {
  type: "object",
  additionalProperties: false,
  required: ["proveedor", "numero", "renglones"],
  properties: {
    proveedor: { type: "string" },
    numero: { type: "string" },
    renglones: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["codigo", "descripcion", "cantidad", "precio_unitario"],
        properties: {
          codigo: { type: "string" },
          descripcion: { type: "string" },
          cantidad: { type: "number" },
          precio_unitario: { type: "number" },
        },
      },
    },
  },
};

export async function leerFacturaPDF(datos: Buffer, mime: string) {
  const l = await leerConIA(INSTRUCCIONES_LEER, ESQUEMA_LEER, [{ mime, data: datos.toString("base64") }], "Lee esta factura.", 16000);
  const renglones: Renglon[] = (Array.isArray(l?.renglones) ? l.renglones : [])
    .map((r: any) => ({
      codigo: String(r?.codigo ?? "").trim().slice(0, 64),
      descripcion: String(r?.descripcion ?? "").trim().slice(0, 300),
      cantidad: Number(r?.cantidad) > 0 ? Number(r.cantidad) : null,
      precio: Number(r?.precio_unitario) > 0 ? Number(r.precio_unitario) : null,
    }))
    .filter((r: Renglon) => r.codigo || r.descripcion);
  return { proveedor: String(l?.proveedor ?? "").trim(), numero: String(l?.numero ?? "").trim(), renglones };
}

// ───────────────────────── Creación ─────────────────────────

export interface ProductoNuevo {
  codigo: string;
  nombre: string;
  categoriaId: number;
  marcaId: number | null;
  tipo: TipoProducto;
  seguimiento: Seguimiento;
  barcode: string;
  puedeVenderse: boolean;
  puedeComprarse: boolean;
}

export class ProductoInvalido extends Error {}

/** El IVA de ventas y de compras por defecto de cada empresa: lo que pone Odoo al crear el producto a mano. */
async function impuestosPorDefecto() {
  const r =
    (await callOdooRPCEstricto<any[]>("res.company", "search_read", [[]], {
      fields: ["account_sale_tax_id", "account_purchase_tax_id"],
    })) ?? [];
  return {
    venta: r.map((c) => m2o(c.account_sale_tax_id)?.[0]).filter(Boolean) as number[],
    compra: r.map((c) => m2o(c.account_purchase_tax_id)?.[0]).filter(Boolean) as number[],
  };
}

export async function crearProducto(
  p: ProductoNuevo,
  autor: { uid?: number; nombre: string; email: string },
  factura = "",
): Promise<{ id: number; url: string }> {
  const [productos, ops, impuestos] = await Promise.all([catalogo(), opciones(), impuestosPorDefecto()]);

  // No duplicar: el mismo SKU (también con otro formato o archivado) o el mismo código de barras.
  const ya = cruzar(p.codigo, indexar(productos));
  if (ya.estado === "en_odoo" || ya.estado === "archivado" || ya.estado === "sku_distinto") {
    const c = ya.coincidencias[0];
    throw new ProductoInvalido(`Ya existe en Odoo${c.activo ? "" : " (archivado)"}: [${c.codigo}] ${c.nombre}`);
  }
  if (p.barcode && productos.some((x) => x.barcode === p.barcode)) {
    throw new ProductoInvalido(`El código de barras ${p.barcode} ya es de otro producto`);
  }
  if (!ops.categorias.some((c) => c.id === p.categoriaId)) throw new ProductoInvalido("Elige una categoría");
  if (p.marcaId != null && !ops.marcas.some((m) => m.id === p.marcaId)) throw new ProductoInvalido("La marca no existe en Odoo");

  const valores: Record<string, any> = {
    name: p.nombre,
    default_code: p.codigo,
    detailed_type: p.tipo,
    categ_id: p.categoriaId,
    spiff_brand_id: p.marcaId || false,
    tracking: p.tipo === "product" ? p.seguimiento : "none",
    barcode: p.barcode || false,
    sale_ok: p.puedeVenderse,
    purchase_ok: p.puedeComprarse,
    list_price: 1,
    taxes_id: [[6, 0, impuestos.venta]],
    supplier_taxes_id: [[6, 0, impuestos.compra]],
  };
  const escribir = escritor(autor.uid);
  const contexto = { context: { allowed_company_ids: [9, 10] } };
  const id = (await escribir("product.template", "create", [valores], contexto)) as number | null;
  if (!id) throw new Error("Odoo no devolvió el producto creado");

  try {
    await escribir("product.template", "message_post", [[id]], {
      body: `Producto creado desde el panel (Compras › Validar factura${factura ? `, ${factura}` : ""}) por ${autor.nombre || autor.email} (${autor.email}).`,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
  } catch (e: any) {
    console.warn("[validar-factura] sin nota en el chatter:", e?.message);
  }
  return { id, url: urlProducto(id) };
}
