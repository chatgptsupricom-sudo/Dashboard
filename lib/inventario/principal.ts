/**
 * Inventario del almacén principal de cada sede, una fila por producto.
 *
 * Lo usan las pantallas de Inventario (SuperAdmin, BI, Gerencia de Ventas,
 * Gerente de Operaciones): existencia y reservado salen de `almacenSede` de
 * Compras (Existencias + Entrada del almacén principal, en caché 5 min, nunca
 * negativo), no de todas las ubicaciones internas. Con varias sedes se suman
 * por producto. Los filtros y la paginación se hacen en memoria: son unos
 * pocos miles de productos.
 */
import { SEDES } from "@/lib/compras/constants";
import {
  almacenSede,
  catalogo,
  costos,
  hoyCaracas,
  sumarDias,
  unidadesVendidas,
} from "@/lib/compras/datosOdoo";
import { claveMarca, SIN_MARCA } from "@/lib/metas-marca/marcas";
import { callOdooRPC } from "@/lib/odoo";

/** Sedes con almacén principal, en el orden en que se buscan los costos. */
export const SEDES_INVENTARIO = [9, 10, 7];

/** Existencia igual o menor a esto = "Bajo". */
export const UMBRAL_STOCK_BAJO = 20;

/** Ventanas de "Vendidas" que puede pedir Inteligencia de Negocio (días). */
export const VENTANAS_VENTAS = [30, 90, 365];

export const nombreSede = (cid: number) => SEDES.find((s) => Number(s.id) === cid)?.label ?? String(cid);

export interface FilaInventario {
  /** id del producto (product.product). */
  id: number;
  productId: number;
  name: string;
  code: string;
  brand: string;
  category: string;
  /** Sede o sedes donde tiene existencia. */
  company: string;
  existencia: number;
  reservado: number;
  /** = existencia (compatibilidad con las pantallas de antes). */
  quantity: number;
  status: "Bajo" | "Activo";
  costo?: number | null;
  precioBase?: number | null;
  vendidas?: number;
}

export interface OpcionesInventario {
  companyIds: number[];
  search?: string;
  brand?: string;
  category?: string;
  lowStock?: boolean;
  page?: number;
  limit?: number;
  /** Solo Inteligencia de Negocio: costo, precio base y unidades vendidas. */
  verCostos?: boolean;
  ventasDias?: number;
}

export interface ResultadoInventario {
  inventory: FilaInventario[];
  total_count: number;
  brands: string[];
  categories: string[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;

// Acentos combinados (U+0300 a U+036F) que deja `normalize("NFD")`.
const ACENTOS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, "g");

const normalizar = (s: string) => String(s || "").normalize("NFD").replace(ACENTOS, "").toLowerCase();

interface InfoProducto {
  nombre: string;
  codigo: string;
  marca: string;
  categoria: string;
}

/** Nombre, código, marca y categoría; los que no están en el catálogo activo se leen aparte. */
async function infoProductos(ids: number[]): Promise<Map<number, InfoProducto>> {
  const cat = await catalogo();
  const info = new Map<number, InfoProducto>();
  const faltan: number[] = [];
  for (const id of ids) {
    const p = cat.get(id);
    if (!p) {
      faltan.push(id);
      continue;
    }
    info.set(id, {
      nombre: p.nombre,
      codigo: p.codigo.startsWith("PROD-") ? "" : p.codigo,
      marca: p.marca,
      categoria: p.categoria,
    });
  }
  if (faltan.length) {
    // Archivados (o consumibles sin catálogo) que todavía tienen existencia.
    const filas =
      (await callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", faltan]]], {
        fields: ["id", "default_code", "name", "categ_id", "spiff_brand_id"],
        context: { active_test: false },
      })) || [];
    for (const p of filas) {
      info.set(p.id, {
        nombre: String(p.name || "").trim(),
        codigo: String(p.default_code || "").trim(),
        marca: p.spiff_brand_id ? claveMarca(p.spiff_brand_id[1]) : SIN_MARCA,
        categoria: (p.categ_id && String(p.categ_id[1]).trim()) || "Sin categoría",
      });
    }
  }
  return info;
}

