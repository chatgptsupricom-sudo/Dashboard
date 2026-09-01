import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ?? "";
const N8N_DELETE_WEBHOOK_URL = process.env.N8N_DELETE_WEBHOOK_URL ?? "";

// ── Helpers ───────────────────────────────────────────────────────────────────

const TIMEOUT_MS = 90_000; // 90 s por intento — n8n puede tardar con LLMs
const MAX_RETRIES = 0; // sin reintentos automáticos para evitar llamadas duplicadas a n8n

async function fetchN8n(
  url: string,
  body: string,
  attempt = 0,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
    });
    clearTimeout(timer);

    // Reintenta si n8n devuelve 5xx (servicio arrancando)
    if (!res.ok && res.status >= 500 && attempt < MAX_RETRIES) {
      const delay = (attempt + 1) * 3_000; // 3 s, 6 s
      console.warn(
        `⚠️ n8n respondió ${res.status}, reintento ${attempt + 1} en ${delay / 1000}s…`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return fetchN8n(url, body, attempt + 1);
    }

    return res;
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === "AbortError" && attempt < MAX_RETRIES) {
      const delay = (attempt + 1) * 3_000;
      console.warn(
        `⚠️ n8n timeout (intento ${attempt + 1}), reintento en ${delay / 1000}s…`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return fetchN8n(url, body, attempt + 1);
    }
    throw err;
  }
}

// ── N8N INTEGRATION ──────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { messages, messageType, chatId } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "Formato no válido." },
        { status: 400 },
      );
    }

    if (!N8N_WEBHOOK_URL) {
      return NextResponse.json(
        { error: "N8N_WEBHOOK_URL no está configurada." },
        { status: 500 },
      );
    }

    // userId/userName/userEmail/userRole se derivan del JWT verificado, NUNCA
    // del body: n8n usa userRole para decidir que herramientas puede usar el
    // agente, asi que confiar en lo que manda el cliente permitia
    // autodeclararse superadmin ante ese flujo sin serlo de verdad.
    const userId = auth.payload?.userId ?? auth.payload?.odooId;
    const userName = auth.payload?.name;
    const userEmail = auth.payload?.email;
    const userRole = auth.payload?.role;

    // Último mensaje del usuario
    const lastUserMsg = [...messages]
      .reverse()
      .find((m: any) => m.role === "user");
    const userText =
      typeof lastUserMsg?.content === "string"
        ? lastUserMsg.content
        : (lastUserMsg?.content?.find?.((p: any) => p.type === "text")?.text ??
          "");

    const n8nBody = JSON.stringify({
      chatId: chatId ?? null,
      userId,
      userName,
      userEmail,
      userRole,
      message: userText,
      messageType: messageType ?? "text",
    });

    let n8nResponse: Response;
    try {
      n8nResponse = await fetchN8n(N8N_WEBHOOK_URL, n8nBody);
    } catch (err: any) {
      const isTimeout = err.name === "AbortError";
      console.error("❌ n8n no respondió:", err.message);
      return NextResponse.json(
        {
          error: isTimeout
            ? "El agente tardó demasiado en responder. Inténtalo de nuevo."
            : "No se pudo conectar con el agente.",
        },
        { status: 503 },
      );
    }

    if (!n8nResponse.ok) {
      const errText = await n8nResponse.text();
      console.error("❌ Error de n8n:", errText);
      return NextResponse.json(
        {
          error:
            "El agente no está disponible en este momento. Inténtalo de nuevo en unos segundos.",
        },
        { status: 502 },
      );
    }

    // Intentar JSON primero, caer a texto plano si n8n no devuelve JSON
    const rawText = await n8nResponse.text();
    let replyText: string;
    try {
      const data = JSON.parse(rawText);
      replyText =
        typeof data === "string"
          ? data
          : (data?.output ??
            data?.text ??
            data?.message ??
            data?.response ??
            JSON.stringify(data));
    } catch {
      replyText = rawText;
    }

    // Devolvemos como stream para que el frontend lo procese igual que antes
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(replyText));
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    console.error("❌ Error Crítico:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  try {
    const { chatId } = await request.json();
    if (!chatId) {
      return NextResponse.json({ error: "chatId requerido" }, { status: 400 });
    }

    if (!N8N_DELETE_WEBHOOK_URL) {
      return NextResponse.json(
        { error: "N8N_DELETE_WEBHOOK_URL no está configurada." },
        { status: 500 },
      );
    }

    const n8nRes = await fetch(N8N_DELETE_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId }),
    });

    if (!n8nRes.ok) {
      const errText = await n8nRes.text();
      console.error("❌ Error eliminando historial en n8n:", errText);
      return NextResponse.json(
        { error: "Error en el flujo de eliminación." },
        { status: 502 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("❌ Error en DELETE agenteia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
