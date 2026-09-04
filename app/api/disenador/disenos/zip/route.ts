import { query } from "@/lib/db";
import JSZip from "jszip";
import { NextRequest, NextResponse } from "next/server";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "application/pdf": "pdf",
};

function sanitize(name: string) {
  return (name || "diseno").replace(/[^\w\-. ]+/g, "_").trim().slice(0, 120) || "diseno";
}

// POST { ids: number[] } -> devuelve un .zip con los diseños seleccionados.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const ids = (Array.isArray(body.ids) ? body.ids : [])
      .map((x: any) => Number(x))
      .filter((n: number) => Number.isFinite(n) && n > 0);

    if (ids.length === 0) {
      return NextResponse.json({ error: "Sin diseños seleccionados" }, { status: 400 });
    }

    const placeholders = ids.map(() => "?").join(",");
    const result = await query(
      `SELECT id, title, folder, image_data, image_mime
       FROM designer_designs WHERE id IN (${placeholders})`,
      ids
    );

    const zip = new JSZip();
    const used = new Set<string>();

    for (const row of result.rows || []) {
      if (!row.image_data) continue;
      const buf = Buffer.isBuffer(row.image_data)
        ? row.image_data
        : Buffer.from(row.image_data);
      const ext = EXT_BY_MIME[row.image_mime] || "png";
      const dir = row.folder ? `${sanitize(row.folder)}/` : "";
      let base = `${dir}${sanitize(row.title)}`;
      let name = `${base}.${ext}`;
      let i = 2;
      while (used.has(name)) {
        name = `${base} (${i}).${ext}`;
        i++;
      }
      used.add(name);
      zip.file(name, buf);
    }

    const blob = await zip.generateAsync({ type: "nodebuffer" });

    return new Response(new Uint8Array(blob), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="disenos-${Date.now()}.zip"`,
      },
    });
  } catch (error: any) {
    console.error("POST /api/disenador/disenos/zip:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
