import { requireSession } from "@/lib/auth/roles";
import { esSuperadmin, puedeUsarAgente } from "@/lib/agenteia/acceso";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// ¿La sesión puede usar el Agente IA? Lo consultan el sidebar y la pantalla.
export async function GET(request: NextRequest) {
  const s = await requireSession(request);
  if (s.error) return NextResponse.json({ puede: false, superadmin: false });
  const rol = s.payload?.role;
  return NextResponse.json({ puede: await puedeUsarAgente(rol), superadmin: esSuperadmin(rol) });
}
