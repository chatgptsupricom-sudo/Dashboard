import { getConnection, query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";

/**
 * Solicitudes de flyers de los vendedores (Banco de Flyers).
 *
 * El vendedor pide el flyer de uno o varios productos, o de una categoría
 * entera; AdminLeads aprueba o rechaza, y cada flyer que se sube al banco marca
 * solo, como hecho, lo que lo pedía.
 *
 * **Cada producto se diseña una sola vez** aunque lo pidan varios vendedores:
 * `flyer_pendientes` tiene una fila por producto por diseñar (llave única por
 * `odoo_product_id`) y cada ítem de una solicitud apunta a ella. Un segundo
 * vendedor que pide lo mismo "se suma": su ítem va a la misma fila, conserva su
 * solicitud, su avance y sus avisos, y no le crea trabajo nuevo a AdminLeads.
 *
 * Ítem abierto = ítem `pendiente` de una solicitud `pendiente` o
 * `en_desarrollo`. La demanda de un producto (cuántos lo piden) y el avance de
 * una solicitud no se guardan: se cuentan al leer.
 */

export type EstadoSolicitudFlyer = "pendiente" | "en_desarrollo" | "completada" | "rechazada" | "cancelada";
export type EstadoItemFlyer = "pendiente" | "hecho" | "descartado";
export type EstadoPendienteFlyer = "por_aprobar" | "en_desarrollo" | "hecho" | "descartado";
export type Urgencia = "normal" | "alta";

export const MAX_PRODUCTOS = 50;
/** Tope al expandir una categoría al aprobarla: más que esto no se diseña de una vez. */
export const MAX_POR_CATEGORIA = 200;

export class ErrorFlyer extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ItemFlyer {
  id: number;
  pendienteId: number | null;
  odooProductId: number | null;
  productCode: string | null;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  estado: EstadoItemFlyer;
  productImageId: number | null;
  hechoAt: string | null;
  nota: string | null;
  /** Otros vendedores con este mismo producto abierto (solo si el ítem sigue pendiente). */
  otrosVendedores: number;
}

export interface SolicitudFlyer {
  id: number;
  codigo: string;
  tipo: "productos" | "categoria";
  categoria: string | null;
  estado: EstadoSolicitudFlyer;
  urgencia: Urgencia;
  paraCuando: string | null;
  motivo: string;
  motivoRechazo: string | null;
  vendedorId: number;
  vendedorNombre: string;
  companyId: number | null;
  revisadoPor: string | null;
  revisadoAt: string | null;
  completadaAt: string | null;
  createdAt: string | null;
  items: ItemFlyer[];
  avance: { hechos: number; total: number; pct: number };
}

const ABIERTA = "('pendiente','en_desarrollo')";

/** Código de producto comparable: sin mayúsculas ni espacios. */
const SQL_CODIGO = (col: string) => `UPPER(REPLACE(TRIM(${col}), ' ', ''))`;
export const claveCodigo = (s: string | null | undefined) => String(s || "").trim().replace(/\s+/g, "").toUpperCase();

function textoFecha(v: any, soloDia = false): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(v);
  const p2 = (x: number) => String(x).padStart(2, "0");
  const dia = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  return soloDia ? dia : `${dia} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

export function avance(items: { estado: EstadoItemFlyer }[]) {
  const validos = items.filter((i) => i.estado !== "descartado");
  const hechos = validos.filter((i) => i.estado === "hecho").length;
  return { hechos, total: validos.length, pct: validos.length ? Math.round((hechos / validos.length) * 100) : 0 };
}

// ─── Tablas ──────────────────────────────────────────────────────────────────

let tablasListas: Promise<void> | null = null;

export function asegurarTablas(): Promise<void> {
  if (!tablasListas) {
    tablasListas = (async () => {
      await query(`CREATE TABLE IF NOT EXISTS flyer_solicitudes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        codigo VARCHAR(20) NULL UNIQUE,
        tipo ENUM('productos','categoria') NOT NULL,
        categoria VARCHAR(255) NULL,
        categoria_id INT NULL,
        estado ENUM('pendiente','en_desarrollo','completada','rechazada','cancelada') NOT NULL DEFAULT 'pendiente',
        urgencia ENUM('normal','alta') NOT NULL DEFAULT 'normal',
        para_cuando DATE NULL,
        motivo TEXT NOT NULL,
        motivo_rechazo TEXT NULL,
        vendedor_id INT NOT NULL,
        vendedor_nombre VARCHAR(255) NOT NULL,
        company_id INT NULL,
        revisado_por VARCHAR(255) NULL,
        revisado_at DATETIME NULL,
        completada_at DATETIME NULL,
        ultimo_aviso_avance DATE NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (estado), INDEX (vendedor_id), INDEX (company_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS flyer_pendientes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        odoo_product_id INT NOT NULL,
        product_code VARCHAR(100) NULL,
        nombre VARCHAR(255) NOT NULL,
        estado ENUM('por_aprobar','en_desarrollo','hecho','descartado') NOT NULL DEFAULT 'por_aprobar',
        product_image_id INT NULL,
        nota VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_producto (odoo_product_id)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS flyer_solicitud_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitud_id INT NOT NULL,
        pendiente_id INT NULL,
        odoo_product_id INT NULL,
        product_code VARCHAR(100) NULL,
        nombre VARCHAR(255) NOT NULL,
        marca VARCHAR(100) NULL,
        categoria VARCHAR(255) NULL,
        estado ENUM('pendiente','hecho','descartado') NOT NULL DEFAULT 'pendiente',
        product_image_id INT NULL,
        hecho_at DATETIME NULL,
        nota VARCHAR(500) NULL,
        INDEX (solicitud_id), INDEX (pendiente_id), INDEX (odoo_product_id), INDEX (estado)
      )`);
      await query(`CREATE TABLE IF NOT EXISTS flyer_solicitud_eventos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitud_id INT NOT NULL,
        evento VARCHAR(40) NOT NULL,
        detalle VARCHAR(500) NULL,
        usuario VARCHAR(255) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX (solicitud_id)
      )`);
    })().catch((e) => {
      tablasListas = null; // se reintenta en la próxima llamada
      throw e;
    });
  }
  return tablasListas;
}

async function evento(conn: any, solicitudId: number, ev: string, detalle: string | null, usuario: string | null) {
  await conn.execute(
    "INSERT INTO flyer_solicitud_eventos (solicitud_id, evento, detalle, usuario) VALUES (?, ?, ?, ?)",
    [solicitudId, ev, detalle ? detalle.slice(0, 500) : null, usuario ? usuario.slice(0, 255) : null],
  );
}

/** Corre `fn` en una transacción y suelta la conexión pase lo que pase. */
async function enTransaccion<T>(fn: (conn: any) => Promise<T>): Promise<T> {
  await asegurarTablas();
  const conn: any = await getConnection();
  try {
    await conn.beginTransaction();
    const r = await fn(conn);
    await conn.commit();
    return r;
  } catch (e) {
    await conn.rollback().catch(() => {});
    throw e;
  } finally {
    conn.release();
  }
}

// ─── Productos de Odoo ───────────────────────────────────────────────────────

export interface ProductoOdoo {
  id: number;
  codigo: string | null;
  nombre: string;
  marca: string | null;
  categoria: string | null;
  categoriaId: number | null;
  precio: number;
}

const CAMPOS_PRODUCTO = ["id", "default_code", "name", "spiff_brand_id", "categ_id", "list_price"];

function aProducto(p: any): ProductoOdoo {
  return {
    id: Number(p.id),
    codigo: p.default_code || null,
    nombre: String(p.name || ""),
    marca: Array.isArray(p.spiff_brand_id) ? p.spiff_brand_id[1] : null,
    // categ_id viene como "Todos / Impresoras": basta la última parte.
    categoria: Array.isArray(p.categ_id) ? String(p.categ_id[1]).split(" / ").pop() || null : null,
    categoriaId: Array.isArray(p.categ_id) ? Number(p.categ_id[0]) : null,
    precio: Number(p.list_price) || 0,
  };
}

export async function buscarProductosOdoo(q: string, limit = 20): Promise<ProductoOdoo[]> {
  const texto = q.trim();
  if (texto.length < 2) return [];
  const rows = await callOdooRPCEstricto<any[]>(
    "product.product",
    "search_read",
    [[["sale_ok", "=", true], "|", ["default_code", "ilike", texto], ["name", "ilike", texto]]],
    { fields: CAMPOS_PRODUCTO, limit },
  );
  return (rows || []).map(aProducto);
}

async function leerProductosOdoo(ids: number[]): Promise<ProductoOdoo[]> {
  if (ids.length === 0) return [];
  const rows = await callOdooRPCEstricto<any[]>(
    "product.product",
    "search_read",
    [[["id", "in", ids]]],
    { fields: CAMPOS_PRODUCTO },
  );
  return (rows || []).map(aProducto);
}

/** Categorías de Odoo con productos a la venta, para pedir una completa. */
export async function categoriasOdoo(): Promise<{ id: number; nombre: string; productos: number }[]> {
  const grupos = await callOdooRPCEstricto<any[]>(
    "product.product",
    "read_group",
    [[["sale_ok", "=", true]], ["categ_id"], ["categ_id"]],
    { lazy: true },
  );
  return (grupos || [])
    .filter((g) => Array.isArray(g.categ_id))
    .map((g) => ({
      id: Number(g.categ_id[0]),
      nombre: String(g.categ_id[1]).split(" / ").pop() || String(g.categ_id[1]),
      productos: Number(g.categ_id_count) || 0,
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}

// ─── Estado de cada producto ─────────────────────────────────────────────────

export interface EstadoProducto {
  /** Flyer que ya está en el banco (product_images.id). */
  flyerId: number | null;
  /** Solicitud abierta del mismo vendedor que ya lo trae. */
  mia: string | null;
  /** Otros vendedores que lo tienen abierto y en qué etapa está su fila. */
  otros: number;
  etapa: EstadoPendienteFlyer | null;
}

/** Flyer más reciente del banco por producto: por id de Odoo o, si no, por código. */
async function flyersDe(productos: { id: number; codigo: string | null }[]): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (productos.length === 0) return map;
  const ids = productos.map((p) => p.id);
  const codigos = productos.map((p) => claveCodigo(p.codigo)).filter(Boolean);
  const res = await query(
    `SELECT id, odoo_product_id, ${SQL_CODIGO("product_code")} AS codigo FROM product_images
      WHERE odoo_product_id IN (${ids.map(() => "?").join(",")})
      ${codigos.length ? `OR ${SQL_CODIGO("product_code")} IN (${codigos.map(() => "?").join(",")})` : ""}
      ORDER BY created_at ASC`,
    [...ids, ...codigos],
  );
  for (const p of productos) {
    const clave = claveCodigo(p.codigo);
    for (const r of res.rows || []) {
      if (Number(r.odoo_product_id) === p.id || (clave && r.codigo === clave)) map.set(p.id, Number(r.id));
    }
  }
  return map;
}

export async function estadoProductos(
  productos: { id: number; codigo: string | null }[],
  vendedorId: number | null,
): Promise<Map<number, EstadoProducto>> {
  await asegurarTablas();
  const out = new Map<number, EstadoProducto>();
  if (productos.length === 0) return out;
  const flyers = await flyersDe(productos);
  const ids = productos.map((p) => p.id);
  const res = await query(
    `SELECT i.odoo_product_id, s.vendedor_id, s.codigo, p.estado AS etapa
       FROM flyer_solicitud_items i
       JOIN flyer_solicitudes s ON s.id = i.solicitud_id
       LEFT JOIN flyer_pendientes p ON p.id = i.pendiente_id
      WHERE i.estado = 'pendiente' AND s.estado IN ${ABIERTA}
        AND i.odoo_product_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const p of productos) {
    const filas = (res.rows || []).filter((r: any) => Number(r.odoo_product_id) === p.id);
    const mia = filas.find((r: any) => vendedorId !== null && Number(r.vendedor_id) === vendedorId);
    const otros = new Set(
      filas.filter((r: any) => Number(r.vendedor_id) !== vendedorId).map((r: any) => Number(r.vendedor_id)),
    );
    out.set(p.id, {
      flyerId: flyers.get(p.id) ?? null,
      mia: mia ? String(mia.codigo) : null,
      otros: otros.size,
      etapa: (filas[0]?.etapa as EstadoPendienteFlyer) || null,
    });
  }
  return out;
}

