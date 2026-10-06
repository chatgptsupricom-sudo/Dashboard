import { requireSession } from "@/lib/auth/roles";
import { esSuperadmin, nivelAgente } from "@/lib/agenteia/acceso";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ¿La sesión puede usar el Agente IA, y con qué nivel? Lo consultan el sidebar y la pantalla.
export async function GET(request: NextRequest) {
  const s = await requireSession(request);
  if (s.error) return NextResponse.json({ puede: false, superadmin: false, editor: false });
  const nivel = await nivelAgente(s.payload);
  return NextResponse.json({ puede: !!nivel, superadmin: esSuperadmin(s.payload?.role), editor: nivel === "editor" });
}
