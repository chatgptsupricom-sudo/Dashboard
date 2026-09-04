import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

// Vendedores solo consultan (GET, desde /vendedores/banco-imagenes); subir y
// borrar es cosa de adminleads/gerente de operaciones (y superadmin, que
// siempre pasa via requireRoles).
//
// El diseñador tambien administra el banco completo: su pantalla
// /disenador/banco-imagenes reexporta la de adminleads, asi que necesita
// lectura y escritura. Sin el en estas listas la pantalla no cargaba nada.
const ROLES_LECTURA = ["adminleads", "gerente de operaciones", "vendedor", "seller", "diseñador"];
const ROLES_ESCRITURA = ["adminleads", "gerente de operaciones", "diseñador"];

// Tamano maximo por archivo.
const MAX_BYTES = 10 * 1024 * 1024;

// El cliente puede mentir en Content-Type (el input file lo toma del
// navegador, no del contenido real); sin esto, subir un archivo declarado
// "image/svg+xml" o "text/html" con <script> adentro y servirlo despues
// desde este mismo dominio es XSS almacenado. Se valida contra los magic
// bytes reales del buffer, igual que en
// app/api/servicio-tecnico/ticket/adjuntos/route.ts.
function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return "image/png";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return "image/gif";
  return null;
}

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
  const auth = await requireRoles(request, ROLES_LECTURA);
  if (auth.error) return auth.error;

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
  const auth = await requireRoles(request, ROLES_ESCRITURA);
  if (auth.error) return auth.error;

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

    if (image.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `La imagen supera el maximo de ${MAX_BYTES / 1024 / 1024} MB` },
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
    // Nunca image.type: eso lo declara el cliente y no dice nada del
    // contenido real del archivo.
    const mime = detectImageMime(buffer);
    if (!mime) {
      return NextResponse.json(
        { error: "El archivo no es una imagen valida (JPEG, PNG, WebP o GIF)" },
        { status: 400 }
      );
    }

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
  const auth = await requireRoles(request, ROLES_ESCRITURA);
  if (auth.error) return auth.error;

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