// ─── Listar ──────────────────────────────────────────────────────────────────

export async function listarSolicitudes(opts: {
  cids: number | null;
  vendedorId?: number | null;
  estado?: string | null;
  id?: number;
}): Promise<SolicitudFlyer[]> {
  await asegurarTablas();
  const params: any[] = [];
  let where = "WHERE 1=1";
  if (opts.cids !== null) {
    where += " AND s.company_id = ?";
    params.push(opts.cids);
  }
  if (opts.vendedorId) {
    where += " AND s.vendedor_id = ?";
    params.push(opts.vendedorId);
  }
  if (opts.estado) {
    where += " AND s.estado = ?";
    params.push(opts.estado);
  }
  if (opts.id) {
    where += " AND s.id = ?";
    params.push(opts.id);
  }
  const sol = await query(`SELECT s.* FROM flyer_solicitudes s ${where} ORDER BY s.created_at DESC, s.id DESC LIMIT 300`, params);
  const filas = sol.rows || [];
  if (filas.length === 0) return [];

  const ids = filas.map((r: any) => Number(r.id));
  const it = await query(
    `SELECT i.*,
            (SELECT COUNT(DISTINCT s2.vendedor_id) FROM flyer_solicitud_items i2
               JOIN flyer_solicitudes s2 ON s2.id = i2.solicitud_id
              WHERE i2.pendiente_id = i.pendiente_id AND i2.estado = 'pendiente'
                AND s2.estado IN ${ABIERTA} AND i2.solicitud_id <> i.solicitud_id) AS otros
       FROM flyer_solicitud_items i
      WHERE i.solicitud_id IN (${ids.map(() => "?").join(",")})
      ORDER BY i.id`,
    ids,
  );
  const porSolicitud = new Map<number, ItemFlyer[]>();
  for (const r of it.rows || []) {
    const lista = porSolicitud.get(Number(r.solicitud_id)) || [];
    lista.push({
      id: Number(r.id),
      pendienteId: r.pendiente_id ? Number(r.pendiente_id) : null,
      odooProductId: r.odoo_product_id ? Number(r.odoo_product_id) : null,
      productCode: r.product_code || null,
      nombre: r.nombre,
      marca: r.marca || null,
      categoria: r.categoria || null,
      estado: r.estado,
      productImageId: r.product_image_id ? Number(r.product_image_id) : null,
      hechoAt: textoFecha(r.hecho_at),
      nota: r.nota || null,
      otrosVendedores: r.estado === "pendiente" && r.pendiente_id ? Number(r.otros) || 0 : 0,
    });
    porSolicitud.set(Number(r.solicitud_id), lista);
  }

  return filas.map((r: any) => {
    const items = porSolicitud.get(Number(r.id)) || [];
    return {
      id: Number(r.id),
      codigo: r.codigo,
      tipo: r.tipo,
      categoria: r.categoria || null,
      estado: r.estado,
      urgencia: r.urgencia,
      paraCuando: textoFecha(r.para_cuando, true),
      motivo: r.motivo,
      motivoRechazo: r.motivo_rechazo || null,
      vendedorId: Number(r.vendedor_id),
      vendedorNombre: r.vendedor_nombre,
      companyId: r.company_id === null ? null : Number(r.company_id),
      revisadoPor: r.revisado_por || null,
      revisadoAt: textoFecha(r.revisado_at),
      completadaAt: textoFecha(r.completada_at),
      createdAt: textoFecha(r.created_at),
      items,
      avance: avance(items),
    };
  });
}

