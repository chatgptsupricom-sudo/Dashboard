import { requireRoles } from "@/lib/auth/roles";
import { editarEmpleado, listarEmpleados } from "@/lib/asistencia/datos";
import { ROLES_ASISTENCIA } from "@/lib/asistencia/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Empleados del biométrico (salen de los Excel cargados).
//   GET ?sede=                         -> { empleados }
//   PATCH {sede, codigo, activo?, nombre?}  inactivo = ya no se le cuentan ausencias después de su última marca

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  try {
    return NextResponse.json({ empleados: await listarEmpleados(Number(request.nextUrl.searchParams.get("sede"))) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo leer" }, { status: 400 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ASISTENCIA);
  if (auth.error) return auth.error;
  try {
    await editarEmpleado(await request.json().catch(() => ({})));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo guardar" }, { status: 400 });
  }
}
