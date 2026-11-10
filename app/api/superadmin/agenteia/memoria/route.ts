import { requireAgente } from "@/lib/agenteia/acceso";
import { guardarInstrucciones, instruccionesDe, MAX_INSTRUCCIONES, MAX_LARGO, MAX_NOTAS, notasDe, olvidar, recordar } from "@/lib/agenteia/memoria";
import { NextRequest, NextResponse } from "next/server";

// «Tus preferencias»: las instrucciones personales y las notas del agente sobre
// el usuario de la sesión (lib/agenteia/memoria.ts). Cada uno ve y cambia solo las suyas.
//
//   GET             -> { instrucciones, maxInstrucciones, notas, max, largo }
//   PUT { instrucciones } -> guarda (vacío = borra) las instrucciones personales
//   POST { texto }  -> agrega una nota escrita por el usuario
//   DELETE ?id=     -> borra una nota suya

export const runtime = "nodejs";

async function sesion(request: NextRequest) {
  const auth = await requireAgente(request);
  if (auth.error) return { error: auth.error };
  const uid = String(auth.payload?.uid ?? auth.payload?.email ?? "");
  if (!uid) return { error: NextResponse.json({ error: "Sesión sin usuario." }, { status: 401 }) };
  return { uid };
}

export async function GET(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const [notas, instrucciones] = await Promise.all([notasDe(s.uid), instruccionesDe(s.uid)]);
  return NextResponse.json({ instrucciones, maxInstrucciones: MAX_INSTRUCCIONES, notas, max: MAX_NOTAS, largo: MAX_LARGO });
}

export async function PUT(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const body = await request.json().catch(() => ({}));
  const r = await guardarInstrucciones(s.uid, body?.instrucciones);
  if (!r.ok) return NextResponse.json({ error: r.mensaje }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const body = await request.json().catch(() => ({}));
  const r = await recordar(s.uid, body?.texto, "usuario");
  if (!r.ok) return NextResponse.json({ error: r.mensaje }, { status: 400 });
  return NextResponse.json({ ok: true, id: r.id, notas: await notasDe(s.uid) });
}

export async function DELETE(request: NextRequest) {
  const s = await sesion(request);
  if (s.error) return s.error;
  const ok = await olvidar(s.uid, request.nextUrl.searchParams.get("id"));
  if (!ok) return NextResponse.json({ error: "Esa nota no existe." }, { status: 404 });
  return NextResponse.json({ ok: true, notas: await notasDe(s.uid) });
}