/** Filas por diseñar con su demanda, para la vista "Por producto" del admin. */
export async function porProducto(cids: number | null) {
  await asegurarTablas();
  const params: any[] = [];
  let sede = "";
  if (cids !== null) {
    sede = " AND s.company_id = ?";
    params.push(cids);
  }
  const res = await query(
    `SELECT p.id, p.odoo_product_id, p.product_code, p.nombre, p.estado,
            s.id AS solicitud_id, s.codigo, s.vendedor_nombre, s.urgencia, s.para_cuando, s.estado AS estado_solicitud
       FROM flyer_pendientes p
       JOIN flyer_solicitud_items i ON i.pendiente_id = p.id AND i.estado = 'pendiente'
       JOIN flyer_solicitudes s ON s.id = i.solicitud_id AND s.estado IN ${ABIERTA}
      WHERE p.estado IN ('por_aprobar','en_desarrollo')${sede}`,
    params,
  );
  const map = new Map<number, any>();
  for (const r of res.rows || []) {
    const id = Number(r.id);
    const f = map.get(id) || {
      id,
      odooProductId: Number(r.odoo_product_id),
      productCode: r.product_code || null,
      nombre: r.nombre,
      estado: r.estado as EstadoPendienteFlyer,
      vendedores: [] as string[],
      solicitudes: [] as { id: number; codigo: string; estado: EstadoSolicitudFlyer }[],
      urgencia: "normal" as Urgencia,
      paraCuando: null as string | null,
    };
    if (!f.vendedores.includes(r.vendedor_nombre)) f.vendedores.push(r.vendedor_nombre);
    if (!f.solicitudes.some((x: any) => x.id === Number(r.solicitud_id))) {
      f.solicitudes.push({ id: Number(r.solicitud_id), codigo: r.codigo, estado: r.estado_solicitud });
    }
    if (r.urgencia === "alta") f.urgencia = "alta";
    const fecha = textoFecha(r.para_cuando, true);
    if (fecha && (!f.paraCuando || fecha < f.paraCuando)) f.paraCuando = fecha;
    map.set(id, f);
  }
  // Urgencia, luego demanda, luego la fecha más próxima.
  return Array.from(map.values()).sort(
    (a, b) =>
      (a.urgencia === "alta" ? 0 : 1) - (b.urgencia === "alta" ? 0 : 1) ||
      b.vendedores.length - a.vendedores.length ||
      (a.paraCuando || "9999").localeCompare(b.paraCuando || "9999"),
  );
}

