import Anthropic from "@anthropic-ai/sdk";
import { esSuperadmin as rolSuperadmin, requireAgente } from "@/lib/agenteia/acceso";
import { alcanceDe, sesionDeCorreo } from "@/lib/agenteia/alcance";
import { ejecutarCambio, MODELO_DEFECTO, responder, titular, type MensajeChat } from "@/lib/agenteia/agente";
import { MODELOS_AGENTE, modelosPara } from "@/lib/agenteia/modelos";
import { NextRequest, NextResponse } from "next/server";

// Agente IA: Claude + MCP de Odoo + MySQL del panel (lib/agenteia/agente.ts).
// Lo usa el SuperAdmin y los correos que él habilite (lib/agenteia/acceso.ts);
// confirmar cambios en Odoo es del SuperAdmin y de los editores.
//
//   POST { messages, modelo?, verComo? } -> respuesta en texto plano, en streaming
//        (verComo = correo: el SuperAdmin prueba el alcance de ese usuario)
//   POST { confirmar }  -> ejecuta un cambio en Odoo ya preparado por el agente
//   POST { titular }    -> título corto para la conversación (Haiku)
//   POST { cancelar }   -> descarta un cambio preparado (solo responde el texto)

export const runtime = "nodejs";
export const maxDuration = 300;

const LATIDO = "\u200B";

/**
 * El error para el usuario, en español: qué pasó y qué hacer. El detalle
 * técnico (en inglés) queda en los logs del servidor.
 */
function explicarError(e: any): string {
  const detalle = String(e?.error?.error?.message || e?.message || "");
  if (e instanceof Anthropic.APIConnectionTimeoutError)
    return "Claude tardó demasiado en responder. Reintenta; si se repite, haz una pregunta más acotada.";
  if (e instanceof Anthropic.APIConnectionError)
    return "El servidor del panel no pudo conectarse con Claude (falla de red). Reintenta en un momento.";
  if (e instanceof Anthropic.AuthenticationError)
    return "La clave de la API de Claude no es válida o venció. Avísale al administrador del panel.";
  if (e instanceof Anthropic.PermissionDeniedError)
    return "La cuenta de Claude no tiene permiso para usar este modelo o función. Prueba con otro modelo.";
  if (e instanceof Anthropic.RateLimitError) return "Se alcanzó el límite de uso de la API de Claude. Espera un minuto y reintenta.";
  if (e instanceof Anthropic.NotFoundError) return "El modelo elegido no está disponible en la cuenta de Claude. Elige otro modelo.";
  if (e instanceof Anthropic.BadRequestError) {
    if (/prompt is too long|too many tokens|context window/i.test(detalle))
      return "La conversación ya es demasiado larga para el modelo. Empieza un chat nuevo.";
    if (/credit balance/i.test(detalle)) return "La cuenta de la API de Claude se quedó sin saldo. Avísale al administrador del panel.";
    if (/mcp/i.test(detalle))
      return "Falló la conexión con el SQL de Odoo. Reintenta; si se repite, vuelve a conectarlo desde la pantalla del agente.";
    return `Claude rechazó la consulta por un problema en la solicitud. Detalle técnico: ${detalle}`;
  }
  if (e instanceof Anthropic.APIError && (e.status === 529 || e.status === 503))
    return "Los servidores de Claude están sobrecargados. Reintenta en unos minutos.";
  if (e instanceof Anthropic.InternalServerError) return "Claude tuvo un error interno. Reintenta en un momento.";
  if (/ECONNREFUSED|ETIMEDOUT|PROTOCOL_CONNECTION_LOST|ER_/i.test(detalle))
    return "No se pudo consultar la base de datos del panel. Reintenta en un momento.";
  return `Ocurrió un error inesperado. Reintenta en un momento. Detalle técnico: ${detalle || "sin detalle"}`;
}

export async function POST(request: NextRequest) {
  const auth = await requireAgente(request);
  if (auth.error) return auth.error;
  const uid = String(auth.payload?.uid ?? auth.payload?.email ?? "");
  const esSuperadmin = rolSuperadmin(auth.payload?.role);
  const editor = auth.nivel === "editor";

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  }

  if (typeof body?.confirmar === "string") {
    if (!editor) return NextResponse.json({ error: "Tu acceso al agente es solo de consulta: no puedes confirmar cambios en Odoo." }, { status: 403 });
    const autor = { uid, email: String(auth.payload?.email ?? ""), nombre: String(auth.payload?.name ?? "") };
    return NextResponse.json({ texto: await ejecutarCambio(body.confirmar, autor) });
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

  // "Ver como" (solo SuperAdmin): responde con el alcance de otro usuario, por
  // correo, para probar qué ve su rol. Siempre de solo lectura.
  let sesion = auth.payload;
  let soloLectura = !editor;
  if (typeof body?.verComo === "string" && body.verComo.trim()) {
    if (!esSuperadmin) return NextResponse.json({ error: "Solo el SuperAdmin puede usar «ver como»." }, { status: 403 });
    sesion = await sesionDeCorreo(body.verComo.trim().toLowerCase());
    if (!sesion) return NextResponse.json({ error: "Ese correo no es un usuario del panel." }, { status: 404 });
    soloLectura = true;
    console.log(`[agenteia] ${auth.payload?.email} consulta viendo como ${sesion.email} (${sesion.role})`);
  }
  const alcance = await alcanceDe(sesion);

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
        await responder(messages, uid, emitir, modelo, corte.signal, soloLectura, alcance);
      } catch (e: any) {
        if (corte.signal.aborted) {
          console.log(`[agenteia] consulta de ${uid} detenida por el usuario`);
          return;
        }
        console.error("❌ agenteia:", e);
        emitir(`\n\n⚠️ ${explicarError(e)}`);
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
