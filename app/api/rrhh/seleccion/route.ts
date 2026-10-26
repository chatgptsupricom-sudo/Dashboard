import { requireRoles } from "@/lib/auth/roles";
import { listarMatriz } from "@/lib/seleccion/datos";
import { ROLES_SELECCION } from "@/lib/seleccion/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Matriz de rastreo de selección de personal (lib/seleccion/). RRHH y SuperAdmin.
//   GET -> { requisiciones, candidatos }  todo; la pantalla filtra y calcula indicadores.

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SELECCION);
  if (auth.error) return auth.error;
  return NextResponse.json(await listarMatriz());
}
