import { requireRoles } from "@/lib/auth/roles";
import { cargarOrganigramaInicial, crearNodo, listarNodos } from "@/lib/organigrama/datos";
import { ROLES_ORGANIGRAMA } from "@/lib/organigrama/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Organigrama (lib/organigrama/datos.ts). SuperAdmin y rol Procesos.
//   GET                      -> { nodos }
//   POST {cargo, parentId…}  -> { id }   crea un cargo (encimaDe = lo inserta como superior de otro)
//   POST {inicial: true}     -> { cargado }  carga el organigrama de oct-2026 si está vacío

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ORGANIGRAMA);
  if (auth.error) return auth.error;
  return NextResponse.json({ nodos: await listarNodos() });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ORGANIGRAMA);
  if (auth.error) return auth.error;
  const por = String(auth.payload?.email ?? "");
  try {
    const b = await request.json();
    if (b?.inicial) return NextResponse.json({ cargado: await cargarOrganigramaInicial(por) });
    return NextResponse.json({ id: await crearNodo(b, por) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
