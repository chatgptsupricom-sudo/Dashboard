import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import { enAlmacen, esEtapa } from "@/lib/seguridad/egresoFlujo";
import { cargarMovimiento } from "@/lib/seguridad/mercancia";
import { faltaMigracion, sincronizarSeriales } from "@/lib/seguridad/seriales";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * POST /api/seguridad/mercancia/[id]/seriales
 *
 * "Actualizar desde Odoo" (issue #299): relee los seriales del picking y los
 * deja como los esperados del egreso. Solo Almacen y solo mientras el egreso
 * esta en sus manos: cuando pasa a Seguridad la lista queda fija, porque es
 * contra lo que se pistolea en C4.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAlmacen(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });

    const datos = await cargarMovimiento(id);
    if (!datos || (cids !== null && Number(datos.movimiento.cids) !== cids)) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const mov = datos.movimiento;
    if (mov.tipo !== "egreso" || !esEtapa(mov.etapa) || !mov.odoo_picking_id) {
      return NextResponse.json(
        { error: "Este registro no tiene orden de despacho de Odoo" },
        { status: 409 },
      );
    }
    if (!enAlmacen(mov.etapa)) {
      return NextResponse.json(
        { error: "El egreso ya paso a Seguridad: los seriales ya no se releen" },
        { status: 409 },
      );
    }

    let resultado;
    try {
      resultado = await sincronizarSeriales(id, Number(mov.odoo_picking_id));
    } catch (e: any) {
      if (faltaMigracion(e)) {
        return NextResponse.json(
          { error: "Falta correr sql/egreso_seriales.sql" },
          { status: 500 },
        );
      }
      console.error("[egreso] no se pudieron leer los seriales de Odoo:", e?.message || e);
      return NextResponse.json(
        { error: "No se pudieron leer los seriales de Odoo" },
        { status: 502 },
      );
    }

    return NextResponse.json({
      success: true,
      seriales_estado: resultado,
      ...(await cargarMovimiento(id)),
    });
  } catch (error: any) {
    console.error("Error actualizando seriales del egreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
