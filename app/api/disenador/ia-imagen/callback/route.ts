import { query } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// KIE llama a esta URL cuando termina un job (callBackUrl en createTask).
//
// SIN requireRoles a proposito: la llama KIE desde internet, sin cookie de
// sesion. Solo escribe sobre el job cuyo kie_task_id venga en el cuerpo, que
// es un id que genera KIE; no expone datos en la respuesta.
// El polling desde /api/disenador/ia-imagen/[id] sigue funcionando igual como
// respaldo, así que si el callback llega tarde o no llega, no se rompe nada.
// Siempre respondemos 200 para que KIE no reintente indefinidamente.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    console.error("KIE callback recibido:", JSON.stringify(body).slice(0, 500));

    const d = body?.data || body;
    const taskId = d?.taskId || d?.task_id;
    if (!taskId) {
      return NextResponse.json({ success: true });
    }

    const state = String(d?.state || d?.status || "");
    let resultUrls: string[] = [];
    try {
      if (typeof d?.resultJson === "string" && d.resultJson) {
        const parsed = JSON.parse(d.resultJson);
        resultUrls = parsed.resultUrls || parsed.result_urls || [];
      } else if (Array.isArray(d?.resultUrls)) {
        resultUrls = d.resultUrls;
      }
    } catch {
      // dejamos resultUrls vacío si el JSON viene mal formado
    }
    const failMsg = d?.failMsg || d?.failReason || null;
    const status = state === "success" ? "success" : state === "fail" ? "fail" : "processing";

    await query(
      `UPDATE designer_ai_jobs SET status = ?, result_urls = ?, fail_msg = ? WHERE kie_task_id = ?`,
      [status, resultUrls.length ? JSON.stringify(resultUrls) : null, failMsg, taskId]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("POST /api/disenador/ia-imagen/callback:", error.message);
    return NextResponse.json({ success: true });
  }
}
