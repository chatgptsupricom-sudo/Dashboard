import { requireRoles } from "@/lib/auth/roles";
import { borrarCarga, cargarMarcas, listarCargas } from "@/lib/asistencia/datos";
import { ROLES_ASISTENCIA } from "@/lib/asistencia/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Excel del biométrico ya leído en la pantalla (lib/asistencia/excel.ts).
//   GET                                          -> { cargas }  las últimas 30
//   POST {sede, archivo, marcas: [{codigo, nombre, fecha, hora}]}
//                                                -> { carga_id, marcas, nuevas, repetidas, empleados }
//   DELETE ?id=                                  -> { borradas }  deshace esa carga

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  return NextResponse.json({ cargas: await listarCargas() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json(await cargarMarcas(await request.json().catch(() => ({})), String(auth.payload?.email ?? "")));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo cargar" }, { status: 400 });
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Carga no encontrada" }, { status: 404 });
  return NextResponse.json(await borrarCarga(id));
}
