import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import { enAlmacen, esEtapa } from "@/lib/seguridad/egresoFlujo";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { cargarMovimiento, conEgresoBloqueado, EgresoOcupado } from "@/lib/seguridad/mercancia";
import { sincronizarSeriales } from "@/lib/seguridad/seriales";
import { cargarSerialEnOdoo, ErrorSerial, quitarSerialEnOdoo } from "@/lib/seguridad/serializarOdoo";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Almacén serializa desde el panel (lib/seguridad/serializarOdoo.ts).
 *
 * POST   { codigo }  pistolea un serial: se escribe en la línea del picking
 *                    de Odoo y se relee para el egreso.
 * DELETE { serial }  quita un serial equivocado de la orden en Odoo.
 *
 * Solo Almacén y solo mientras el egreso está en sus manos: cuando pasa a
 * Seguridad, los seriales quedan fijos (es contra lo que se pistolea en C4).
 * Con el egreso tomado (conEgresoBloqueado): dos almacenistas pistoleando a
 * la vez no se pisan la misma línea vacía.
 */

async function operar(
  request: NextRequest,
  params: Promise<{ id: string }>,
  accion: (pickingId: number, cids: number | null, valor: string) => Promise<Record<string, unknown>>,
  campo: "codigo" | "serial",
) {
  try {
    const auth = await requireAlmacen(request);
    if (auth.error) return auth.error;
    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const id = parseInt((await params).id, 10);
    if (isNaN(id)) return NextResponse.json({ error: "id invalido" }, { status: 400 });
    const body = await request.json().catch(() => ({}));
    const valor = String(body?.[campo] ?? "").slice(0, 100);

    return await conEgresoBloqueado(id, async () => {
      const datos = await cargarMovimiento(id);
      if (!datos || (cids !== null && Number(datos.movimiento.cids) !== cids)) {
        return NextResponse.json({ error: "No encontrado" }, { status: 404 });
      }
      const mov = datos.movimiento;
      if (mov.tipo !== "egreso" || !esEtapa(mov.etapa) || !mov.odoo_picking_id) {
        return NextResponse.json({ error: "Este registro no tiene orden de despacho de Odoo" }, { status: 409 });
      }
      if (!enAlmacen(mov.etapa)) {
        return NextResponse.json(
          { error: "El egreso ya pasó a Seguridad: los seriales ya no se cambian" },
          { status: 409 },
        );
      }

      const pickingId = Number(mov.odoo_picking_id);
      const resultado = await accion(pickingId, mov.cids == null ? null : Number(mov.cids), valor);

      // El egreso toma lo que quedó en Odoo (misma lectura que "Actualizar").
      // Si eso falla, el serial igual quedó en Odoo: se avisa, no se culpa a
      // Odoo, y con "Actualizar seriales" se pone al día.
      let seriales_estado: unknown = null;
      try {
        seriales_estado = await sincronizarSeriales(id, pickingId);
      } catch (e: any) {
        console.error(`[egreso ${id}] serial cargado en Odoo, pero no se pudo releer [${e?.code || "?"}]:`, e?.message || e);
        return NextResponse.json({
          success: true,
          ...resultado,
          aviso: `Quedó cargado en Odoo, pero el panel no pudo actualizarse (${String(e?.message || e).slice(0, 200)}). Toca "Actualizar seriales desde Odoo".`,
          ...(await cargarMovimiento(id)),
        });
      }
      emitirMercancia(
        { accion: "conteo", id, tipo: "egreso", etapa: mov.etapa, documento: mov.odoo_picking_name },
        mov.cids == null ? null : Number(mov.cids),
      );
      return NextResponse.json({ success: true, ...resultado, seriales_estado, ...(await cargarMovimiento(id)) });
    });
  } catch (e: any) {
    if (e instanceof ErrorSerial) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof EgresoOcupado) return NextResponse.json({ error: e.message }, { status: 503 });
    console.error("[egreso] no se pudo serializar en Odoo:", e?.message || e);
    return NextResponse.json(
      { error: `Odoo no aceptó el serial: ${String(e?.message || e).slice(0, 300)}` },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return operar(request, params, (pickingId, cids, codigo) => cargarSerialEnOdoo(pickingId, cids, codigo), "codigo");
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return operar(request, params, (pickingId, _cids, serial) => quitarSerialEnOdoo(pickingId, serial), "serial");
}
