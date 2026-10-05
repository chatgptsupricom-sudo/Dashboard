import Anthropic from "@anthropic-ai/sdk";
import { requireRoles } from "@/lib/auth/roles";
import { ejecutarCambio, MODELO_DEFECTO, responder, titular, type MensajeChat } from "@/lib/agenteia/agente";
import { MODELOS_AGENTE, modelosPara } from "@/lib/agenteia/modelos";
import { NextRequest, NextResponse } from "next/server";

// Agente IA del SuperAdmin: Claude + MCP de Odoo + MySQL del panel
// (lib/agenteia/agente.ts). Reemplaza el flujo de n8n.
//
//   POST { messages, modelo? } -> respuesta en texto plano, en streaming
//   POST { confirmar }  -> ejecuta un cambio en Odoo ya preparado por el agente
//   POST { titular }    -> título corto para la conversación (Haiku)
//   POST { cancelar }   -> descarta un cambio preparado (solo responde el texto)

export const runtime = "nodejs";
export const maxDuration = 300;

const LATIDO = "\u200B";

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

  if (typeof body?.titular === "string") {
    try {
      return NextResponse.json({ titulo: await titular(body.titular) });
    } catch (e: any) {
      console.error("❌ agenteia título:", e.message);
      return NextResponse.json({ titulo: "" });
    }
  }

  // Los modelos reservados (lib/agenteia/modelos.ts) son solo del SuperAdmin:
  // a otro rol se le da el primer modelo que sí puede usar, aunque pida otro
  // o el del servidor sea uno reservado.
  const esSuperadmin = String(auth.payload?.role || "").toLowerCase().trim() === "superadmin";
  const permitidos: string[] = modelosPara(esSuperadmin).map((m) => m.id);
  const reservado = MODELOS_AGENTE.some((m) => m.soloSuperadmin && m.id === MODELO_DEFECTO);
  const modelo = permitidos.includes(body?.modelo)
    ? (body.modelo as string)
    : !esSuperadmin && reservado
      ? permitidos[0]
      : undefined;

  const messages: MensajeChat[] = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  }

  // Si el usuario detiene la respuesta o cierra la pestaña, se corta también
  // la llamada a Claude: si no, el agente sigue consultando y gastando tokens.
  const corte = new AbortController();
  request.signal.addEventListener("abort", () => corte.abort());

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    cancel() {
      corte.abort();
    },
    async start(controller) {
      const emitir = (t: string) => {
        if (!corte.signal.aborted) controller.enqueue(encoder.encode(t));
      };
      // Latido: mientras el modelo piensa o corre una consulta larga no sale
      // texto, y el proxy (EasyPanel) corta la conexión por inactividad. Un
      // espacio de ancho cero cada 15 s la mantiene viva; la pantalla lo descarta.
      const latido = setInterval(() => emitir(LATIDO), 15_000);
      try {
        await responder(messages, uid, emitir, modelo, corte.signal);
      } catch (e: any) {
        if (corte.signal.aborted) {
          console.log(`[agenteia] consulta de ${uid} detenida por el usuario`);
          return;
        }
        console.error("❌ agenteia:", e);
        const msg =
          e instanceof Anthropic.RateLimitError
            ? "El agente está saturado, intenta en un minuto."
            : e instanceof Anthropic.APIError
              ? `Error del modelo (${e.status}): ${e.message}`
              : e?.message || "Error inesperado.";
        emitir(`\n\n⚠️ ${msg}`);
      } finally {
        clearInterval(latido);
        try {
          controller.close();
        } catch {}
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