// ─── Crear ───────────────────────────────────────────────────────────────────

/**
 * Busca o crea la fila de trabajo del producto y la bloquea. La llave única
 * por producto + FOR UPDATE: dos vendedores a la vez (o dos clics) no pueden
 * dejar dos filas del mismo producto. Una fila ya cerrada (hecho cuyo flyer se
 * borró, o descartado) se reabre.
 */
async function filaDeProducto(conn: any, p: ProductoOdoo, aprobada: boolean): Promise<{ id: number; estado: EstadoPendienteFlyer }> {
  await conn.execute(
    `INSERT INTO flyer_pendientes (odoo_product_id, product_code, nombre, estado)
     VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id`,
    [p.id, p.codigo, p.nombre.slice(0, 255), aprobada ? "en_desarrollo" : "por_aprobar"],
  );
  const [rows] = await conn.execute("SELECT id, estado FROM flyer_pendientes WHERE odoo_product_id = ? FOR UPDATE", [p.id]);
  const fila = rows[0];
  let estado = fila.estado as EstadoPendienteFlyer;
  if (estado === "hecho" || estado === "descartado") {
    estado = aprobada ? "en_desarrollo" : "por_aprobar";
    await conn.execute("UPDATE flyer_pendientes SET estado = ?, product_image_id = NULL, nota = NULL WHERE id = ?", [estado, fila.id]);
  } else if (aprobada && estado === "por_aprobar") {
    estado = "en_desarrollo";
    await conn.execute("UPDATE flyer_pendientes SET estado = 'en_desarrollo' WHERE id = ?", [fila.id]);
  }
  return { id: Number(fila.id), estado };
}

