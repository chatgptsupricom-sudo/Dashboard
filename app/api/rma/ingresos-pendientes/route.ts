import { requireRoles } from "@/lib/auth/roles";
import { diasUmbral, ingresosPendientes } from "@/lib/seguridad/pendientes";
import { NextRequest, NextResponse } from "next/server";

/**
 * Detalle de los equipos pendientes de despacho, para el técnico (issue #37).
 *
 * El issue lo llamaba `/api/seguridad/ingresos-pendientes-mios?tecnico_id=X`.
 * Cambió por dos motivos. Uno: quien lo consume es el panel RMA, y todo lo que
 * cuelga de /api/seguridad exige rol `seguridad`, que el técnico no tiene.
 * Dos: el propio issue pide en el punto 5 que el filtro salga del JWT y no de
 * la query — un `?tecnico_id=` que se respete es justo el agujero que ese
 * punto quería evitar, así que el parámetro no existe.
 *
 * Sin asignación de técnico en la base, "mis pendientes" son los del equipo:
 * todos ven la misma cola. Es lo que hay hasta que `rma_cases` sepa de quién
 * es cada caso.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma", "seguridad"]);
  if (auth.error) return auth.error;

  try {
    const dias = diasUmbral();
    const pendientes = await ingresosPendientes(dias);

    return NextResponse.json({
      success: true,
      dias_umbral: dias,
      count: pendientes.length,
      oldest_days: pendientes[0]?.dias_en_taller ?? 0,
      ingresos: pendientes,
    });
  } catch (error: any) {
    console.error("Error listando ingresos pendientes para RMA:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
