import Anthropic from "@anthropic-ai/sdk";
import { requireRoles } from "@/lib/auth/roles";
import { ejecutarCambio, responder, type MensajeChat } from "@/lib/agenteia/agente";
import { NextRequest, NextResponse } from "next/server";

// Agente IA del SuperAdmin: Claude + MCP de Odoo + MySQL del panel
// (lib/agenteia/agente.ts). Reemplaza el flujo de n8n.
//
//   POST { messages }   -> respuesta en texto plano, en streaming
//   POST { confirmar }  -> ejecuta un cambio en Odoo ya preparado por el agente
//   POST { cancelar }   -> descarta un cambio preparado (solo responde el texto)

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;
  const uid = String(auth.payload?.uid ?? auth.payload?.email ?? "");

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  }

  if (typeof body?.confirmar === "string") {
    return NextResponse.json({ texto: await ejecutarCambio(body.confirmar, uid) });
  }
  if (typeof body?.cancelar === "string") {
    return NextResponse.json({ texto: "Cambio cancelado. No se modificó nada en Odoo." });
  }

  const messages: MensajeChat[] = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emitir = (t: string) => controller.enqueue(encoder.encode(t));
      try {
        await responder(messages, uid, emitir);
      } catch (e: any) {
        console.error("❌ agenteia:", e);
        const msg =
          e instanceof Anthropic.RateLimitError
            ? "El agente está saturado, intenta en un minuto."
            : e instanceof Anthropic.APIError
              ? `Error del modelo (${e.status}): ${e.message}`
              : e?.message || "Error inesperado.";
        emitir(`\n\n⚠️ ${msg}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      // Evita que un proxy (nginx/EasyPanel) acumule la respuesta entera.
      "X-Accel-Buffering": "no",
    },
  });
}
