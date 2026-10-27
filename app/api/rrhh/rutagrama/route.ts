import { requireRoles } from "@/lib/auth/roles";
import { crear, listar } from "@/lib/rutagrama/datos";
import { ROLES_RUTAGRAMA } from "@/lib/rutagrama/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Rutagramas de los nuevos ingresos (lib/rutagrama/).
//   GET ?sede=                         -> { registros }  (sin sede: todas)
//   POST {sede, nombre, cedula?, cargo?} -> { id, token }  el enlace es /<idioma>/mi-ruta/<token>

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  const sede = Number(request.nextUrl.searchParams.get("sede")) || null;
  return NextResponse.json({ registros: await listar(sede) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_RUTAGRAMA);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await crear(await request.json().catch(() => ({})), String(auth.payload?.email ?? "")));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo crear" }, { status: 400 });
  }
}
