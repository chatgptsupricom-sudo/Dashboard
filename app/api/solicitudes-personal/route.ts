import { requireRoles } from "@/lib/auth/roles";
import { avisarPersonal } from "@/lib/solicitudes-personal/aviso";
import { crear, listar, usuarioDe } from "@/lib/solicitudes-personal/datos";
import { ROLES_SOLICITAN, ROLES_SOLICITUDES_PERSONAL } from "@/lib/solicitudes-personal/tipos";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Solicitudes de personal (lib/solicitudes-personal/).
//   GET  -> { solicitudes }  el gerente las suyas, RRHH las aprobadas, el SuperAdmin todas.
//   POST {cargo, area, sede?, cantidad, motivo, reemplaza, urgencia, fecha_deseada, perfil, requisitos, salario} -> { id }

export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SOLICITUDES_PERSONAL);
  if (auth.error) return auth.error;
  return NextResponse.json({ solicitudes: await listar(usuarioDe(auth.payload)) });
}

export async function POST(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_SOLICITAN);
  if (auth.error) return auth.error;
  try {
    const id = await crear(await request.json().catch(() => ({})), usuarioDe(auth.payload));
    avisarPersonal("nueva", id);
    return NextResponse.json({ id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "No se pudo crear" }, { status: 400 });
  }
}
