import { getConnection } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { generateSku } from "@/lib/adminleads/material-pop/sku";
import {
  validateNonNegativeQuantity,
} from "@/lib/adminleads/material-pop/validation";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX_ROWS = 1000;

interface ImportRow {
  sku?: string;
  name?: string;
  category?: string;
  uom?: string;
  stockOffice?: number;
  stockWarehouse?: number;
  allowsDecimal?: boolean;
  brand?: string;
  description?: string;
}

function truncar(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/**
 * Busca o crea una fila de catalogo (categoria o unidad) y devuelve su id.
 *
 * OJO: recibe la conexion de la transaccion y NO usa query(). Con query() esto
 * salia por otra conexion del pool, y como pop_products tiene FK a estas dos
 * tablas, el INSERT del producto deja un lock compartido sobre la fila padre
 * hasta el commit. La siguiente fila del archivo que repitiera esa categoria
 * pedia un lock exclusivo sobre la misma fila y se quedaba esperando a la
 * transaccion que la estaba llamando: el import se bloqueaba contra si mismo
 * hasta el lock wait timeout. Se busca primero con SELECT para no pedir el
 * lock exclusivo cuando la fila ya existe, que es el caso habitual.
 */
async function resolverCatalogo(
  conn: any,
  table: "pop_categories" | "pop_uoms",
  name: string,
  maxLen: number,
  cids: number,
  userId: any,
  allowsDecimal: boolean | null,
): Promise<number | null> {
  const limpio = name.slice(0, maxLen);

  const found = await conn.execute(
    `SELECT id FROM ${table} WHERE name = ? AND cids = ? LIMIT 1`,
    [limpio, cids],
  );
  if (found[0].length > 0) return found[0][0].id;

  const columns =
    allowsDecimal === null
      ? "(name, cids, created_by_user_id) VALUES (?, ?, ?)"
      : "(name, allows_decimal, cids, created_by_user_id) VALUES (?, ?, ?, ?)";
  const params =
    allowsDecimal === null
      ? [limpio, cids, userId]
      : [limpio, allowsDecimal ? 1 : 0, cids, userId];

  // ON DUPLICATE KEY cubre la carrera con otra importacion simultanea.
  const res = await conn.execute(
    `INSERT INTO ${table} ${columns} ON DUPLICATE KEY UPDATE name = name`,
    params,
  );
  const id = res[0]?.insertId;
  if (id) return id;

  const retry = await conn.execute(
    `SELECT id FROM ${table} WHERE name = ? AND cids = ? LIMIT 1`,
    [limpio, cids],
  );
  return retry[0][0]?.id || null;
}

export async function POST(request: NextRequest) {
  let conn: any;
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const rows: ImportRow[] = Array.isArray(body?.rows) ? body.rows : [];

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "No hay filas para importar" },
        { status: 400 },
      );
    }

    if (rows.length > MAX_ROWS) {
      return NextResponse.json(
        { error: `Máximo ${MAX_ROWS} filas por importación` },
        { status: 400 },
      );
    }

    const cidsRaw = resolveMaterialPopCids(auth.payload);
    const cids = cidsRaw ?? 9;
    const userId = auth.payload?.uid || auth.payload?.id || null;
    const userName = auth.payload?.name || "Usuario";

    const creados: string[] = [];
    const actualizados: string[] = [];
    const errores: Array<{ fila: number; error: string }> = [];

    conn = await getConnection();
    await conn.beginTransaction();

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const filaNum = i + 2; // +2: fila 1 es el encabezado
      try {
        const name = truncar(row?.name, 255);
        if (!name) {
          errores.push({ fila: filaNum, error: "Falta el nombre" });
          continue;
        }

        const categoryId = row?.category
          ? await resolverCatalogo(conn, "pop_categories", String(row.category), 100, cids, userId, null)
          : null;
        const uomId = row?.uom
          ? await resolverCatalogo(conn, "pop_uoms", String(row.uom), 50, cids, userId, row.allowsDecimal === true)
          : null;

        let sku = truncar(row?.sku, 50);
        let productId: number | null = null;

        if (sku) {
          const found = await conn.execute(
            "SELECT id, name FROM pop_products WHERE code = ? AND cids = ? LIMIT 1",
            [sku, cids],
          );
          if (found[0].length > 0) {
            productId = found[0][0].id;
          }
        } else {
          // Sin SKU en la fila: se busca por nombre antes de generar uno nuevo,
          // para no duplicar el producto si se reimporta el mismo archivo.
          const byName = await conn.execute(
            "SELECT id, code FROM pop_products WHERE name = ? AND cids = ? LIMIT 1",
            [name, cids],
          );
          if (byName[0].length > 0) {
            productId = byName[0][0].id;
            sku = byName[0][0].code;
          }
        }

        const stockOffice = Number(row?.stockOffice) || 0;
        const stockWarehouse = Number(row?.stockWarehouse) || 0;
        let allowsDecimal = false;
        if (uomId) {
          const uomCheck = await conn.execute(
            "SELECT allows_decimal FROM pop_uoms WHERE id = ? AND cids = ? LIMIT 1",
            [uomId, cids],
          );
          allowsDecimal = Number(uomCheck[0][0]?.allows_decimal) === 1;
        }
        const officeError = validateNonNegativeQuantity(stockOffice, allowsDecimal);
        const warehouseError = validateNonNegativeQuantity(stockWarehouse, allowsDecimal);
        if (officeError || warehouseError) {
          throw new Error(officeError ?? warehouseError ?? "Cantidad inválida");
        }

        if (productId) {
          // Actualizar producto existente
          await conn.execute(
            `UPDATE pop_products
             SET name = ?, category_id = COALESCE(?, category_id),
                 uom_id = COALESCE(?, uom_id),
                 brand = COALESCE(?, brand),
                 description = COALESCE(?, description),
                 updated_at = NOW()
             WHERE id = ?`,
            [
              name,
              categoryId,
              uomId,
              truncar(row?.brand, 100),
              truncar(row?.description, 2000),
              productId,
            ],
          );
          actualizados.push(sku || name);
        } else {
          // Crear producto nuevo
          sku = sku || (await generateSku(name, cids, undefined, conn));
          const insert = await conn.execute(
            `INSERT INTO pop_products
              (code, name, category_id, uom_id, brand, description, is_active, cids, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
              sku,
              name,
              categoryId,
              uomId,
              truncar(row?.brand, 100),
              truncar(row?.description, 2000),
              cids,
              userId,
            ],
          );
          productId = insert[0]?.insertId;
          creados.push(sku);
        }

        // El stock inicial representa la cantidad física indicada en el archivo,
        // no una suma. La diferencia queda auditada como ajuste inicial.
        for (const [location, desired] of [["office", stockOffice], ["warehouse", stockWarehouse]] as const) {
          const currentRes = await conn.execute(
            "SELECT quantity FROM pop_stock WHERE product_id = ? AND location = ? FOR UPDATE",
            [productId, location],
          );
          const current = Number(currentRes[0][0]?.quantity || 0);
          const delta = desired - current;
          if (delta === 0) continue;

          await conn.execute(
            `INSERT INTO pop_stock (product_id, location, quantity)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
            [productId, location, desired],
          );
          await conn.execute(
            `INSERT INTO pop_movements
              (type, product_id, location, quantity, reason_type, created_by_user_id, created_by_name, cids, movement_date, notes)
             VALUES ('adjustment', ?, ?, ?, 'ajuste_inicial', ?, ?, ?, CURDATE(), 'Importación Excel')`,
            [productId, location, Math.abs(delta), userId, userName, cids],
          );
        }
      } catch (rowError: any) {
        errores.push({ fila: filaNum, error: rowError.message });
      }
    }

    await conn.commit();

    return NextResponse.json({
      success: true,
      resumen: {
        creados: creados.length,
        actualizados: actualizados.length,
        errores: errores.length,
      },
      detalle: { creados, actualizados, errores },
    });
  } catch (error: any) {
    if (conn) await conn.rollback();
    console.error("Error importando material POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
