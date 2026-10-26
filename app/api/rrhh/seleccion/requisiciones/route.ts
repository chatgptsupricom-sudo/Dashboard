import { requireRoles } from "@/lib/auth/roles";
import { crearRequisicion } from "@/lib/seleccion/datos";
import { ROLES_SELECCION } from "@/lib/seleccion/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// POST {codigo?, fecha_recepcion, unidad_solicitante, cargo, sede, vacantes, meta_dias, notas}
//   -> { id }. Sin código se numera REQ-AAAA-NNN.

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  try {
    const id = await crearRequisicion(await request.json().catch(() => ({})), String(auth.payload?.email ?? ""));
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo crear" }, { status: 400 });
  }
}
