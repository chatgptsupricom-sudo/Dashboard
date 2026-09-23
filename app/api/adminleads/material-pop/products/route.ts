import { query, getConnection } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  requireLecturaMaterialPop,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { generateSku } from "@/lib/adminleads/material-pop/sku";
import { NextRequest, NextResponse } from "next/server";
import { validateNonNegativeQuantity } from "@/lib/adminleads/material-pop/validation";

export const dynamic = "force-dynamic";

const MAX = {
  code: 50,
  name: 255,
  brand: 100,
  description: 2000,
};

function truncar(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function GET(request: NextRequest) {
  try {
    // Leer el catálogo tambien lo necesita el vendedor para armar su solicitud.
    // Crear, editar y borrar siguen siendo solo del adminLeads.
    const auth = await requireLecturaMaterialPop(request);
    if (auth.error) return auth.error;

    const cids = resolveMaterialPopCids(auth.payload);
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") || "").trim();
    const categoryId = searchParams.get("categoryId");
    const onlyAlerts = searchParams.get("alerts") === "1";

    const params: any[] = [];
    let where = "WHERE p.is_active = 1";

    if (cids !== null) {
      where += " AND p.cids = ?";
      params.push(cids);
    }

    if (q) {
      where += " AND (p.name LIKE ? OR p.code LIKE ? OR p.brand LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (categoryId && /^\d+$/.test(categoryId)) {
      where += " AND p.category_id = ?";
      params.push(Number(categoryId));
    }

    const res = await query(
      `SELECT
        p.*,
        c.name as category_name,
         u.name as uom_name,
         COALESCE(u.allows_decimal, 0) as uom_allows_decimal,
        p.image_id,
        COALESCE(SUM(CASE WHEN s.location = 'office' THEN s.quantity ELSE 0 END), 0) as stock_office,
        COALESCE(SUM(CASE WHEN s.location = 'warehouse' THEN s.quantity ELSE 0 END), 0) as stock_warehouse,
        COALESCE(SUM(s.quantity), 0) as stock_total
       FROM pop_products p
       LEFT JOIN pop_categories c ON p.category_id = c.id
       LEFT JOIN pop_uoms u ON p.uom_id = u.id
       LEFT JOIN pop_stock s ON p.id = s.product_id
       ${where}
       GROUP BY p.id
       ORDER BY p.name ASC`,
      params,
    );

    const products = res.rows.map((row: any) => ({
      ...row,
      stock_office: Number(row.stock_office),
      stock_warehouse: Number(row.stock_warehouse),
      stock_total: Number(row.stock_total),
      // Agotado = sin nada en ninguna de las dos ubicaciones. Con `||` un
      // producto con 3000 en almacen y 0 en oficina salia como agotado, que es
      // el caso normal: casi todo el material POP se guarda en almacen y se
      // pasa a oficina cuando hace falta.
      has_alert: Number(row.stock_total) <= 0,
      image_url: row.image_id
        ? `/api/adminleads/material-pop/images/${row.image_id}`
        : null,
    }));

    const filtered = onlyAlerts
      ? products.filter((p: any) => p.has_alert)
      : products;

    return NextResponse.json({ success: true, products: filtered });
  } catch (error: any) {
    console.error("Error listando productos POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let conn: any;
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const name = truncar(body?.name, MAX.name);

    if (!name) {
      return NextResponse.json(
        { error: "El nombre del producto es obligatorio" },
        { status: 400 },
      );
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const userId = auth.payload?.uid || auth.payload?.id || null;
    const userName = auth.payload?.name || "Usuario";

    // Categoría y unidad de medida
    let categoryId: number | null = null;
    let uomId: number | null = null;

    if (body?.categoryId && Number.isFinite(Number(body.categoryId))) {
      categoryId = Number(body.categoryId);
    } else if (body?.categoryName) {
      const catRes = await query(
        `INSERT INTO pop_categories (name, cids, created_by_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = name`,
        [truncar(body.categoryName, 100), cids, userId],
      );
      categoryId = (catRes.rows as any)?.insertId;
      if (!categoryId) {
        const existing = await query(
          "SELECT id FROM pop_categories WHERE name = ? AND cids = ? LIMIT 1",
          [truncar(body.categoryName, 100), cids],
        );
        categoryId = existing.rows[0]?.id || null;
      }
    }

    if (body?.uomId && Number.isFinite(Number(body.uomId))) {
      uomId = Number(body.uomId);
    } else if (body?.uomName) {
      const uomRes = await query(
        `INSERT INTO pop_uoms (name, allows_decimal, cids, created_by_user_id)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE name = name`,
        [truncar(body.uomName, 50), body?.uomAllowsDecimal ? 1 : 0, cids, userId],
      );
      uomId = (uomRes.rows as any)?.insertId;
      if (!uomId) {
        const existing = await query(
          "SELECT id FROM pop_uoms WHERE name = ? AND cids = ? LIMIT 1",
          [truncar(body.uomName, 50), cids],
        );
        uomId = existing.rows[0]?.id || null;
      }
    }

    let allowsDecimal = false;
    if (uomId) {
      const uomRes = await query(
        "SELECT allows_decimal FROM pop_uoms WHERE id = ? AND cids = ? LIMIT 1",
        [uomId, cids],
      );
      if (uomRes.rows.length === 0) {
        return NextResponse.json({ error: "Unidad de medida no encontrada" }, { status: 400 });
      }
      allowsDecimal = Number(uomRes.rows[0].allows_decimal) === 1;
    }

    const initialOffice = Number(body?.initialStockOffice) || 0;
    const initialWarehouse = Number(body?.initialStockWarehouse) || 0;
    const officeError = validateNonNegativeQuantity(initialOffice, allowsDecimal);
    const warehouseError = validateNonNegativeQuantity(initialWarehouse, allowsDecimal);
    if (officeError || warehouseError) {
      return NextResponse.json({ error: officeError || warehouseError }, { status: 400 });
    }

    const sku = await generateSku(name, cids ?? 9, body?.abbreviation);

    conn = await getConnection();
    await conn.beginTransaction();

    const productRes = await conn.execute(
      `INSERT INTO pop_products
        (code, name, category_id, uom_id, brand, description, image_id, is_active, cids, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sku,
        name,
        categoryId,
        uomId,
        truncar(body?.brand, MAX.brand),
        truncar(body?.description, MAX.description),
        body?.imageId ? Number(body.imageId) : null,
        1,
        cids,
        userId,
      ],
    );

    const productId = (productRes as any)?.[0]?.insertId;

    // Stock inicial
    if (initialOffice > 0) {
      await conn.execute(
        `INSERT INTO pop_stock (product_id, location, quantity) VALUES (?, 'office', ?)`,
        [productId, initialOffice],
      );
      await conn.execute(
        `INSERT INTO pop_movements
          (type, product_id, location, quantity, reason_type, reason_custom, created_by_user_id, created_by_name, cids, movement_date, notes)
         VALUES (?, ?, 'office', ?, 'ajuste_inicial', NULL, ?, ?, ?, CURDATE(), ?)`,
        [
           "adjustment",
          productId,
          initialOffice,
          userId,
          userName,
          cids,
          "Stock inicial",
        ],
      );
    }

    if (initialWarehouse > 0) {
      await conn.execute(
        `INSERT INTO pop_stock (product_id, location, quantity) VALUES (?, 'warehouse', ?)`,
        [productId, initialWarehouse],
      );
      await conn.execute(
        `INSERT INTO pop_movements
          (type, product_id, location, quantity, reason_type, reason_custom, created_by_user_id, created_by_name, cids, movement_date, notes)
         VALUES (?, ?, 'warehouse', ?, 'ajuste_inicial', NULL, ?, ?, ?, CURDATE(), ?)`,
        [
           "adjustment",
          productId,
          initialWarehouse,
          userId,
          userName,
          cids,
          "Stock inicial",
        ],
      );
    }

    await conn.commit();

    return NextResponse.json({
      success: true,
      product: {
        id: productId,
        code: sku,
        name,
        categoryId,
        uomId,
        stock_office: initialOffice,
        stock_warehouse: initialWarehouse,
        stock_total: initialOffice + initialWarehouse,
      },
    });
  } catch (error: any) {
    if (conn) await conn.rollback();
    console.error("Error creando producto POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

export async function PUT(request: NextRequest) {
  let conn: any;
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const productId = Number(body?.id);

    if (!Number.isFinite(productId)) {
      return NextResponse.json(
        { error: "ID de producto inválido" },
        { status: 400 },
      );
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const userId = auth.payload?.uid || auth.payload?.id || null;

    // Verificar que el producto existe y pertenece al cids
    const existing = await query(
      "SELECT id FROM pop_products WHERE id = ? AND (cids = ? OR ? IS NULL) LIMIT 1",
      [productId, cids, cids],
    );

    if (existing.rows.length === 0) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 },
      );
    }

    const name = truncar(body?.name, MAX.name);
    if (!name) {
      return NextResponse.json(
        { error: "El nombre del producto es obligatorio" },
        { status: 400 },
      );
    }

    let categoryId: number | null = body?.categoryId
      ? Number(body.categoryId)
      : null;
    let uomId: number | null = body?.uomId ? Number(body.uomId) : null;

    // Crear categoría/uom al vuelo si vienen como texto
    if (!categoryId && body?.categoryName) {
      const catRes = await query(
        `INSERT INTO pop_categories (name, cids, created_by_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = name`,
        [truncar(body.categoryName, 100), cids, userId],
      );
      categoryId = (catRes.rows as any)?.insertId;
      if (!categoryId) {
        const found = await query(
          "SELECT id FROM pop_categories WHERE name = ? AND cids = ? LIMIT 1",
          [truncar(body.categoryName, 100), cids],
        );
        categoryId = found.rows[0]?.id || null;
      }
    }

    if (!uomId && body?.uomName) {
      const uomRes = await query(
        `INSERT INTO pop_uoms (name, cids, created_by_user_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE name = name`,
        [truncar(body.uomName, 50), cids, userId],
      );
      uomId = (uomRes.rows as any)?.insertId;
      if (!uomId) {
        const found = await query(
          "SELECT id FROM pop_uoms WHERE name = ? AND cids = ? LIMIT 1",
          [truncar(body.uomName, 50), cids],
        );
        uomId = found.rows[0]?.id || null;
      }
    }

    conn = await getConnection();
    await conn.beginTransaction();

    await conn.execute(
      `UPDATE pop_products
       SET name = ?, category_id = ?, uom_id = ?, brand = ?, description = ?, image_id = ?, updated_at = NOW()
       WHERE id = ?`,
      [
        name,
        categoryId,
        uomId,
        truncar(body?.brand, MAX.brand),
        truncar(body?.description, MAX.description),
        body?.imageId ? Number(body.imageId) : null,
        productId,
      ],
    );

    await conn.commit();

    return NextResponse.json({ success: true, productId });
  } catch (error: any) {
    if (conn) await conn.rollback();
    console.error("Error actualizando producto POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const productId = Number(searchParams.get("id"));

    if (!Number.isFinite(productId)) {
      return NextResponse.json(
        { error: "ID de producto inválido" },
        { status: 400 },
      );
    }

    const cids = resolveMaterialPopCids(auth.payload);

    // Soft delete: desactivar en lugar de borrar para no perder trazabilidad
    await query(
      "UPDATE pop_products SET is_active = 0, updated_at = NOW() WHERE id = ? AND (cids = ? OR ? IS NULL)",
      [productId, cids, cids],
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error desactivando producto POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
