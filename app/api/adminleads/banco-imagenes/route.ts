import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Ensure the new image storage columns exist (images live in MySQL so they survive deploys)
async function ensureImageColumns() {
  try {
    await query(`ALTER TABLE product_images ADD COLUMN image_data LONGBLOB NULL`);
  } catch (e: any) {
    if (!e.message?.includes("Duplicate column")) {
      console.error("ensureImageColumns(image_data):", e.message);
    }
  }
  try {
    await query(`ALTER TABLE product_images ADD COLUMN image_mime VARCHAR(100) NULL`);
  } catch (e: any) {
    if (!e.message?.includes("Duplicate column")) {
      console.error("ensureImageColumns(image_mime):", e.message);
    }
  }
}

// GET: List product images
export async function GET(request: NextRequest) {
  try {
    await ensureImageColumns();

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const category = url.searchParams.get("category") || "";
    const page = parseInt(url.searchParams.get("page") || "1", 10);
    const limit = parseInt(url.searchParams.get("limit") || "24", 10);
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      where += " AND (pi.model LIKE ? OR pi.brand LIKE ? OR pi.product_code LIKE ? OR pi.category LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    if (category) {
      where += " AND pi.category = ?";
      params.push(category);
    }

    const countResult = await query(
      `SELECT COUNT(*) as total FROM product_images pi ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    // Do NOT select image_data here (heavy). Point image_path to the serving endpoint.
    const result = await query(
      `SELECT pi.id, pi.odoo_product_id, pi.product_code, pi.model, pi.brand, pi.category, pi.price, pi.created_by, pi.created_at,
              CONCAT('/api/adminleads/banco-imagenes/image/', pi.id) AS image_path
       FROM product_images pi ${where} ORDER BY pi.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    return NextResponse.json({
      success: true,
      images: result.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error GET banco-imagenes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Save a new product image (stored in MySQL, survives deploys)
export async function POST(request: NextRequest) {
  try {
    await ensureImageColumns();

    const formData = await request.formData();
    const odoo_product_id = formData.get("odoo_product_id") as string | null;
    const product_code = formData.get("product_code") as string | null;
    const model = formData.get("model") as string | null;
    const brand = formData.get("brand") as string | null;
    const category = formData.get("category") as string | null;
    const price = formData.get("price") as string | null;
    const image = formData.get("image") as File | null;
    const created_by = formData.get("created_by") as string | null;

    if (!image || image.size === 0) {
      return NextResponse.json(
        { error: "La imagen es obligatoria" },
        { status: 400 }
      );
    }

    if (!created_by) {
      return NextResponse.json(
        { error: "created_by es obligatorio" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const mime = image.type || "image/jpeg";

    const insertResult = await query(
      `INSERT INTO product_images (odoo_product_id, product_code, model, brand, category, price, image_path, created_by, image_data, image_mime)
       VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?)`,
      [
        odoo_product_id || null,
        product_code || null,
        model || null,
        brand || null,
        category || null,
        price ? parseFloat(price) : 0,
        created_by,
        buffer,
        mime,
      ]
    );

    const newId = (insertResult.rows as any)?.insertId;
    const imagePath = `/api/adminleads/banco-imagenes/image/${newId}`;

    if (newId) {
      await query(`UPDATE product_images SET image_path = ? WHERE id = ?`, [imagePath, newId]);
    }

    return NextResponse.json({ success: true, image_path: imagePath }, { status: 201 });
  } catch (error: any) {
    console.error("Error POST banco-imagenes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove a product image (DB row only — no disk involved)
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta ID" }, { status: 400 });
    }

    await query(`DELETE FROM product_images WHERE id = ?`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error DELETE banco-imagenes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
