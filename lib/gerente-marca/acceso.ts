import { NextRequest, NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth/roles";
import { asignacionesDe, marcasDeLaSesion, todasLasAsignaciones } from "@/lib/gerente-marca/asignaciones";
import { ROLES_CON_MARCAS, SEDES_GERENTE, type Asignacion } from "@/lib/gerente-marca/tipos";

/**
 * Guard de las APIs del Gerente de Marca. El gerente ve solo sus marcas (las
 * de su correo, del token: no puede pedir las de otro); Marketing y
 * Electrodomésticos, todas. El SuperAdmin ve las
 * de un gerente con `?gerente=correo` o, sin él, las de todos juntos.
 *
 * `?sede=9|10` deja una sola sede; sin ella, las dos (Valencia y Caracas).
 */
export async function alcanceGerente(
  request: NextRequest,
): Promise<{ error: NextResponse } | { error?: undefined; asignaciones: Asignacion[]; sedes: number[]; payload: any }> {
  const auth = await requireRoles(request, ROLES_CON_MARCAS);
  if (auth.error) return { error: auth.error };
  const payload = auth.payload;
  const sp = request.nextUrl.searchParams;

  const sedeParam = sp.get("sede");
  const sedes = SEDES_GERENTE.map((s) => s.id as number).filter((id) => !sedeParam || sedeParam === "ambas" || String(id) === sedeParam);
  if (sedes.length === 0) return { error: NextResponse.json({ error: "Sede inválida" }, { status: 400 }) };

  const esSuper = String(payload?.role || "").toLowerCase().trim() === "superadmin";
  const gerente = sp.get("gerente");
  const asignaciones = esSuper
    ? gerente ? await asignacionesDe(gerente) : await todasLasAsignaciones()
    : await marcasDeLaSesion(payload);
  return { asignaciones, sedes, payload };
}
