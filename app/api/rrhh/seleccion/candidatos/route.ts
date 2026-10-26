import { requireRoles } from "@/lib/auth/roles";
import { crearCandidato } from "@/lib/seleccion/datos";
import { ROLES_SELECCION } from "@/lib/seleccion/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST {requisicion_id, nombre, ...campos de CAMPOS_CANDIDATO} -> { id }

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  try {
    const id = await crearCandidato(await request.json().catch(() => ({})), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo crear" }, { status: 400 });
  }
}
