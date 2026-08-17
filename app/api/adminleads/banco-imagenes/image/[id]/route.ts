import { query } from "@/lib/db";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

async function ensureImageColumns() {
  try {
    await query(`ALTER TABLE product_images ADD COLUMN image_data LONGBLOB NULL`);
  } catch { /* already exists */ }
  try {
    await query(`ALTER TABLE product_images ADD COLUMN image_mime VARCHAR(100) NULL`);
  } catch { /* already exists */ }
}

// GET: Serve the image binary for a product image id.
// Self-migrates legacy disk files (public/uploads/banco-imagenes/*) into MySQL on first access.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await ensureImageColumns();
    const { id } = await params;

    const result = await query(
      `SELECT image_data, image_mime, image_path FROM product_images WHERE id = ?`,
      [id]
    );
    const row = result.rows?.[0];

    if (!row) {
      return new Response("Not found", { status: 404 });
    }

    // Fast path: image already stored in MySQL
    if (row.image_data) {
      const buf = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": row.image_mime || "image/jpeg",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }

    // Legacy path: migrate the disk file into MySQL once, then serve
    if (row.image_path && typeof row.image_path === "string" && row.image_path.startsWith("/uploads/")) {
      const filePath = path.join(process.cwd(), "public", row.image_path);
      if (existsSync(filePath)) {
        const buf = await readFile(filePath);
        const ext = row.image_path.split(".").pop()?.toLowerCase() || "jpg";
        const mime = MIME_BY_EXT[ext] || "image/jpeg";
        try {
          await query(`UPDATE product_images SET image_data = ?, image_mime = ? WHERE id = ?`, [buf, mime, id]);
        } catch (e: any) {
          console.error("legacy image migration failed:", e.message);
        }
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      }
    }

    return new Response("Not found", { status: 404 });
  } catch (error: any) {
    console.error("GET image error:", error.message);
    return new Response("Error", { status: 500 });
  }
}