async function insertarItem(conn: any, solicitudId: number, p: ProductoOdoo, pendienteId: number) {
  await conn.execute(
    `INSERT INTO flyer_solicitud_items (solicitud_id, pendiente_id, odoo_product_id, product_code, nombre, marca, categoria)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [solicitudId, pendienteId, p.id, p.codigo, p.nombre.slice(0, 255), p.marca?.slice(0, 100) ?? null, p.categoria?.slice(0, 255) ?? null],
  );
}

/** Reglas al pedir productos: sin flyer, sin repetir los propios. */
async function validarProductos(ids: number[], vendedorId: number | null): Promise<ProductoOdoo[]> {
  if (ids.length === 0) throw new ErrorFlyer("Agrega al menos un producto");
  if (ids.length > MAX_PRODUCTOS) throw new ErrorFlyer(`Máximo ${MAX_PRODUCTOS} productos por solicitud`);
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new ErrorFlyer("Producto inválido");
  if (new Set(ids).size !== ids.length) throw new ErrorFlyer("Hay un producto repetido");

  // Los datos se leen de Odoo aquí: no se confía en lo que manda la pantalla.
  const productos = await leerProductosOdoo(ids);
  if (productos.length !== ids.length) throw new ErrorFlyer("Algún producto ya no está en Odoo", 404);

  const estados = await estadoProductos(productos, vendedorId);
  for (const p of productos) {
    const e = estados.get(p.id)!;
    if (e.flyerId) throw new ErrorFlyer(`${p.codigo || p.nombre} ya tiene flyer en el banco`);
    if (e.mia) throw new ErrorFlyer(`${p.codigo || p.nombre}: ya lo pediste en ${e.mia}`);
  }
  return productos;
}

export async function crearSolicitud(opts: {
  cids: number | null;
  vendedorId: number;
  vendedorNombre: string;
  tipo: "productos" | "categoria";
  productos: number[];
  categoriaId: number | null;
  urgencia: Urgencia;
  paraCuando: string | null;
  motivo: string;
}): Promise<{ id: number; codigo: string; estado: EstadoSolicitudFlyer }> {
  const motivo = opts.motivo.trim();
  if (!motivo) throw new ErrorFlyer("Indica para qué es: el cliente o la campaña");
  if (opts.paraCuando && !/^\d{4}-\d{2}-\d{2}$/.test(opts.paraCuando)) throw new ErrorFlyer("Fecha inválida");

  let productos: ProductoOdoo[] = [];
  let categoria: { id: number; nombre: string } | null = null;
  if (opts.tipo === "productos") {
    productos = await validarProductos(opts.productos, opts.vendedorId);
  } else {
    if (!opts.categoriaId) throw new ErrorFlyer("Elige una categoría");
    const cat = await callOdooRPCEstricto<any[]>("product.category", "search_read", [[["id", "=", opts.categoriaId]]], {
      fields: ["id", "name"],
    });
    if (!cat?.length) throw new ErrorFlyer("La categoría no existe en Odoo", 404);
    categoria = { id: Number(cat[0].id), nombre: String(cat[0].name) };
    await asegurarTablas();
    const dup = await query(
      `SELECT codigo FROM flyer_solicitudes WHERE vendedor_id = ? AND categoria_id = ? AND tipo = 'categoria'
         AND estado IN ${ABIERTA} LIMIT 1`,
      [opts.vendedorId, categoria.id],
    );
    if (dup.rows?.[0]) throw new ErrorFlyer(`Ya pediste esa categoría en ${dup.rows[0].codigo}`);
  }

  return enTransaccion(async (conn) => {
    const [ins] = await conn.execute(
      `INSERT INTO flyer_solicitudes
         (tipo, categoria, categoria_id, urgencia, para_cuando, motivo, vendedor_id, vendedor_nombre, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        opts.tipo,
        categoria?.nombre ?? null,
        categoria?.id ?? null,
        opts.urgencia,
        opts.paraCuando,
        motivo.slice(0, 2000),
        opts.vendedorId,
        opts.vendedorNombre.slice(0, 255),
        opts.cids,
      ],
    );
    const id = Number(ins.insertId);
    // El código sale del id ya asignado: dos solicitudes simultáneas no se pelean el número.
    const codigo = `FS-${String(id).padStart(4, "0")}`;

    // Lo que ya estaba aprobado para otro vendedor no necesita aprobación de nuevo.
    let todasAprobadas = productos.length > 0;
    for (const p of productos) {
      const fila = await filaDeProducto(conn, p, false);
      if (fila.estado !== "en_desarrollo") todasAprobadas = false;
      await insertarItem(conn, id, p, fila.id);
    }
    const estado: EstadoSolicitudFlyer = todasAprobadas ? "en_desarrollo" : "pendiente";
    await conn.execute("UPDATE flyer_solicitudes SET codigo = ?, estado = ? WHERE id = ?", [codigo, estado, id]);
    await evento(conn, id, "creada", categoria ? `Categoría ${categoria.nombre}` : `${productos.length} productos`, opts.vendedorNombre);
    if (todasAprobadas) await evento(conn, id, "aprobada", "Ya estaban en desarrollo para otros vendedores", null);
    return { id, codigo, estado };
  });
}

// ─── Cerrar sin hacer ────────────────────────────────────────────────────────

/**
 * Suelta los ítems de una solicitud que se cierra sin hacerse (rechazada o
 * cancelada): la fila de cada producto queda para los demás vendedores, y si ya
 * nadie la pide y nadie la aprobó, se borra.
 */
async function soltarItems(conn: any, solicitudId: number) {
  const [items] = await conn.execute(
    "SELECT DISTINCT pendiente_id FROM flyer_solicitud_items WHERE solicitud_id = ? AND pendiente_id IS NOT NULL",
    [solicitudId],
  );
  await conn.execute("UPDATE flyer_solicitud_items SET pendiente_id = NULL WHERE solicitud_id = ? AND estado = 'pendiente'", [solicitudId]);
  for (const r of items) {
    const [abiertos] = await conn.execute(
      `SELECT COUNT(*) AS n FROM flyer_solicitud_items i JOIN flyer_solicitudes s ON s.id = i.solicitud_id
        WHERE i.pendiente_id = ? AND i.estado = 'pendiente' AND s.estado IN ${ABIERTA}`,
      [r.pendiente_id],
    );
    if (Number(abiertos[0].n) === 0) {
      await conn.execute("DELETE FROM flyer_pendientes WHERE id = ? AND estado = 'por_aprobar'", [r.pendiente_id]);
    }
  }
}

async function bloquearSolicitud(conn: any, id: number, cids: number | null, vendedorId?: number | null) {
  const params: any[] = [id];
  let where = "id = ?";
  if (cids !== null) {
    where += " AND company_id = ?";
    params.push(cids);
  }
  if (vendedorId) {
    where += " AND vendedor_id = ?";
    params.push(vendedorId);
  }
  const [rows] = await conn.execute(`SELECT * FROM flyer_solicitudes WHERE ${where} FOR UPDATE`, params);
  if (!rows[0]) throw new ErrorFlyer("Solicitud no encontrada", 404);
  return rows[0];
}

