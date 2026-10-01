import { NextRequest, NextResponse } from "next/server";
import { requireAlmacen, resolverCidsSesion } from "@/lib/seguridad/auth";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { buscarPickingEgresoPorId } from "@/lib/seguridad/mercancia";
import { listarAgenciasConSede, listarRutasConSede } from "@/lib/rma/rutasEnvio";
import { esDeLaSede } from "@/lib/ventas/metodoRetiroTipos";
import { ErrorMetodo, guardarMetodoRetiro, metodosEvaluados } from "@/lib/ventas/metodoRetiro";

/**
 * Almacén cambia el método de retiro de un pedido (lib/ventas/metodoRetiro.ts,
 * `porAlmacen`): el cliente avisó que lo recibe de otra forma. Por orden de
 * despacho, que es lo que Almacén tiene en pantalla; el método es del pedido.
 *
 *  - GET: rutas y agencias de la sucursal, para el formulario; con
 *    `?odoo_picking_id=`, también el método actual del pedido.
 *  - PUT: { odoo_picking_id, metodo, ruta_id?, agencia?, nota? }
 */

export async function GET(request: NextRequest) {
  const auth = await requireAlmacen(request);
  if (auth.error) return auth.error;
  const { cids, error } = resolverCidsSesion(auth.payload);
  if (error) return error;

  try {
    const pickingId = parseInt(new URL(request.url).searchParams.get("odoo_picking_id") || "", 10);
    const [rutas, agencias, picking] = await Promise.all([
      listarRutasConSede(),
      listarAgenciasConSede(),
      pickingId > 0 ? buscarPickingEgresoPorId(pickingId, cids) : Promise.resolve(null),
    ]);
    const saleId = picking?.odoo_sale_id || 0;
    const metodo = saleId ? (await metodosEvaluados([saleId])).get(saleId) ?? null : null;
    const deMiSede = <T extends { cids: number | null }>(xs: T[]) =>
      cids === null ? xs : xs.filter((x) => esDeLaSede(x.cids, cids));
    return NextResponse.json({ success: true, rutas: deMiSede(rutas), agencias: deMiSede(agencias), metodo });
  } catch (e: any) {
    console.error("GET /api/seguridad/mercancia/metodo-retiro error:", e?.message);
    return NextResponse.json({ error: "No se pudieron cargar las rutas y agencias" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await requireAlmacen(request);
  if (auth.error) return auth.error;
  const { cids, error } = resolverCidsSesion(auth.payload);
  if (error) return error;

  try {
    const body = await request.json().catch(() => ({}));
    const pickingId = parseInt(String(body.odoo_picking_id ?? ""), 10);
    if (!pickingId) return NextResponse.json({ error: "odoo_picking_id requerido" }, { status: 400 });

    // La orden tiene que ser de la sucursal de la sesión (buscarPickingEgresoPorId
    // filtra por cids) y de un pedido.
    const picking = await buscarPickingEgresoPorId(pickingId, cids);
    if (!picking?.odoo_sale_id) return NextResponse.json({ error: "Orden de despacho no encontrada" }, { status: 404 });

    const { metodo, egresos } = await guardarMetodoRetiro({
      saleId: picking.odoo_sale_id,
      metodo: body.metodo,
      rutaId: parseInt(String(body.ruta_id ?? ""), 10) || null,
      agencia: body.agencia ? String(body.agencia) : null,
      nota: body.nota ? String(body.nota) : null,
      cids,
      vendedorUid: null,
      autor: auth.payload?.name || auth.payload?.email || "Almacén",
      rol: "almacen",
      porAlmacen: true,
    });
    // Refresca las pantallas del egreso (sin cartel).
    for (const e of egresos) emitirMercancia({ accion: "conteo", id: e.id, tipo: "egreso" }, cids);
    return NextResponse.json({ success: true, metodo, egresos });
  } catch (error: any) {
    if (error instanceof ErrorMetodo) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("PUT /api/seguridad/mercancia/metodo-retiro error:", error?.message);
    return NextResponse.json({ error: "No se pudo cambiar el método de retiro" }, { status: 500 });
  }
}
