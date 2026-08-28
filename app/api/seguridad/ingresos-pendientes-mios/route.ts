import { requireRoles } from "@/lib/auth/roles";
import { resolverCidsSesion } from "@/lib/seguridad/auth";
import { diasUmbral, ingresosPendientes } from "@/lib/seguridad/pendientes";
import { NextRequest, NextResponse } from "next/server";

/**
 * Detalle de los equipos pendientes de despacho, para el técnico (issue #37,
 * punto 4).
 *
 * Vive bajo /api/seguridad aunque quien lo consume sea el panel RMA, porque es
 * la ruta que pide el issue. El guard es por ruta y no por prefijo, así que
 * acepta los dos roles: sin eso el técnico recibiría un 403 al abrir su propio
 * aviso, que es el único motivo por el que esto había quedado en otro lado.
 *
 * No acepta el `?tecnico_id=X` del punto 4: el punto 5 del mismo issue pide
 * que el filtro salga del JWT, y los dos no pueden cumplirse a la vez. Un
 * `tecnico_id` por query que se respete es justo el agujero que el punto 5
 * quiere evitar, así que manda el 5.
 *
 * OJO, no confundir con `/api/seguridad/ingresos-pendientes` (sin el `-mios`),
 * que es otra ruta, anterior a esto y sin usar.
 *
 * Sin asignación de técnico en la base, "mis pendientes" son los del equipo:
 * todos ven la misma cola. Es lo que hay hasta que `rma_cases` sepa de quién
 * es cada caso.
 */
export async function GET(request: NextRequest) {
  const auth = await requireRoles(request, ["rma", "seguridad"]);
  if (auth.error) return auth.error;

  const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
  if (cidsError) return cidsError;

  try {
    const dias = diasUmbral();
    const pendientes = await ingresosPendientes(dias, cids);

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
