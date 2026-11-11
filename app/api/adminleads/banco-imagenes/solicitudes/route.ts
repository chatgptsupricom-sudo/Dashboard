import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { listarSolicitudes, pendientesPorRevisar } from "@/lib/banco-imagenes/solicitudes";
import { ROLES_ADMIN_FLYERS, sedeDe } from "@/lib/banco-imagenes/accesoSolicitudes";

export const dynamic = "force-dynamic";

/** Bandeja de solicitudes de flyers de la sede (SuperAdmin: todas). */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ROLES_ADMIN_FLYERS);
  if (auth.error) return auth.error;
  try {
    const cids = sedeDe(auth.payload);
    const estado = new URL(request.url).searchParams.get("estado");
    const [solicitudes, pendientes] = await Promise.all([
      listarSolicitudes({ cids, estado: estado && estado !== "todas" ? estado : null }),
      pendientesPorRevisar(cids),
    ]);
    return NextResponse.json({ success: true, solicitudes, pendientes });
  } catch (e: any) {
    console.error("Bandeja de solicitudes de flyers:", e);
    return NextResponse.json({ error: e?.message || "Error" }, { status: 500 });
  }
}
