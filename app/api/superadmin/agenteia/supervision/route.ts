import { requireRoles } from "@/lib/auth/roles";
import { chatsDe, mensajesDe, usuariosSupervisados } from "@/lib/agenteia/supervision";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Conversaciones del Agente IA de los demás usuarios (lib/agenteia/supervision.ts).
// Solo SuperAdmin; las conversaciones de un SuperAdmin nunca salen.
//
//   GET                -> { usuarios: [{ uid, email, nombre, chats, ultimo, alertas, pendientes }], pendientes }
//   GET ?uid=          -> { chats: [{ id, titulo, actualizado, alerta }] }
//   GET ?uid=&chat=    -> { titulo, mensajes: [{ role, content }] }   (marca la alerta como vista)
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["superadmin"]);
  if (auth.error) return auth.error;

  const uid = request.nextUrl.searchParams.get("uid");
  const chat = request.nextUrl.searchParams.get("chat");
  const noEsta = () => NextResponse.json({ error: "No se encontró." }, { status: 404 });

  if (uid && chat) {
    if (!/^[a-z0-9]{6,40}$/i.test(chat)) return noEsta();
    const conversacion = await mensajesDe(uid, chat);
    console.log(`[agenteia] ${auth.payload?.email} leyó la conversación ${chat} de uid=${uid}`);
    return conversacion ? NextResponse.json(conversacion) : noEsta();
  }
  if (uid) {
    const chats = await chatsDe(uid);
    return chats ? NextResponse.json({ chats }) : noEsta();
  }
  const usuarios = await usuariosSupervisados();
  return NextResponse.json({ usuarios, pendientes: usuarios.reduce((s, u) => s + u.pendientes, 0) });
}