export async function cancelarSolicitud(opts: { id: number; cids: number | null; vendedorId: number; usuario: string }) {
  await enTransaccion(async (conn) => {
    const s = await bloquearSolicitud(conn, opts.id, opts.cids, opts.vendedorId);
    if (s.estado !== "pendiente") throw new ErrorFlyer("Solo se cancela una solicitud que nadie ha revisado");
    await conn.execute("UPDATE flyer_solicitudes SET estado = 'cancelada' WHERE id = ?", [opts.id]);
    await soltarItems(conn, opts.id);
    await evento(conn, opts.id, "cancelada", null, opts.usuario);
  });
}

export async function rechazarSolicitud(opts: { id: number; cids: number | null; motivo: string; usuario: string }) {
  const motivo = opts.motivo.trim();
  if (!motivo) throw new ErrorFlyer("Escribe el motivo: lo ve el vendedor");
  await enTransaccion(async (conn) => {
    const s = await bloquearSolicitud(conn, opts.id, opts.cids);
    if (s.estado !== "pendiente") throw new ErrorFlyer(`La solicitud ya está ${s.estado.replace("_", " ")}`);
    await conn.execute(
      "UPDATE flyer_solicitudes SET estado = 'rechazada', motivo_rechazo = ?, revisado_por = ?, revisado_at = NOW() WHERE id = ?",
      [motivo.slice(0, 2000), opts.usuario.slice(0, 255), opts.id],
    );
    await soltarItems(conn, opts.id);
    await evento(conn, opts.id, "rechazada", motivo, opts.usuario);
  });
}

// ─── Avance ──────────────────────────────────────────────────────────────────

/** Pasa a completada cada solicitud en desarrollo que ya no tiene ítems pendientes. Devuelve las que completó. */
async function completarSiListas(conn: any, ids: number[], usuario: string | null): Promise<number[]> {
  const completas: number[] = [];
  for (const id of new Set(ids)) {
    const [r] = await conn.execute(
      `SELECT s.estado, (SELECT COUNT(*) FROM flyer_solicitud_items WHERE solicitud_id = s.id AND estado = 'pendiente') AS faltan
         FROM flyer_solicitudes s WHERE s.id = ?`,
      [id],
    );
    if (r[0]?.estado === "en_desarrollo" && Number(r[0].faltan) === 0) {
      await conn.execute("UPDATE flyer_solicitudes SET estado = 'completada', completada_at = NOW() WHERE id = ?", [id]);
      await evento(conn, id, "completada", null, usuario);
      completas.push(id);
    }
  }
  return completas;
}

export async function aprobarSolicitud(opts: { id: number; cids: number | null; usuario: string }) {
  // La categoría se expande antes de la transacción: leer Odoo con filas bloqueadas las tendría esperando.
  await asegurarTablas();
  const previa = (await query("SELECT * FROM flyer_solicitudes WHERE id = ?", [opts.id])).rows?.[0];
  let expandidos: ProductoOdoo[] = [];
  let recortado = false;
  if (previa?.tipo === "categoria" && previa.categoria_id) {
    const rows = await callOdooRPCEstricto<any[]>(
      "product.product",
      "search_read",
      [[["sale_ok", "=", true], ["categ_id", "child_of", Number(previa.categoria_id)]]],
      { fields: CAMPOS_PRODUCTO, limit: 2000 },
    );
    const todos = (rows || []).map(aProducto);
    const flyers = await flyersDe(todos);
    expandidos = todos.filter((p) => !flyers.has(p.id));
    recortado = expandidos.length > MAX_POR_CATEGORIA;
    expandidos = expandidos.slice(0, MAX_POR_CATEGORIA);
  }

  return enTransaccion(async (conn) => {
    const s = await bloquearSolicitud(conn, opts.id, opts.cids);
    if (s.estado !== "pendiente") throw new ErrorFlyer(`La solicitud ya está ${s.estado.replace("_", " ")}`);
    await conn.execute(
      "UPDATE flyer_solicitudes SET estado = 'en_desarrollo', revisado_por = ?, revisado_at = NOW() WHERE id = ?",
      [opts.usuario.slice(0, 255), opts.id],
    );

    if (s.tipo === "categoria") {
      const [ya] = await conn.execute("SELECT COUNT(*) AS n FROM flyer_solicitud_items WHERE solicitud_id = ?", [opts.id]);
      if (Number(ya[0].n) === 0) {
        for (const p of expandidos) {
          const fila = await filaDeProducto(conn, p, true);
          await insertarItem(conn, opts.id, p, fila.id);
        }
      }
    }
    // Los productos de esta solicitud pasan a desarrollo (también para los demás que se sumaron).
    await conn.execute(
      `UPDATE flyer_pendientes SET estado = 'en_desarrollo'
        WHERE estado = 'por_aprobar' AND id IN (SELECT pendiente_id FROM flyer_solicitud_items WHERE solicitud_id = ? AND estado = 'pendiente')`,
      [opts.id],
    );
    await evento(
      conn,
      opts.id,
      "aprobada",
      s.tipo === "categoria"
        ? `${expandidos.length} productos sin flyer${recortado ? ` (solo los primeros ${MAX_POR_CATEGORIA})` : ""}`
        : null,
      opts.usuario,
    );
    // Sin nada por hacer (categoría que ya tenía todo, o lo pedido salió mientras esperaba) se completa ya.
    const completas = await completarSiListas(conn, [opts.id], opts.usuario);
    return { completada: completas.length > 0, productos: expandidos.length };
  });
}

