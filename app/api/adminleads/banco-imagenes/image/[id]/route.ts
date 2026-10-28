import { query } from "@/lib/db";
import { ROL_BI } from "@/lib/auth/inteligenciaNegocio";
import { requireRoles } from "@/lib/auth/roles";
import { ROL_MARKETING_ELECTRO } from "@/lib/auth/marketingElectro";
import { filtroBancoGerente } from "@/lib/gerente-marca/banco";
import { ROL_GERENTE_MARCA } from "@/lib/gerente-marca/tipos";
import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// Los mismos lectores que la galería (route.ts): sin BI aquí, su Banco de
// Flyers listaba los flyers pero las imágenes daban 403.
const ROLES_LECTURA = ["adminleads", "gerente de operaciones", "vendedor", "seller", "diseñador", ROL_BI, ROL_GERENTE_MARCA, ROL_MARKETING_ELECTRO];

// SVG queda fuera a propósito: a diferencia de JPEG/PNG/WebP/GIF, un SVG
// puede llevar <script> embebido que el navegador ejecuta si alguien abre
// esta URL directamente (no via <img>). No hay forma segura de "servir" un
// SVG subido por un tercero sin sanitizarlo primero.
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};
const MIME_PERMITIDOS = new Set(Object.values(MIME_BY_EXT));

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ROLES_LECTURA);
  if (auth.error) return auth.error;

  try {
    await ensureImageColumns();
    const { id } = await params;

    const deSusMarcas = await filtroBancoGerente(auth.payload);
    const result = await query(
      `SELECT image_data, image_mime, image_path FROM product_images pi
        WHERE id = ?${deSusMarcas ? ` AND ${deSusMarcas.sql}` : ""}`,
      [id, ...(deSusMarcas?.params ?? [])]
    );
    const row = result.rows?.[0];

    if (!row) {
      return new Response("Not found", { status: 404 });
    }

    // Fast path: image already stored in MySQL
    if (row.image_data) {
      const buf = Buffer.isBuffer(row.image_data) ? row.image_data : Buffer.from(row.image_data);
      const mime = MIME_PERMITIDOS.has(row.image_mime) ? row.image_mime : "image/jpeg";
      return new Response(new Uint8Array(buf), {
        headers: {
          "Content-Type": mime,
          "X-Content-Type-Options": "nosniff",
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
        const mime = MIME_BY_EXT[ext];
        if (!mime) {
          // Extension fuera de la whitelist (ej. .svg legacy): no se sirve.
          return new Response("Not found", { status: 404 });
        }
        try {
          await query(`UPDATE product_images SET image_data = ?, image_mime = ? WHERE id = ?`, [buf, mime, id]);
        } catch (e: any) {
          console.error("legacy image migration failed:", e.message);
        }
        return new Response(new Uint8Array(buf), {
          headers: {
            "Content-Type": mime,
            "X-Content-Type-Options": "nosniff",
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
