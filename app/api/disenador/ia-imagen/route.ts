import { query } from "@/lib/db";
import { kieCreateTask } from "@/lib/kie";
import { NextRequest, NextResponse } from "next/server";

// Editor con IA (Seedream vía KIE). Cada job guarda su propia imagen fuente en
// MySQL para poder exponerla en una URL pública propia — KIE la descarga desde
// ahí, así no dependemos de su API de upload ni de que el diseño ya esté en el
// catálogo. Solo funciona cuando esta app corre en un dominio públicamente
// accesible (test/producción); no sirve desde un localhost sin túnel.
async function ensureTable() {
  await query(`
    CREATE TABLE IF NOT EXISTS designer_ai_jobs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      created_by VARCHAR(255) NOT NULL DEFAULT '',
      prompt TEXT NOT NULL,
      model VARCHAR(120) NOT NULL,
      resolution VARCHAR(10) NOT NULL DEFAULT '1K',
      source_image_data LONGBLOB NULL,
      source_image_mime VARCHAR(100) NULL,
      kie_task_id VARCHAR(120) NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      result_urls TEXT NULL,
      fail_msg TEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_created_by (created_by),
      INDEX idx_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
}

const DEFAULT_MODEL = process.env.KIE_SEEDREAM_MODEL || "seedream/5-pro-image-to-image";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

// GET: historial reciente de generaciones (para el panel "Recientes").
export async function GET(request: NextRequest) {
  try {
    await ensureTable();
    const url = new URL(request.url);
    const createdBy = url.searchParams.get("created_by") || "";
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "12", 10)));

    let where = "WHERE 1=1";
    const params: any[] = [];
    if (createdBy) {
      where += " AND created_by = ?";
      params.push(createdBy);
    }

    const result = await query(
      `SELECT id, prompt, model, resolution, status, result_urls, fail_msg, created_by, created_at,
              CONCAT('/api/disenador/ia-imagen/source/', id) AS source_url
       FROM designer_ai_jobs ${where}
       ORDER BY created_at DESC LIMIT ${limit}`,
      params
    );

    const jobs = (result.rows || []).map((r: any) => ({
      ...r,
      result_urls: r.result_urls ? JSON.parse(r.result_urls) : [],
    }));

    return NextResponse.json({ success: true, jobs });
  } catch (error: any) {
    console.error("GET /api/disenador/ia-imagen:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: crea un job de edición con IA.
// FormData:
//   created_by, prompt, resolution ("1K"|"2K"), variations (1-4)
//   image             -> File nueva a editar, ó
//   source_design_id  -> id de un diseño ya guardado en el catálogo
export async function POST(request: NextRequest) {
  try {
    await ensureTable();
    const formData = await request.formData();
    const created_by = (formData.get("created_by") as string) || "";
    const prompt = ((formData.get("prompt") as string) || "").trim();
    const resolution = (formData.get("resolution") as string) === "2K" ? "2K" : "1K";
    const variations = Math.min(4, Math.max(1, parseInt((formData.get("variations") as string) || "1", 10)));
    const image = formData.get("image") as File | null;
    const sourceDesignId = formData.get("source_design_id") as string | null;

    if (!created_by) {
      return NextResponse.json({ error: "created_by es obligatorio" }, { status: 400 });
    }
    if (prompt.length < 3) {
      return NextResponse.json({ error: "Describe el cambio que quieres en el prompt" }, { status: 400 });
    }

    let buffer: Buffer;
    let mime: string;

    if (image && image.size > 0) {
      buffer = Buffer.from(await image.arrayBuffer());
      mime = image.type || "image/png";
    } else if (sourceDesignId) {
      const r = await query(`SELECT image_data, image_mime FROM designer_designs WHERE id = ?`, [sourceDesignId]);
      const row = r.rows?.[0];
      if (!row?.image_data) {
        return NextResponse.json({ error: "El diseño de origen no existe" }, { status: 404 });
      }
      buffer = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
      mime = row.image_mime || "image/png";
    } else {
      return NextResponse.json({ error: "Falta la imagen a editar" }, { status: 400 });
    }

    // 1) Insertamos el job ya con la imagen fuente, para poder construir su URL pública.
    const insertResult = await query(
      `INSERT INTO designer_ai_jobs (created_by, prompt, model, resolution, source_image_data, source_image_mime, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [created_by, prompt, DEFAULT_MODEL, resolution, buffer, mime]
    );
    const jobId = (insertResult.rows as any)?.insertId;

    // 2) La fuente que KIE va a descargar es esta misma app (mismo host que sirvió la request).
    // La URL lleva extensión porque KIE valida el tipo de archivo por la URL, no solo
    // por el Content-Type de la respuesta (sin extensión responde "File type not supported").
    const origin = new URL(request.url).origin;
    const ext = EXT_BY_MIME[mime] || "png";
    const sourceUrl = `${origin}/api/disenador/ia-imagen/source/${jobId}.${ext}`;

    // 3) Creamos la tarea en KIE.
    try {
      const taskId = await kieCreateTask({
        prompt,
        image_urls: [sourceUrl],
        image_resolution: resolution,
        max_images: variations,
      });
      await query(`UPDATE designer_ai_jobs SET kie_task_id = ?, status = 'processing' WHERE id = ?`, [taskId, jobId]);
      return NextResponse.json({ success: true, jobId }, { status: 201 });
    } catch (kieError: any) {
      await query(`UPDATE designer_ai_jobs SET status = 'fail', fail_msg = ? WHERE id = ?`, [kieError.message, jobId]);
      // 200 a propósito: un 5xx aquí hace que el proxy (Easypanel) reemplace el
      // cuerpo con su página genérica de error en vez de dejar pasar este JSON.
      return NextResponse.json({ success: false, error: kieError.message, jobId }, { status: 200 });
    }
  } catch (error: any) {
    console.error("POST /api/disenador/ia-imagen:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
