import { db } from "@/lib/db";
import { aplicarEquipo, aplicarPasos, equipoVacio, partirRespuesta, type EstadoEquipo, type Paso } from "@/lib/agenteia/respuesta";

/**
 * Respuestas del agente que siguen corriendo aunque se corte la conexión
 * (teléfono que se bloquea, red, proxy). Antes, un corte detenía al agente y
 * la respuesta se perdía aunque ya se había pagado.
 *
 * Mientras la pantalla siga abierta la recupera con POST { pendiente: chatId };
 * si el usuario cerró la pestaña, queda guardada en su chat (agenteia_chats).
 * Detener sigue siendo del usuario: POST { detener: chatId }.
 *
 * Vive en la memoria del proceso: un reinicio del servidor la pierde.
 */

interface Corrida {
  crudo: string;
  pasos: Map<string, Paso>;
  leidos: number;
  equipo: EstadoEquipo;
  leidosEquipo: number;
  terminado: boolean;
  control: AbortController;
  fin: number;
}

export interface MensajeRecuperado {
  content: string;
  proceso?: string;
  pasos?: Paso[];
  equipo?: EstadoEquipo;
}

// En globalThis: cada ruta de Next puede cargar su propia copia del módulo.
const g = globalThis as { __agenteiaCorridas?: Map<string, Corrida> };
const corridas = (g.__agenteiaCorridas ??= new Map());
const RETENER_MS = 30 * 60_000;
const clave = (uid: string, chatId: string) => `${uid}|${chatId}`;

/** Registra una respuesta nueva. Otra pregunta en el mismo chat detiene la anterior. */
export function iniciarCorrida(uid: string, chatId: string, control: AbortController): Corrida {
  const ahora = Date.now();
  for (const [k, c] of corridas) if (c.terminado && ahora - c.fin > RETENER_MS) corridas.delete(k);
  corridas.get(clave(uid, chatId))?.control.abort();
  const c: Corrida = { crudo: "", pasos: new Map(), leidos: 0, equipo: equipoVacio(), leidosEquipo: 0, terminado: false, control, fin: 0 };
  corridas.set(clave(uid, chatId), c);
  return c;
}

export function anotar(c: Corrida, texto: string) {
  c.crudo += texto;
  if (texto.includes("[[paso:")) c.leidos = aplicarPasos(c.crudo, c.pasos, c.leidos);
  if (texto.includes("[[equipo:")) c.leidosEquipo = aplicarEquipo(c.crudo, c.equipo, c.leidosEquipo);
}

export function terminarCorrida(c: Corrida) {
  c.terminado = true;
  c.fin = Date.now();
}

/** El mensaje como lo guarda la pantalla: respuesta, proceso y herramientas. */
export function mensajeDe(c: Corrida): MensajeRecuperado {
  const { contenido, proceso } = partirRespuesta(c.crudo, true);
  // Una herramienta que no alcanzó a terminar (se detuvo o falló) queda en error.
  const pasos = [...c.pasos.values()].map((p) =>
    p.estado === "corriendo" ? { ...p, estado: "error" as const, fin: p.fin ?? c.fin } : { ...p },
  );
  return {
    content: contenido,
    proceso: proceso || undefined,
    pasos: pasos.length ? pasos : undefined,
    equipo: c.equipo.usado ? c.equipo : undefined,
  };
}

export function estadoCorrida(uid: string, chatId: string): { estado: "corriendo" | "terminado" | "no_hay"; mensaje?: MensajeRecuperado } {
  const c = corridas.get(clave(uid, chatId));
  if (!c) return { estado: "no_hay" };
  if (!c.terminado) return { estado: "corriendo" };
  return { estado: "terminado", mensaje: mensajeDe(c) };
}

export function detenerCorrida(uid: string, chatId: string): boolean {
  const c = corridas.get(clave(uid, chatId));
  if (!c || c.terminado) return false;
  c.control.abort();
  return true;
}

/**
 * Deja la respuesta en el chat guardado, para quien cerró la pestaña antes de
 * que terminara. `pregunta` es el último mensaje que mandó la pantalla: si el
 * chat no alcanzó a guardarla (se guarda al terminar cada respuesta), se agrega.
 */
export async function guardarEnChat(uid: string, chatId: string, pregunta: { role: string; content: string }, mensaje: MensajeRecuperado) {
  const respuesta = { role: "assistant", ...mensaje };
  const [filas] = await db.execute("SELECT mensajes FROM agenteia_chats WHERE uid = ? AND id = ?", [uid, chatId]);
  const fila = (filas as any[])[0];
  if (!fila) {
    const titulo = pregunta.content.slice(0, 45) + (pregunta.content.length > 45 ? "…" : "");
    await db.execute("INSERT INTO agenteia_chats (uid, id, titulo, mensajes, created_at) VALUES (?, ?, ?, ?, ?)", [
      uid,
      chatId,
      titulo || "Conversación",
      JSON.stringify([{ role: "user", content: pregunta.content }, respuesta]),
      Date.now(),
    ]);
    return;
  }
  let mensajes: any[] = [];
  try {
    mensajes = JSON.parse(fila.mensajes);
  } catch {}
  if (!Array.isArray(mensajes)) mensajes = [];
  const ultimo = mensajes[mensajes.length - 1];
  const penultimo = mensajes[mensajes.length - 2];
  if (ultimo?.role === "assistant" && penultimo?.role === "user" && penultimo.content === pregunta.content) {
    mensajes[mensajes.length - 1] = { ...ultimo, ...respuesta };
  } else {
    if (!(ultimo?.role === "user" && ultimo.content === pregunta.content)) mensajes.push({ role: "user", content: pregunta.content });
    mensajes.push(respuesta);
  }
  await db.execute("UPDATE agenteia_chats SET mensajes = ? WHERE uid = ? AND id = ?", [JSON.stringify(mensajes), uid, chatId]);
}
