import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads", "banco-imagenes");

async function ensureUploadDir() {
  if (!existsSync(UPLOAD_DIR)) {
    await mkdir(UPLOAD_DIR, { recursive: true });
  }
}

// GET: List product images
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
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

    const countResult = await query(
      `SELECT COUNT(*) as total FROM product_images pi ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT pi.* FROM product_images pi ${where} ORDER BY pi.created_at DESC LIMIT ${limit} OFFSET ${offset}`,
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

// POST: Save a new product image
export async function POST(request: NextRequest) {
  try {
    await ensureUploadDir();

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

    const ext = image.name.split(".").pop() || "jpg";
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    const buffer = Buffer.from(await image.arrayBuffer());
    await writeFile(filePath, buffer);
    const imagePath = `/uploads/banco-imagenes/${filename}`;

    await query(
      `INSERT INTO product_images (odoo_product_id, product_code, model, brand, category, price, image_path, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        odoo_product_id || null,
        product_code || null,
        model || null,
        brand || null,
        category || null,
        price ? parseFloat(price) : 0,
        imagePath,
        created_by,
      ]
    );

    return NextResponse.json({ success: true, image_path: imagePath }, { status: 201 });
  } catch (error: any) {
    console.error("Error POST banco-imagenes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: Remove a product image
export async function DELETE(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "Falta ID" }, { status: 400 });
    }

    const existing = await query(`SELECT image_path FROM product_images WHERE id = ?`, [id]);
    const row = existing.rows?.[0];
    if (row?.image_path) {
      const filePath = path.join(process.cwd(), "public", row.image_path);
      if (existsSync(filePath)) await unlink(filePath);
    }

    await query(`DELETE FROM product_images WHERE id = ?`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error DELETE banco-imagenes:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
