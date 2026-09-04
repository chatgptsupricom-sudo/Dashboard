// Cliente mínimo para la API de KIE (https://docs.kie.ai) — usado por el
// Editor con IA del Diseñador (Seedream image-to-image).
//
// Modelo configurable por env porque KIE renombra/actualiza modelos seguido
// (v4, v4.5, 5-lite, 5-pro...); así se puede cambiar sin tocar código.
const KIE_BASE_URL = "https://api.kie.ai";
const DEFAULT_MODEL = process.env.KIE_SEEDREAM_MODEL || "seedream/5-pro-image-to-image";

function kieHeaders() {
  const key = process.env.KIE_API_KEY;
  if (!key) throw new Error("Falta configurar KIE_API_KEY en el servidor");
  return {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

// POST /api/v1/jobs/createTask -> crea la tarea de edición, devuelve taskId.
export async function kieCreateTask(input: Record<string, any>, model = DEFAULT_MODEL): Promise<string> {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: kieHeaders(),
    body: JSON.stringify({ model, input }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data?.data ? ` (${JSON.stringify(data.data).slice(0, 200)})` : "";
    throw new Error((data?.msg || data?.message || `KIE createTask HTTP ${res.status}`) + detail);
  }
  const taskId = data?.data?.taskId || data?.taskId;
  if (!taskId) {
    throw new Error(data?.msg || "KIE no devolvió taskId: " + JSON.stringify(data).slice(0, 300));
  }
  return String(taskId);
}

export interface KieTaskResult {
  state: "waiting" | "queuing" | "generating" | "success" | "fail" | string;
  resultUrls: string[];
  failMsg: string | null;
}

// GET /api/v1/jobs/recordInfo?taskId=... -> consulta el estado de la tarea.
// El parseo es defensivo: la doc pública de KIE no es 100% consistente entre
// modelos sobre el nombre exacto de los campos de resultado.
export async function kieGetTask(taskId: string): Promise<KieTaskResult> {
  const res = await fetch(`${KIE_BASE_URL}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`, {
    headers: kieHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.msg || data?.message || `KIE recordInfo HTTP ${res.status}`);
  }
  const d = data?.data || data;
  const state = String(d?.state || d?.status || "waiting");

  let resultUrls: string[] = [];
  try {
    if (typeof d?.resultJson === "string" && d.resultJson) {
      const parsed = JSON.parse(d.resultJson);
      resultUrls = parsed.resultUrls || parsed.result_urls || parsed.urls || [];
    } else if (Array.isArray(d?.resultUrls)) {
      resultUrls = d.resultUrls;
    } else if (Array.isArray(d?.result?.resultUrls)) {
      resultUrls = d.result.resultUrls;
    }
  } catch {
    // dejamos resultUrls vacío si el JSON viene mal formado
  }

  const failMsg = d?.failMsg || d?.failReason || d?.errorMessage || null;
  return { state, resultUrls, failMsg };
}
