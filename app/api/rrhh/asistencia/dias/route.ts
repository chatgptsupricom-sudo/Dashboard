import { requireRoles } from "@/lib/auth/roles";
import { borrarDia, guardarDia, listarDias } from "@/lib/asistencia/datos";
import { ROLES_ASISTENCIA } from "@/lib/asistencia/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Calendario de la asistencia: sábados de inventario (se trabajan 8:00-4:30) y feriados.
//   GET                                   -> { dias }
//   POST {fecha, sede (0 = todas), tipo: "inventario" | "feriado", nota}
//   DELETE ?id=

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  return NextResponse.json({ dias: await listarDias() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  try {
    await guardarDia(await request.json().catch(() => ({})), String(auth.payload?.email ?? ""));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Día no encontrado" }, { status: 404 });
  await borrarDia(id);
  return NextResponse.json({ ok: true });
}