export async function inventarioPrincipal(op: OpcionesInventario): Promise<ResultadoInventario> {
  const sedes = op.companyIds.filter((c) => SEDES_INVENTARIO.includes(c));
  const almacenes = await Promise.all(sedes.map(async (cid) => ({ cid, almacen: await almacenSede(cid) })));

  // Suma por producto del almacén principal de cada sede elegida.
  const porProducto = new Map<number, { existencia: number; reservado: number; sedes: number[] }>();
  for (const { cid, almacen } of almacenes) {
    for (const [pid, s] of almacen.stock) {
      if (!(s.fisico > 0)) continue;
      const x = porProducto.get(pid) ?? { existencia: 0, reservado: 0, sedes: [] };
      x.existencia = r2(x.existencia + s.fisico);
      x.reservado = r2(x.reservado + s.reservado);
      x.sedes.push(cid);
      porProducto.set(pid, x);
    }
  }

  const info = await infoProductos([...porProducto.keys()]);

  let filas: FilaInventario[] = [...porProducto].map(([pid, x]) => {
    const p = info.get(pid);
    return {
      id: pid,
      productId: pid,
      name: p?.nombre || `Producto ${pid}`,
      code: p?.codigo || "",
      brand: p?.marca || SIN_MARCA,
      category: p?.categoria || "Sin categoría",
      company: x.sedes.map(nombreSede).join(", "),
      existencia: x.existencia,
      reservado: x.reservado,
      quantity: x.existencia,
      status: x.existencia <= UMBRAL_STOCK_BAJO ? "Bajo" : "Activo",
    };
  });

  const brand = op.brand && op.brand !== "all" ? op.brand.toUpperCase() : null;
  const category = op.category && op.category !== "all" ? op.category : null;

  // Cada lista de filtro depende del otro filtro (como antes): marcas de la
  // categoría elegida y categorías de la marca elegida.
  const brands = [...new Set(filas.filter((f) => !category || f.category === category).map((f) => f.brand))].sort();
  const categories = [...new Set(filas.filter((f) => !brand || f.brand === brand).map((f) => f.category))].sort();

  if (brand) filas = filas.filter((f) => f.brand === brand);
  if (category) filas = filas.filter((f) => f.category === category);
  if (op.lowStock) filas = filas.filter((f) => f.existencia <= UMBRAL_STOCK_BAJO);
  const q = normalizar(op.search || "").trim();
  if (q) filas = filas.filter((f) => normalizar(f.name).includes(q) || normalizar(f.code).includes(q));

  filas.sort((a, b) => a.name.localeCompare(b.name, "es"));

  const total = filas.length;
  const limit = Math.max(1, op.limit || 10);
  const page = Math.max(1, op.page || 1);
  const pagina = filas.slice((page - 1) * limit, page * limit);

  if (op.verCostos && pagina.length) {
    // Costo de la sede (con varias, la primera en orden 9, 10, 7 que lo tiene)
    // y unidades vendidas sumadas en las sedes elegidas, Odoo + Smartbit antes
    // del corte y sin intercompañía: las cifras de Compras (en caché 10 min).
    const dias = VENTANAS_VENTAS.includes(op.ventasDias ?? 0) ? op.ventasDias! : 90;
    const hasta = hoyCaracas();
    const desde = sumarDias(hasta, -(dias - 1));
    const ids = pagina.map((f) => f.id);
    const [porSede, precios] = await Promise.all([
      Promise.all(
        sedes.map(async (cid) => {
          const [costo, vendidas] = await Promise.all([costos(cid), unidadesVendidas(cid, desde, hasta)]);
          return { cid, costo, vendidas };
        }),
      ),
      callOdooRPC<any[]>("product.product", "search_read", [[["id", "in", ids]]], {
        fields: ["id", "lst_price"],
        context: { active_test: false },
      }),
    ]);
    const precio = new Map<number, number>((precios || []).map((p) => [p.id, Number(p.lst_price) || 0]));
    const orden = [...porSede].sort((a, b) => SEDES_INVENTARIO.indexOf(a.cid) - SEDES_INVENTARIO.indexOf(b.cid));
    for (const f of pagina) {
      const conStock = porProducto.get(f.id)?.sedes ?? [];
      const candidatas = [
        ...orden.filter((s) => conStock.includes(s.cid)),
        ...orden.filter((s) => !conStock.includes(s.cid)),
      ];
      f.costo = candidatas.map((s) => s.costo.get(f.id)).find((c) => c != null && c > 0) ?? null;
      f.precioBase = precio.get(f.id) ?? null;
      f.vendidas = r2(porSede.reduce((t, s) => t + (s.vendidas.get(f.id) ?? 0), 0));
    }
  }

  return { inventory: pagina, total_count: total, brands, categories };
}
