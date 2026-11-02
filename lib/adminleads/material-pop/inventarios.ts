import { randomUUID } from "node:crypto";
import { query } from "@/lib/db";
import { cambiarStock, leerStock } from "./stock";
import { getTodayCaracas, validateNonNegativeQuantity } from "./validation";

/**
 * Inventarios físicos guardados de Material POP.
 *
 * Al guardar un conteo, en una sola transacción: cada renglón deja el stock
 * en lo contado (ajuste "inventario físico" en pop_movements, el Historial) y
 * el conteo entero queda en pop_inventarios / pop_inventario_lineas para
 * consultarlo o descargarlo después. Las tablas se crean solas.
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
      created_by_user_id INT NULL,
      created_by_name VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      KEY idx_cids (cids)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
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
  const fecha = getTodayCaracas();
  const grupoId = randomUUID();

  await conn.beginTransaction();
  const [cab] = await conn.execute(
    `INSERT INTO pop_inventarios
      (movement_group_id, cids, inventory_date, notes, created_by_user_id, created_by_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [grupoId, cids, fecha, notes, userId, userName],
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
    await conn.execute(
      "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
      [productId, location],
    );
    const aMano = await leerStock(conn, productId, location);
    const delta = contado - aMano;

    // Solo lo que cambió va al Historial: un conteo de cientos de renglones
    // sin diferencia no tiene que llenarlo de ajustes en cero.
    if (delta !== 0) {
      conDiferencia++;
      await cambiarStock(conn, productId, location, delta);
      await conn.execute(
        `INSERT INTO pop_movements
          (movement_group_id, type, product_id, location, quantity, reason_type, reason_custom,
           created_by_user_id, created_by_name, cids, movement_date, notes)
         VALUES (?, 'adjustment', ?, ?, ?, 'inventario_físico', NULL, ?, ?, ?, ?, ?)`,
        [grupoId, productId, location, Math.abs(delta), userId, userName, cids, fecha, `Inventario #${inventarioId}`],
      );
    }

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

export async function listarInventarios(cids: number | null) {
  await asegurarTablas();
  const r = await query(
    `SELECT i.id, i.inventory_date, i.notes, i.created_by_name, i.created_at,
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
            l.location, l.on_hand, l.counted, l.difference
     FROM pop_inventario_lineas l
     JOIN pop_inventarios i ON i.id = l.inventario_id
     WHERE l.inventario_id = ? AND (i.cids = ? OR ? IS NULL)
     ORDER BY l.location, l.product_name`,
    [id, cids, cids],
  );
  return (r.rows as any[]).map((x) => ({
    ...x,
    on_hand: Number(x.on_hand),
    counted: Number(x.counted),
    difference: Number(x.difference),
  }));
}
