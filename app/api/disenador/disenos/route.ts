import { query } from "@/lib/db";
import { ensureDesignerDesignsTable } from "@/lib/designerDesigns";
import { NextRequest, NextResponse } from "next/server";

// Catálogo de diseños del Diseñador. Las imágenes viven en MySQL (LONGBLOB) para
// que sobrevivan a los deploys, igual que el Banco de Flyers (product_images).
const ensureTable = ensureDesignerDesignsTable;

// GET: lista paginada del catálogo (sin el binario, que es pesado).
export async function GET(request: NextRequest) {
  try {
    await ensureTable();

    const url = new URL(request.url);
    const search = url.searchParams.get("search") || "";
    const folder = url.searchParams.get("folder") || "";
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(60, Math.max(1, parseInt(url.searchParams.get("limit") || "24", 10)));
    const offset = (page - 1) * limit;

    let where = "WHERE 1=1";
    const params: any[] = [];

    if (search) {
      where += " AND (d.title LIKE ? OR d.folder LIKE ? OR d.created_by LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    if (folder) {
      where += " AND d.folder = ?";
      params.push(folder);
    }

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM designer_designs d ${where}`,
      params
    );
    const total = countResult.rows[0]?.total || 0;

    const result = await query(
      `SELECT d.id, d.title, d.folder, d.created_by, d.created_at,
              CONCAT('/api/disenador/disenos/image/', d.id) AS image_path
       FROM designer_designs d ${where}
       ORDER BY d.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    const foldersResult = await query(
      `SELECT DISTINCT folder FROM designer_designs
       WHERE folder IS NOT NULL AND folder <> '' ORDER BY folder ASC`
    );
    const folders = (foldersResult.rows || []).map((r: any) => r.folder);

    return NextResponse.json({
      success: true,
      designs: result.rows,
      folders,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("GET /api/disenador/disenos:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: sube uno o varios diseños en una sola petición (carga masiva por carpeta).
// FormData:
//   images    -> uno o más File
//   titles    -> JSON string[] alineado por índice con images
//   folders   -> JSON string[] alineado por índice con images
//   created_by
export async function POST(request: NextRequest) {
  try {
    await ensureTable();

    const formData = await request.formData();
    const files = formData.getAll("images").filter((f): f is File => f instanceof File && f.size > 0);
    const created_by = (formData.get("created_by") as string | null) || "";

    if (files.length === 0) {
      return NextResponse.json({ error: "No se recibió ninguna imagen" }, { status: 400 });
    }
    if (!created_by) {
      return NextResponse.json({ error: "created_by es obligatorio" }, { status: 400 });
    }

    let titles: string[] = [];
    let folders: string[] = [];
    try {
      titles = JSON.parse((formData.get("titles") as string) || "[]");
    } catch { titles = []; }
    try {
      folders = JSON.parse((formData.get("folders") as string) || "[]");
    } catch { folders = []; }

    let inserted = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const buffer = Buffer.from(await file.arrayBuffer());
      const mime = file.type || "image/png";
      const title = (titles[i] || file.name.replace(/\.[^.]+$/, "") || "Sin título").slice(0, 255);
      const folder = (folders[i] || "").slice(0, 255) || null;

      await query(
        `INSERT INTO designer_designs (title, folder, image_data, image_mime, created_by)
         VALUES (?, ?, ?, ?, ?)`,
        [title, folder, buffer, mime, created_by]
      );
      inserted++;
    }

    return NextResponse.json({ success: true, inserted }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/disenador/disenos:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: renombrar / recategorizar un diseño. JSON { id, title?, folder? }
export async function PATCH(request: NextRequest) {
  try {
    await ensureTable();
    const body = await request.json();
    const id = Number(body.id);
    if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

    const sets: string[] = [];
    const params: any[] = [];
    if (typeof body.title === "string") {
      sets.push("title = ?");
      params.push(body.title.slice(0, 255));
    }
    if (typeof body.folder === "string") {
      sets.push("folder = ?");
      params.push(body.folder.trim().slice(0, 255) || null);
    }
    if (sets.length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }
    params.push(id);
    await query(`UPDATE designer_designs SET ${sets.join(", ")} WHERE id = ?`, params);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("PATCH /api/disenador/disenos:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: ?id=1  ó  ?ids=1,2,3
export async function DELETE(request: NextRequest) {
  try {
    await ensureTable();
    const url = new URL(request.url);
    const single = url.searchParams.get("id");
    const multi = url.searchParams.get("ids");

    const ids = (multi ? multi.split(",") : single ? [single] : [])
      .map((x) => Number(x))
      .filter((n) => Number.isFinite(n) && n > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: "Falta id" }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    await query(`DELETE FROM designer_designs WHERE id IN (${placeholders})`, ids);
    return NextResponse.json({ success: true, deleted: ids.length });
  } catch (error: any) {
    console.error("DELETE /api/disenador/disenos:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
