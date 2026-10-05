import { requireAgente } from "@/lib/agenteia/acceso";
import { db } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

// Conversaciones del Agente IA, por usuario (antes vivían solo en el
// localStorage del navegador).
//
//   GET                 -> las 100 más recientes, con sus mensajes
//   PUT { id, title, messages, createdAt } -> crea o reemplaza una
//   DELETE ?id=         -> borra una
//
// Va por db.execute y no por query(): query() audita cada escritura con la
// fila completa, y aquí cada guardado lleva la conversación entera.

export const runtime = "nodejs";

const MAX_BYTES = 4 * 1024 * 1024;

let tablaLista = false;
async function ensureTabla() {
  if (tablaLista) return;
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agenteia_chats (
      uid VARCHAR(120) NOT NULL,
      id VARCHAR(40) NOT NULL,
      titulo VARCHAR(200) NOT NULL,
      mensajes LONGTEXT NOT NULL,
      created_at BIGINT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (uid, id),
      KEY idx_uid_updated (uid, updated_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  tablaLista = true;
}

const esId = (v: unknown): v is string => typeof v === "string" && /^[a-z0-9]{6,40}$/i.test(v);

async function sesion(request: NextRequest) {
  const auth = await requireAgente(request);
  if (auth.error) return { error: auth.error };
  const uid = String(auth.payload?.uid ?? auth.payload?.email ?? "");
  if (!uid) return { error: NextResponse.json({ error: "Sesión sin usuario." }, { status: 401 }) };
  await ensureTabla();
  return { uid };
}

export async function GET(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const [filas] = await db.execute(
    "SELECT id, titulo, mensajes, created_at FROM agenteia_chats WHERE uid = ? ORDER BY updated_at DESC LIMIT 100",
    [s.uid],
  );
  const chats = (filas as any[]).map((f) => {
    let messages: unknown = [];
    try {
      messages = JSON.parse(f.mensajes);
    } catch {}
    return { id: f.id, title: f.titulo, messages, createdAt: Number(f.created_at) };
  });
  return NextResponse.json({ chats });
}

export async function PUT(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const body = await request.json().catch(() => null);
  if (!esId(body?.id) || !Array.isArray(body?.messages))
    return NextResponse.json({ error: "Formato no válido." }, { status: 400 });

  // Los adjuntos (base64) no se guardan: pesan y ya fueron leídos por el agente.
  const mensajes = JSON.stringify(body.messages.map((m: any) => ({ ...m, files: undefined })));
  if (Buffer.byteLength(mensajes) > MAX_BYTES)
    return NextResponse.json({ error: "La conversación es demasiado larga para guardarse." }, { status: 413 });
  const titulo = String(body.title || "Nueva conversación").slice(0, 200);
  const creado = Number(body.createdAt) || Date.now();

  await db.execute(
    `INSERT INTO agenteia_chats (uid, id, titulo, mensajes, created_at) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE titulo = VALUES(titulo), mensajes = VALUES(mensajes)`,
    [s.uid, body.id, titulo, mensajes, creado],
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const id = request.nextUrl.searchParams.get("id");
  if (!esId(id)) return NextResponse.json({ error: "Formato no válido." }, { status: 400 });
  await db.execute("DELETE FROM agenteia_chats WHERE uid = ? AND id = ?", [s.uid, id]);
  return NextResponse.json({ ok: true });
}
