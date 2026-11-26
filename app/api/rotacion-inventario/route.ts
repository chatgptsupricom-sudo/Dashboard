import { NextRequest, NextResponse } from "next/server";
import { OdooUnreachableError } from "@/lib/odoo";
import { alcanceRotacion, sedesPedidas } from "@/lib/rotacion-inventario/alcance";
import { fichasDeSede } from "@/lib/rotacion-inventario/datos";
import type { RespuestaRotacion } from "@/lib/rotacion-inventario/tipos";

export const dynamic = "force-dynamic";

/**
 * GET /api/rotacion-inventario?sede=9|10|7|todas — la ficha de cada producto
 * con unidades disponibles en la sede: semáforo por días sin venta, valor a
 * costo, plan de 90 días y la solicitud abierta a su marca
 * (lib/rotacion-inventario). Al leer, sincroniza los planes y las solicitudes
 * automáticas (a lo sumo cada 10 min por sede).
 */
export async function GET(request: NextRequest) {
  const a = await alcanceRotacion(request);
  if (a.error) return a.error;
  const sedes = sedesPedidas(a, request.nextUrl.searchParams.get("sede") ?? String(a.sedesPermitidas[0]));
  if (!sedes.length) return NextResponse.json({ error: "Sede inválida" }, { status: 400 });

  try {
    const porSede = await Promise.all(sedes.map((s) => fichasDeSede(s)));
    let fichas = porSede.flatMap((s) => s.fichas);
    if (a.productos) fichas = fichas.filter((f) => a.productos!.has(f.productoId));
    const respuesta: RespuestaRotacion = {
      hoy: porSede[0].hoy,
      sedes,
      meses: porSede[0].meses,
      fichas,
      planesRojo: porSede.flatMap((s) => (s.planRojo ? [s.planRojo] : [])),
      puedeEditar: a.puedeEditar,
      puedeGestionarSolicitudes: a.puedeGestionarSolicitudes,
      eligeSede: a.eligeSede,
      sedesPermitidas: a.sedesPermitidas,
      avisos: [...new Set(porSede.flatMap((s) => s.avisos))],
    };
    return NextResponse.json(respuesta);
  } catch (e: any) {
    console.error("[rotacion-inventario]", e?.message);
    return NextResponse.json(
      { error: "No se pudo leer Odoo. Intenta de nuevo.", odooCaido: e instanceof OdooUnreachableError },
      { status: 502 },
    );
  }
}
