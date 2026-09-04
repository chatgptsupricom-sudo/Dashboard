import { query } from "@/lib/db";
import { kieGetTask } from "@/lib/kie";
import { NextRequest, NextResponse } from "next/server";

// GET: consulta/actualiza el estado de un job (polling desde el frontend).
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const r = await query(
      `SELECT id, prompt, status, kie_task_id, result_urls, fail_msg FROM designer_ai_jobs WHERE id = ?`,
      [id]
    );
    const job = r.rows?.[0];
    if (!job) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }

    // Ya terminado: no volvemos a consultar KIE.
    if (job.status === "success" || job.status === "fail") {
      return NextResponse.json({
        success: true,
        job: {
          id: job.id,
          prompt: job.prompt,
          status: job.status,
          result_urls: job.result_urls ? JSON.parse(job.result_urls) : [],
          fail_msg: job.fail_msg,
        },
      });
    }

    if (!job.kie_task_id) {
      return NextResponse.json({
        success: true,
        job: { id: job.id, prompt: job.prompt, status: job.status, result_urls: [], fail_msg: null },
      });
    }

    const kieResult = await kieGetTask(job.kie_task_id);
    const status =
      kieResult.state === "success" ? "success" : kieResult.state === "fail" ? "fail" : "processing";

    await query(
      `UPDATE designer_ai_jobs SET status = ?, result_urls = ?, fail_msg = ? WHERE id = ?`,
      [status, kieResult.resultUrls.length ? JSON.stringify(kieResult.resultUrls) : null, kieResult.failMsg, id]
    );

    return NextResponse.json({
      success: true,
      job: {
        id: job.id,
        prompt: job.prompt,
        status,
        stage: kieResult.state,
        result_urls: kieResult.resultUrls,
        fail_msg: kieResult.failMsg,
      },
    });
  } catch (error: any) {
    console.error("GET /api/disenador/ia-imagen/[id]:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
