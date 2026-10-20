import { requireRoles } from "@/lib/auth/roles";
import {
  acomodarSolo,
  cargarOrganigramaInicial,
  crearNodo,
  guardarPosiciones,
  listarNodos,
} from "@/lib/organigrama/datos";
import { organigramaDe, ROLES_ORGANIGRAMA } from "@/lib/organigrama/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Organigrama (lib/organigrama/datos.ts). SuperAdmin y rol Procesos.
//   GET ?organigrama=actual|propuesto   -> { nodos }
//   POST {cargo, parentId, organigrama…} -> { id }   crea un cargo (encimaDe = lo inserta como superior de otro)
//   POST {inicial: true, organigrama}    -> { cargado }  carga la semilla de ese organigrama si está vacío
//   POST {posiciones: [{id, x, y}]}      -> { guardadas }  dónde quedó cada recuadro en el lienzo
//   POST {acomodar: true, organigrama}   -> { ok }  vuelve al acomodo automático

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ORGANIGRAMA);
  if (auth.error) return auth.error;
  const org = organigramaDe(request.nextUrl.searchParams.get("organigrama"));
  return NextResponse.json({ nodos: await listarNodos(org) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ORGANIGRAMA);
  if (auth.error) return auth.error;
  const por = String(auth.payload?.email ?? "");
  try {
    const b = await request.json();
    if (b?.posiciones) return NextResponse.json({ guardadas: await guardarPosiciones(b.posiciones, por) });
    if (b?.acomodar) {
      await acomodarSolo(organigramaDe(b.organigrama));
      return NextResponse.json({ ok: true });
    }
    if (b?.inicial) {
      return NextResponse.json({ cargado: await cargarOrganigramaInicial(organigramaDe(b.organigrama), por) });
    }
    return NextResponse.json({ id: await crearNodo(b, por) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
