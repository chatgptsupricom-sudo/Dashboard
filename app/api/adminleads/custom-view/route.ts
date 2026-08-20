import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { canUploadCustomPlan, canViewCustomPlan, getAuthUser } from "@/lib/auth/customView";
import { addHistory, ensureTables, getState, getView, VIEW_NAME } from "@/lib/customView/store";
import { buildInjection } from "@/lib/customView/runtime";

declare global { var io: any; }

export const dynamic = "force-dynamic";

const API_BASE = "/api/adminleads/custom-view";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

const PLACEHOLDER_HTML = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8f9fa;color:#64748b;}
.box{text-align:center}.icon{font-size:64px;margin-bottom:16px}.title{font-size:22px;font-weight:600;margin-bottom:8px;color:#1e293b}
p{font-size:14px}</style></head><body>
<div class="box"><div class="icon">&#128196;</div>
<div class="title">Sin plan de contenido</div>
<p>Sube un archivo HTML desde el panel para verlo aqui.</p></div>
</body></html>`;

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
};

/**
 * GET
 *  - (sin params)      HTML base + runtime de guardado. El runtime aplica el
 *                      overlay guardado encima, asi el merge con un HTML nuevo
 *                      ocurre siempre contra la base mas reciente.
 *  - ?mode=base        HTML base tal cual se subio, sin inyeccion.
 *  - ?mode=snapshot    ultimo HTML completo guardado (el panel tal como se ve).
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canViewCustomPlan(user)) {
      return new Response("No autorizado", { status: 401 });
    }

    await ensureTables();
    const mode = request.nextUrl.searchParams.get("mode");

    if (mode === "snapshot") {
      const state = await getState();
      const view = await getView();
      const html = state?.snapshot_html || view?.html_content || PLACEHOLDER_HTML;
      const download = request.nextUrl.searchParams.get("download") === "1";
      return new Response(html, {
        headers: download
          ? {
              ...HTML_HEADERS,
              "Content-Disposition": `attachment; filename="plan-de-contenido.html"`,
            }
          : HTML_HEADERS,
      });
    }

    const view = await getView();
    if (!view?.html_content) {
      return new Response(PLACEHOLDER_HTML, { headers: HTML_HEADERS });
    }

    if (mode === "base") {
      return new Response(view.html_content, { headers: HTML_HEADERS });
    }

    const state = await getState();
    const injection = buildInjection({
      api: API_BASE,
      socketUrl: SOCKET_URL,
      baseRevision: Number(view.base_revision) || 1,
      revision: Number(state?.revision) || 0,
      canEdit: true,
    });

    const html = view.html_content;
    const injected = html.includes("</body>")
      ? html.replace("</body>", injection + "</body>")
      : html + injection;

    return new Response(injected, { headers: HTML_HEADERS });
  } catch (error: any) {
    console.error("custom-view GET error:", error?.message);
    return new Response(
      `<!DOCTYPE html><html><body><h1>Error</h1><p>${String(error?.message || "")}</p></body></html>`,
      { status: 500, headers: HTML_HEADERS },
    );
  }
}

/**
 * POST — sube un HTML nuevo como base.
 *
 * No se borra el estado guardado: al subir la base sube `base_revision`, los
 * paneles recargan, el runtime reaplica el overlay sobre el HTML nuevo y
 * vuelve a guardar el resultado ya fusionado.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!canUploadCustomPlan(user)) {
      return NextResponse.json({ success: false, error: "No autorizado" }, { status: 401 });
    }

    await ensureTables();

    const formData = await request.formData();
    const file = formData.get("html") as File | null;
    if (!file) {
      return NextResponse.json({ success: false, error: "No se recibio archivo" }, { status: 400 });
    }

    const content = await file.text();
    const head = content.trim().slice(0, 200).toLowerCase();
    if (!head.startsWith("<!doctype") && !head.startsWith("<html")) {
      return NextResponse.json(
        { success: false, error: "El archivo no parece ser un HTML valido" },
        { status: 400 },
      );
    }

    const prev = await getView();
    const prevState = await getState();
    const nextBaseRevision = (Number(prev?.base_revision) || 0) + 1;

    // Antes de pisar nada, se archiva lo que habia: HTML completo + overlay.
    if (prev?.html_content) {
      await addHistory({
        kind: "state",
        label: `Antes de subir ${file.name}`,
        stateJson: prevState?.state_json ?? null,
        snapshotHtml: prevState?.snapshot_html || prev.html_content,
        baseRevision: Number(prev.base_revision) || 0,
        revision: Number(prevState?.revision) || 0,
        createdBy: user?.role || null,
      });
    }

    await query(
      `INSERT INTO custom_views (view_name, html_content, filename, file_size, base_revision, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         html_content = VALUES(html_content),
         filename = VALUES(filename),
         file_size = VALUES(file_size),
         base_revision = VALUES(base_revision),
         updated_at = NOW()`,
      [VIEW_NAME, content, file.name, file.size, nextBaseRevision],
    );

    // El snapshot anterior corresponde a la base vieja: se marca como no
    // vigente para que el primer panel que cargue re-materialice el merge.
    await query(
      `UPDATE custom_view_state SET snapshot_revision = -1 WHERE view_name = ?`,
      [VIEW_NAME],
    );

    await addHistory({
      kind: "upload",
      label: file.name,
      stateJson: prevState?.state_json ?? null,
      snapshotHtml: content,
      baseRevision: nextBaseRevision,
      revision: Number(prevState?.revision) || 0,
      createdBy: user?.role || null,
    });

    const meta = {
      updatedAt: new Date().toISOString(),
      filename: file.name,
      size: file.size,
      baseRevision: nextBaseRevision,
    };

    if (global.io) {
      global.io.emit("vista-html-updated", { meta });
    }

    return NextResponse.json({ success: true, meta });
  } catch (error: any) {
    console.error("custom-view POST error:", error?.message);
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