/** Descarta un producto en todas las solicitudes abiertas que lo piden. */
export async function descartarPendiente(opts: { pendienteId: number; nota: string; usuario: string }): Promise<ResultadoMarcar> {
  const nota = opts.nota.trim();
  if (!nota) throw new ErrorFlyer("Escribe por qué no se hará: lo ve el vendedor");
  return enTransaccion(async (conn) => {
    const [f] = await conn.execute("SELECT id FROM flyer_pendientes WHERE id = ? FOR UPDATE", [opts.pendienteId]);
    if (!f[0]) throw new ErrorFlyer("Producto no encontrado", 404);
    await conn.execute("UPDATE flyer_pendientes SET estado = 'descartado', nota = ? WHERE id = ?", [nota.slice(0, 500), opts.pendienteId]);
    const [items] = await conn.execute(
      "SELECT id, solicitud_id, nombre FROM flyer_solicitud_items WHERE pendiente_id = ? AND estado = 'pendiente'",
      [opts.pendienteId],
    );
    await conn.execute(
      "UPDATE flyer_solicitud_items SET estado = 'descartado', nota = ? WHERE pendiente_id = ? AND estado = 'pendiente'",
      [nota.slice(0, 500), opts.pendienteId],
    );
    for (const it of items) await evento(conn, Number(it.solicitud_id), "item_descartado", `${it.nombre}: ${nota}`, opts.usuario);
    const tocadas = Array.from(new Set<number>(items.map((it: any) => Number(it.solicitud_id))));
    const completadas = await completarSiListas(conn, tocadas, opts.usuario);
    return { conAvance: tocadas.filter((id) => !completadas.includes(id)), completadas };
  });
}

/** Descartar un ítem desde la solicitud: si comparte fila, se descarta el producto para todos. */
export async function descartarItem(opts: {
  solicitudId: number;
  itemId: number;
  cids: number | null;
  nota: string;
  usuario: string;
}): Promise<ResultadoMarcar> {
  await asegurarTablas();
  const sede = opts.cids !== null ? " AND s.company_id = ?" : "";
  const r = await query(
    `SELECT i.id, i.pendiente_id, i.estado, i.nombre FROM flyer_solicitud_items i JOIN flyer_solicitudes s ON s.id = i.solicitud_id
      WHERE i.id = ? AND i.solicitud_id = ?${sede}`,
    opts.cids !== null ? [opts.itemId, opts.solicitudId, opts.cids] : [opts.itemId, opts.solicitudId],
  );
  const item = r.rows?.[0];
  if (!item) throw new ErrorFlyer("Producto no encontrado", 404);
  if (item.estado !== "pendiente") throw new ErrorFlyer("Ese producto ya no está pendiente");
  if (item.pendiente_id) return descartarPendiente({ pendienteId: Number(item.pendiente_id), nota: opts.nota, usuario: opts.usuario });
  const nota = opts.nota.trim();
  if (!nota) throw new ErrorFlyer("Escribe por qué no se hará: lo ve el vendedor");
  return enTransaccion(async (conn) => {
    await conn.execute("UPDATE flyer_solicitud_items SET estado = 'descartado', nota = ? WHERE id = ?", [nota.slice(0, 500), opts.itemId]);
    await evento(conn, opts.solicitudId, "item_descartado", `${item.nombre}: ${nota}`, opts.usuario);
    const completadas = await completarSiListas(conn, [opts.solicitudId], opts.usuario);
    return { conAvance: completadas.length ? [] : [opts.solicitudId], completadas };
  });
}

/** El admin suma productos a una solicitud (no repite los que ya trae ni los que tienen flyer). */
export async function agregarItems(opts: { id: number; cids: number | null; productos: number[]; usuario: string }) {
  const productos = await validarProductos(opts.productos, null);
  await enTransaccion(async (conn) => {
    const s = await bloquearSolicitud(conn, opts.id, opts.cids);
    if (!["pendiente", "en_desarrollo", "completada"].includes(s.estado)) {
      throw new ErrorFlyer(`La solicitud ya está ${s.estado}`);
    }
    const [ya] = await conn.execute("SELECT odoo_product_id FROM flyer_solicitud_items WHERE solicitud_id = ?", [opts.id]);
    const yaEstan = new Set(ya.map((r: any) => Number(r.odoo_product_id)));
    const aprobada = s.estado !== "pendiente";
    for (const p of productos) {
      if (yaEstan.has(p.id)) continue;
      const fila = await filaDeProducto(conn, p, aprobada);
      await insertarItem(conn, opts.id, p, fila.id);
    }
    if (s.estado === "completada") {
      await conn.execute("UPDATE flyer_solicitudes SET estado = 'en_desarrollo', completada_at = NULL WHERE id = ?", [opts.id]);
      await evento(conn, opts.id, "reabierta", "Se agregaron productos", opts.usuario);
    }
    await evento(conn, opts.id, "items_agregados", productos.map((p) => p.codigo || p.nombre).join(", "), opts.usuario);
  });
}

// ─── Flyers que entran y salen del banco ─────────────────────────────────────

export interface ResultadoMarcar {
  /** Solicitudes que ganaron un ítem hecho (para el aviso de avance). */
  conAvance: number[];
  /** Solicitudes que quedaron completas. */
  completadas: number[];
}

/**
 * Al subir un flyer: cierra la fila del producto y marca hecho cada ítem
 * pendiente que apunta a ella, de todos los vendedores. Si el flyer no trae id
 * de Odoo, se busca por código.
 */
