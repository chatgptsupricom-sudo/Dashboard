import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { puedeComo, requireRecepcion } from "@/lib/recepcion/servidor";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Quita las órdenes aprobadas en el panel cuya orden de Odoo se canceló
 * después (P-00101 se canceló en Odoo y se seguía ofreciendo). Si la base
 * todavía no tiene las columnas de sincronización o Odoo no responde, se
 * devuelven tal cual.
 */
async function sinCanceladasEnOdoo(ordenes: any[]): Promise<any[]> {
  if (ordenes.length === 0) return ordenes;
  try {
    const ids = ordenes.map((o) => o.id);
    const r = await query(
      `SELECT id, odoo_purchase_order_id FROM purchase_orders
        WHERE id IN (${ids.map(() => "?").join(",")}) AND odoo_purchase_order_id IS NOT NULL`,
      ids,
    );
    const odooDe = new Map((r.rows as any[]).map((x) => [x.id, Number(x.odoo_purchase_order_id)]));
    if (odooDe.size === 0) return ordenes;
    const pos = await callOdooRPC<any[]>("purchase.order", "search_read", [[["id", "in", [...odooDe.values()]], ["state", "=", "cancel"]]], {
      fields: ["id"],
      limit: 0,
    });
    const canceladas = new Set((pos || []).map((p) => p.id));
    return ordenes.filter((o) => !canceladas.has(odooDe.get(o.id) ?? -1));
  } catch {
    return ordenes;
  }
}

/**
 * GET /api/recepcion/ordenes-compra?cids=9        ordenes de compra aprobadas de esa sucursal
 * GET /api/recepcion/ordenes-compra?id=123        renglones de una orden
 *
 * Para cuando el packing list viene en PDF (no se puede leer): Compras toma
 * los renglones de la orden de compra que ya cargo en el panel y los ajusta.
 */
export async function GET(request: NextRequest) {
  try {
    const { sesion, error } = await requireRecepcion(request);
    if (error) return error;
    if (!puedeComo(sesion!, "compras")) {
      return NextResponse.json({ error: "Solo Compras" }, { status: 403 });
    }

    const sp = new URL(request.url).searchParams;
    const id = Number(sp.get("id"));
    if (Number.isFinite(id) && id > 0) {
      const [orden, lineas] = await Promise.all([
        query(
          "SELECT id, order_number, supplier_name, company_id FROM purchase_orders WHERE id = ?",
          [id],
        ),
        query(
          `SELECT product_code AS codigo, description AS producto, quantity AS cantidad
             FROM purchase_order_lines WHERE order_id = ? ORDER BY id`,
          [id],
        ),
      ]);
      if (orden.rows.length === 0) {
        return NextResponse.json({ error: "No encontrada" }, { status: 404 });
      }
      return NextResponse.json({ success: true, orden: orden.rows[0], lineas: lineas.rows });
    }

    const cids = Number(sp.get("cids"));
    const res = await query(
      `SELECT id, order_number, supplier_name, company_id, expected_date, status
         FROM purchase_orders
        WHERE status = 'aprobada' ${Number.isFinite(cids) && cids > 0 ? "AND company_id = ?" : ""}
        ORDER BY id DESC
        LIMIT 100`,
      Number.isFinite(cids) && cids > 0 ? [cids] : [],
    );
    return NextResponse.json({ success: true, ordenes: await sinCanceladasEnOdoo(res.rows as any[]) });
  } catch (e: any) {
    // Una base sin el modulo de ordenes de compra no rompe la pantalla: solo
    // no ofrece importar desde una orden.
    if (/doesn't exist|no such table/i.test(e?.message || "")) {
      return NextResponse.json({ success: true, ordenes: [], lineas: [] });
    }
    console.error("Error listando ordenes de compra para recepcion:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
