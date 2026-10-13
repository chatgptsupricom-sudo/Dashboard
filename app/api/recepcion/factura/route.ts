import { SUCURSALES } from "@/lib/recepcion/flujo";
import { ErrorRecepcion, crearRecepcionFactura, leerFactura } from "@/lib/recepcion/odoo";
import { emitirRecepcion, puedeComo, requireRecepcion, type Sesion } from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Recepcion con factura: la mercancia que otra sede le vendio a esta
 * (Valencia -> Caracas). Almacen la arranca con el numero de la factura.
 *
 * GET  /api/recepcion/factura?numero=5038581[&cids=10]
 *      productos de la factura y las OC de la sede que pueden ser la suya
 * POST /api/recepcion/factura  { numero, purchase_order_id[, cids] }
 *      crea la recepcion (nace descargando: no hay contenedores)
 *
 * Almacen recibe en su sucursal; el superadmin dice cual con `cids`.
 */

function sucursal(sesion: Sesion, pedido: unknown): number | null {
  const cids = sesion.cids ?? Number(pedido);
  return SUCURSALES.some((s) => s.cids === cids) ? cids : null;
}

function fallo(e: any) {
  if (e instanceof ErrorRecepcion) {
    return NextResponse.json({ error: e.message, id: (e as any).id ?? undefined }, { status: e.status });
  }
  console.error("[recepcion/factura]", e?.message || e);
  return NextResponse.json({ error: "No se pudo leer la factura en Odoo" }, { status: 502 });
}

export async function GET(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "La recepcion con factura la hace Almacen" }, { status: 403 });
    }
    const sp = new URL(request.url).searchParams;
    const cids = sucursal(sesion!, sp.get("cids"));
    if (!cids) return NextResponse.json({ error: "Elige la sucursal que recibe" }, { status: 400 });
    return NextResponse.json({ success: true, ...(await leerFactura(sp.get("numero") || "", cids)) });
  } catch (e: any) {
    return fallo(e);
  }
}

export async function POST(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "almacen")) {
      return NextResponse.json({ error: "La recepcion con factura la hace Almacen" }, { status: 403 });
    }
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }
    const cids = sucursal(sesion!, body?.cids);
    if (!cids) return NextResponse.json({ error: "Elige la sucursal que recibe" }, { status: 400 });
    const poId = Number(body?.purchase_order_id);
    if (!Number.isInteger(poId) || poId <= 0) {
      return NextResponse.json({ error: "Elige la OC de Odoo" }, { status: 400 });
    }

    const id = await crearRecepcionFactura({
      numero: String(body?.numero || ""),
      cids,
      purchaseOrderId: poId,
      quien: sesion!.nombre,
    });
    emitirRecepcion({ accion: "creado", id, cids, referencia: String(body?.numero || "") });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return fallo(e);
  }
}