export async function marcarItemsHechos(opts: {
  productImageId: number;
  odooProductId: number | null;
  productCode: string | null;
  usuario: string | null;
}): Promise<ResultadoMarcar> {
  const codigo = claveCodigo(opts.productCode);
  if (!opts.odooProductId && !codigo) return { conAvance: [], completadas: [] };
  return enTransaccion(async (conn) => {
    const [filas] = opts.odooProductId
      ? await conn.execute("SELECT id FROM flyer_pendientes WHERE odoo_product_id = ? FOR UPDATE", [opts.odooProductId])
      : await conn.execute(`SELECT id FROM flyer_pendientes WHERE ${SQL_CODIGO("product_code")} = ? FOR UPDATE`, [codigo]);
    if (filas.length === 0) return { conAvance: [], completadas: [] };
    const ids = filas.map((f: any) => Number(f.id));
    const enIds = ids.map(() => "?").join(",");
    await conn.execute(`UPDATE flyer_pendientes SET estado = 'hecho', product_image_id = ? WHERE id IN (${enIds})`, [
      opts.productImageId,
      ...ids,
    ]);
    const [items] = await conn.execute(
      `SELECT id, solicitud_id, nombre FROM flyer_solicitud_items WHERE pendiente_id IN (${enIds}) AND estado = 'pendiente'`,
      ids,
    );
    if (items.length === 0) return { conAvance: [], completadas: [] };
    await conn.execute(
      `UPDATE flyer_solicitud_items SET estado = 'hecho', product_image_id = ?, hecho_at = NOW()
        WHERE pendiente_id IN (${enIds}) AND estado = 'pendiente'`,
      [opts.productImageId, ...ids],
    );
    for (const it of items) await evento(conn, Number(it.solicitud_id), "item_hecho", it.nombre, opts.usuario);
    const tocadas = Array.from(new Set<number>(items.map((it: any) => Number(it.solicitud_id))));
    const completadas = await completarSiListas(conn, tocadas, opts.usuario);
    return { conAvance: tocadas.filter((id) => !completadas.includes(id)), completadas };
  });
}

/**
 * Al borrar un flyer: lo que había completado vuelve a pendiente y su
 * solicitud, si estaba completa, vuelve a desarrollo. Si el producto tiene
 * otro flyer en el banco, se vuelve a marcar con ese.
 */
export async function reabrirItems(productImageId: number, usuario: string | null): Promise<void> {
  const reabiertas = await enTransaccion(async (conn) => {
    const [items] = await conn.execute(
      "SELECT id, solicitud_id, nombre FROM flyer_solicitud_items WHERE product_image_id = ? AND estado = 'hecho'",
      [productImageId],
    );
    await conn.execute(
      "UPDATE flyer_pendientes SET estado = 'en_desarrollo', product_image_id = NULL WHERE product_image_id = ?",
      [productImageId],
    );
    await conn.execute(
      "UPDATE flyer_solicitud_items SET estado = 'pendiente', product_image_id = NULL, hecho_at = NULL WHERE product_image_id = ? AND estado = 'hecho'",
      [productImageId],
    );
    const ids = Array.from(new Set<number>(items.map((it: any) => Number(it.solicitud_id))));
    for (const id of ids) {
      const [r] = await conn.execute("SELECT estado FROM flyer_solicitudes WHERE id = ? FOR UPDATE", [id]);
      if (r[0]?.estado === "completada") {
        await conn.execute("UPDATE flyer_solicitudes SET estado = 'en_desarrollo', completada_at = NULL WHERE id = ?", [id]);
        await evento(conn, id, "reabierta", "Se borró el flyer de un producto", usuario);
      }
    }
    return items as any[];
  });

  if (reabiertas.length === 0) return;
  // ¿Queda otro flyer de esos productos? Entonces siguen hechos, con ese.
  const prods = await query(
    `SELECT DISTINCT p.odoo_product_id, p.product_code FROM flyer_pendientes p
       JOIN flyer_solicitud_items i ON i.pendiente_id = p.id
      WHERE i.id IN (${reabiertas.map(() => "?").join(",")})`,
    reabiertas.map((it) => Number(it.id)),
  );
  for (const p of prods.rows || []) {
    const flyers = await flyersDe([{ id: Number(p.odoo_product_id), codigo: p.product_code }]);
    const otro = flyers.get(Number(p.odoo_product_id));
    if (otro && otro !== productImageId) {
      await marcarItemsHechos({ productImageId: otro, odooProductId: Number(p.odoo_product_id), productCode: null, usuario });
    }
  }
}

/** Para el aviso de avance: como mucho un correo por día por solicitud. Marca el día si toca avisar. */
export async function tocaAvisoAvance(id: number): Promise<boolean> {
  const r = await query(
    "UPDATE flyer_solicitudes SET ultimo_aviso_avance = CURDATE() WHERE id = ? AND (ultimo_aviso_avance IS NULL OR ultimo_aviso_avance < CURDATE())",
    [id],
  );
  return Number((r.rows as any)?.affectedRows) > 0;
}

/** Cuántas solicitudes por revisar tiene la sede (contador de la pestaña). */
export async function pendientesPorRevisar(cids: number | null): Promise<number> {
  await asegurarTablas();
  const r = await query(
    `SELECT COUNT(*) AS n FROM flyer_solicitudes WHERE estado = 'pendiente'${cids !== null ? " AND company_id = ?" : ""}`,
    cids !== null ? [cids] : [],
  );
  return Number(r.rows?.[0]?.n) || 0;
}
