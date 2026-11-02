import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { cambiarStock, leerStock } from "./stock";
import { getTodayCaracas, validateNonNegativeQuantity } from "./validation";

/**
 * Inventarios físicos de Material POP, en dos pasos como en Odoo:
 *
 * 1. Guardar: el conteo entero queda en pop_inventarios / pop_inventario_lineas
 *    como `pendiente`, con lo que había a mano en ese momento. El stock no cambia,
 *    así alguien lo puede revisar antes.
 * 2. Aplicar: suma o resta a lo que hay HOY la diferencia medida al contar
 *    (no pisa el stock con lo contado: una salida hecha entre el conteo y la
 *    aplicación se borraría). Cada diferencia queda como ajuste "inventario
 *    físico" en pop_movements (el Historial).
 *
 * Un pendiente también se puede descartar. Las tablas se crean solas.
 */

const UBICACIONES = ["office", "warehouse"];

let tablasListas = false;

async function asegurarTablas(): Promise<void> {
  if (tablasListas) return;
  await query(`
    CREATE TABLE IF NOT EXISTS pop_inventarios (
      id INT AUTO_INCREMENT PRIMARY KEY,
      movement_group_id VARCHAR(36) NULL,
      cids INT NULL,
      inventory_date DATE NOT NULL,
      notes TEXT NULL,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      created_by_user_id INT NULL,
      created_by_name VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      applied_by_name VARCHAR(255) NULL,
      applied_at DATETIME NULL,
      KEY idx_cids (cids)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  // La primera versión (nov-2026) ajustaba el stock al guardar y no tenía
  // estado: lo que ya estaba guardado entonces queda como aplicado.
  const col = await query("SHOW COLUMNS FROM pop_inventarios LIKE 'estado'");
  if ((col.rows as any[]).length === 0) {
    await query(
      `ALTER TABLE pop_inventarios
         ADD COLUMN estado VARCHAR(20) NOT NULL DEFAULT 'aplicado',
         ADD COLUMN applied_by_name VARCHAR(255) NULL,
         ADD COLUMN applied_at DATETIME NULL`,
    );
    await query("ALTER TABLE pop_inventarios ALTER COLUMN estado SET DEFAULT 'pendiente'");
  }
  await query(`
    CREATE TABLE IF NOT EXISTS pop_inventario_lineas (
      id INT AUTO_INCREMENT PRIMARY KEY,
      inventario_id INT NOT NULL,
      product_id INT NOT NULL,
      product_code VARCHAR(100) NULL,
      product_name VARCHAR(255) NULL,
      category_name VARCHAR(255) NULL,
      uom_name VARCHAR(100) NULL,
      location VARCHAR(20) NOT NULL,
      on_hand DECIMAL(15,2) NOT NULL,
      counted DECIMAL(15,2) NOT NULL,
      difference DECIMAL(15,2) NOT NULL,
      KEY idx_inventario (inventario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablasListas = true;
}

export class ErrorInventario extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export interface LineaConteo {
  productId: number;
  location: string;
  counted: unknown;
}

const MAX_LINEAS = 5000;

/** Guarda el conteo como pendiente. No toca el stock. */
export async function guardarInventario(
  conn: any,
  datos: {
    lineas: LineaConteo[];
    cids: number | null;
    userId: number | null;
    userName: string;
    notes: string | null;
  },
): Promise<{ id: number; lineas: number; conDiferencia: number }> {
  const { lineas, cids, userId, userName, notes } = datos;
  if (!Array.isArray(lineas) || lineas.length === 0) {
    throw new ErrorInventario("No hay conteos para guardar");
  }
  if (lineas.length > MAX_LINEAS) throw new ErrorInventario("Demasiados renglones");
  const vistos = new Set<string>();
  for (const l of lineas) {
    const key = `${Number(l?.productId)}:${l?.location}`;
    if (!Number.isFinite(Number(l?.productId)) || !UBICACIONES.includes(String(l?.location))) {
      throw new ErrorInventario("Renglón inválido");
    }
    if (vistos.has(key)) throw new ErrorInventario("Hay un renglón repetido");
    vistos.add(key);
  }

  await asegurarTablas();

  await conn.beginTransaction();
  const [cab] = await conn.execute(
    `INSERT INTO pop_inventarios
      (cids, inventory_date, notes, estado, created_by_user_id, created_by_name)
     VALUES (?, ?, ?, 'pendiente', ?, ?)`,
    [cids, getTodayCaracas(), notes, userId, userName],
  );
  const inventarioId = Number(cab.insertId);
  let conDiferencia = 0;

  for (const l of lineas) {
    const productId = Number(l.productId);
    const location = String(l.location);
    const [prod] = await conn.execute(
      `SELECT p.id, p.code, p.name, c.name AS category_name, u.name AS uom_name,
              COALESCE(u.allows_decimal, 0) AS allows_decimal
       FROM pop_products p
       LEFT JOIN pop_uoms u ON u.id = p.uom_id
       LEFT JOIN pop_categories c ON c.id = p.category_id
       WHERE p.id = ? AND p.is_active = 1 AND (p.cids = ? OR ? IS NULL)
       LIMIT 1`,
      [productId, cids, cids],
    );
    if (prod.length === 0) throw new ErrorInventario("Producto no encontrado", 404);
    const p = prod[0];
    const err = validateNonNegativeQuantity(l.counted, Number(p.allows_decimal) === 1);
    if (err) throw new ErrorInventario(`${p.code} ${p.name}: ${err}`);

    const contado = Number(l.counted);
    const [st] = await conn.execute(
      "SELECT quantity FROM pop_stock WHERE product_id = ? AND location = ?",
      [productId, location],
    );
    const aMano = Number(st[0]?.quantity) || 0;
    const delta = contado - aMano;
    if (delta !== 0) conDiferencia++;

    await conn.execute(
      `INSERT INTO pop_inventario_lineas
        (inventario_id, product_id, product_code, product_name, category_name, uom_name,
         location, on_hand, counted, difference)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [inventarioId, productId, p.code, p.name, p.category_name, p.uom_name, location, aMano, contado, delta],
    );
  }

  await conn.commit();
  return { id: inventarioId, lineas: lineas.length, conDiferencia };
}

/** Lleva al stock las diferencias de un inventario pendiente. */
export async function aplicarInventario(
  conn: any,
  datos: { id: number; cids: number | null; userId: number | null; userName: string },
): Promise<{ ajustes: number }> {
  const { id, cids, userId, userName } = datos;
  await asegurarTablas();
  await conn.beginTransaction();

  // FOR UPDATE: dos personas pulsando Aplicar a la vez no lo aplican dos veces.
  const [cab] = await conn.execute(
    "SELECT estado FROM pop_inventarios WHERE id = ? AND (cids = ? OR ? IS NULL) FOR UPDATE",
    [id, cids, cids],
  );
  if (cab.length === 0) throw new ErrorInventario("Inventario no encontrado", 404);
  if (cab[0].estado !== "pendiente") {
    throw new ErrorInventario(`Este inventario ya está ${cab[0].estado}`, 409);
  }

  const [lineas] = await conn.execute(
    `SELECT product_id, product_code, product_name, location, difference
     FROM pop_inventario_lineas WHERE inventario_id = ? AND difference <> 0`,
    [id],
  );
  const fecha = getTodayCaracas();
  const grupoId = randomUUID();
  const negativos: string[] = [];

  for (const l of lineas) {
    const delta = Number(l.difference);
    await conn.execute(
      "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
      [l.product_id, l.location],
    );
    const hoy = await leerStock(conn, l.product_id, l.location);
    if (hoy + delta < 0) {
      negativos.push(`${l.product_code} ${l.product_name} (${l.location === "office" ? "Oficina" : "Almacén"})`);
      continue;
    }
    await cambiarStock(conn, l.product_id, l.location, delta);
    await conn.execute(
      `INSERT INTO pop_movements
        (movement_group_id, type, product_id, location, quantity, reason_type, reason_custom,
         created_by_user_id, created_by_name, cids, movement_date, notes)
       VALUES (?, 'adjustment', ?, ?, ?, 'inventario_físico', NULL, ?, ?, ?, ?, ?)`,
      [grupoId, l.product_id, l.location, Math.abs(delta), userId, userName, cids, fecha, `Inventario #${id}`],
    );
  }

  // Una salida entre el conteo y hoy puede dejar la diferencia sin con qué
  // restar: se frena todo antes que dejar stock negativo.
  if (negativos.length) {
    throw new ErrorInventario(
      `El stock quedaría negativo en: ${negativos.join(", ")}. Revisa el conteo o haz uno nuevo.`,
      409,
    );
  }

  await conn.execute(
    `UPDATE pop_inventarios
     SET estado = 'aplicado', applied_by_name = ?, applied_at = NOW(), movement_group_id = ?
     WHERE id = ?`,
    [userName, grupoId, id],
  );
  await conn.commit();
  return { ajustes: lineas.length };
}

/** Descarta un inventario pendiente: queda en la lista pero ya no se aplica. */
export async function descartarInventario(id: number, cids: number | null, userName: string): Promise<void> {
  await asegurarTablas();
  const r: any = await query(
    `UPDATE pop_inventarios
     SET estado = 'descartado', applied_by_name = ?, applied_at = NOW()
     WHERE id = ? AND estado = 'pendiente' AND (cids = ? OR ? IS NULL)`,
    [userName, id, cids, cids],
  );
  if (!Number((r.rows as any)?.affectedRows)) {
    throw new ErrorInventario("Solo se puede descartar un inventario pendiente", 409);
  }
}

export async function listarInventarios(cids: number | null) {
  await asegurarTablas();
  const r = await query(
    `SELECT i.id, i.inventory_date, i.notes, i.estado, i.created_by_name, i.created_at,
            i.applied_by_name, i.applied_at,
            COUNT(l.id) AS lineas,
            SUM(l.difference <> 0) AS con_diferencia
     FROM pop_inventarios i
     LEFT JOIN pop_inventario_lineas l ON l.inventario_id = i.id
     WHERE (i.cids = ? OR ? IS NULL)
     GROUP BY i.id
     ORDER BY i.id DESC
     LIMIT 200`,
    [cids, cids],
  );
  return (r.rows as any[]).map((x) => ({
    ...x,
    lineas: Number(x.lineas) || 0,
    con_diferencia: Number(x.con_diferencia) || 0,
  }));
}

export async function lineasDeInventario(id: number, cids: number | null) {
  await asegurarTablas();
  const r = await query(
    `SELECT l.product_id, l.product_code, l.product_name, l.category_name, l.uom_name,
            l.location, l.on_hand, l.counted, l.difference, s.quantity AS stock_now
     FROM pop_inventario_lineas l
     JOIN pop_inventarios i ON i.id = l.inventario_id
     LEFT JOIN pop_stock s ON s.product_id = l.product_id AND s.location = l.location
     WHERE l.inventario_id = ? AND (i.cids = ? OR ? IS NULL)
     ORDER BY l.location, l.product_name`,
    [id, cids, cids],
  );
  return (r.rows as any[]).map((x) => ({
    ...x,
    on_hand: Number(x.on_hand),
    counted: Number(x.counted),
    difference: Number(x.difference),
    stock_now: Number(x.stock_now) || 0,
  }));
}
