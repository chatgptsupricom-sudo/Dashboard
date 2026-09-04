import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { ensureDesignerDesignsTable } from "@/lib/designerDesigns";
import { NextRequest, NextResponse } from "next/server";

const ROLES = ["diseñador"]; // superadmin siempre pasa via requireRoles

// POST: descarga un resultado de KIE y lo guarda como diseño permanente en el
// catálogo (designer_designs). Solo se acepta una resultUrl que ya esté
// registrada en el job (evita usar este endpoint para descargar cualquier URL
// arbitraria — protección básica contra SSRF).
export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES);
  if (auth.error) return auth.error;

  try {
    const body = await request.json();
    const jobId = Number(body.jobId);
    const resultUrl = String(body.resultUrl || "");
    const title = String(body.title || "Diseño IA").slice(0, 255);
    const folder = (body.folder ? String(body.folder) : "IA").trim().slice(0, 255) || "IA";
    const created_by = String(body.created_by || "");

    if (!jobId || !resultUrl) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }
    if (!created_by) {
      return NextResponse.json({ error: "created_by es obligatorio" }, { status: 400 });
    }

    const jobResult = await query(`SELECT result_urls FROM designer_ai_jobs WHERE id = ?`, [jobId]);
    const job = jobResult.rows?.[0];
    const allowedUrls: string[] = job?.result_urls ? JSON.parse(job.result_urls) : [];
    if (!allowedUrls.includes(resultUrl)) {
      return NextResponse.json({ error: "Esa URL no pertenece a este resultado" }, { status: 400 });
    }

    const imgRes = await fetch(resultUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: `No se pudo descargar el resultado (HTTP ${imgRes.status})` }, { status: 502 });
    }
    const buffer = Buffer.from(await imgRes.arrayBuffer());
    const mime = imgRes.headers.get("content-type") || "image/png";

    await ensureDesignerDesignsTable();

    const insertResult = await query(
      `INSERT INTO designer_designs (title, folder, image_data, image_mime, created_by) VALUES (?, ?, ?, ?, ?)`,
      [title, folder, buffer, mime, created_by]
    );
    const newId = (insertResult.rows as any)?.insertId;

    return NextResponse.json(
      {
        success: true,
        design: { id: newId, title, folder, image_path: `/api/disenador/disenos/image/${newId}` },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST /api/disenador/ia-imagen/guardar:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
