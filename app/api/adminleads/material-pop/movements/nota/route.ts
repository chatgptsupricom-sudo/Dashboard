import { query } from "@/lib/db";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { notaEntregaHtml } from "@/lib/adminleads/material-pop/notaEntrega";
import { hayColumnaRecipiente } from "@/lib/adminleads/material-pop/columnas";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Nota de entrega de una salida cargada a mano: a cliente, uso interno, evento
 * o campaña.
 *
 * Se pide por `group`, el `movement_group_id` que devuelve el POST de
 * movimientos. Devuelve HTML: se abre en una pestaña y el navegador imprime o
 * guarda como PDF.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const grupo = (new URL(request.url).searchParams.get("group") || "").trim();
    if (!grupo) {
      return NextResponse.json({ error: "Falta el movimiento" }, { status: 400 });
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const params: any[] = [grupo];
    let where = "WHERE m.movement_group_id = ? AND m.type = 'exit'";
    if (cids !== null) {
      where += " AND m.cids = ?";
      params.push(cids);
    }

    const recipiente = (await hayColumnaRecipiente()) ? "m.recipient_name" : "NULL AS recipient_name";
    const res = await query(
      `SELECT m.location, m.quantity, m.client_name, m.odoo_order_name, m.seller_name, m.notes,
              m.created_by_name, m.movement_date, m.reason_type, m.destination, ${recipiente},
              p.code, p.name, p.brand
       FROM pop_movements m
       JOIN pop_products p ON p.id = m.product_id
       ${where}
       ORDER BY p.name ASC`,
      params,
    );
    const filas = res.rows || [];
    if (filas.length === 0) {
      return NextResponse.json({ error: "Movimiento no encontrado" }, { status: 404 });
    }

    // Un mismo producto puede venir partido entre las dos ubicaciones: para el
    // papel es una sola línea con el total.
    const porProducto = new Map<string, { code: string; name: string; brand: string | null; quantity: number }>();
    for (const f of filas) {
      const clave = String(f.code);
      const actual = porProducto.get(clave);
      const cantidad = Number(f.quantity) || 0;
      if (actual) actual.quantity += cantidad;
      else porProducto.set(clave, { code: f.code, name: f.name, brand: f.brand, quantity: cantidad });
    }

    // Si salió de las dos ubicaciones, la nota habla del almacén principal:
    // en una salida a cliente es el traslado que hay que respaldar.
    const origen = filas.some((f: any) => f.location === "warehouse") ? "warehouse" : "office";
    const fecha = filas[0].movement_date
      ? String(new Date(filas[0].movement_date).toISOString().slice(0, 10))
      : null;

    const html = notaEntregaHtml({
      codigo: `Salida ${grupo.slice(0, 8).toUpperCase()}`,
      tipoSalida: filas[0].reason_type || "cliente",
      destino: filas[0].destination || null,
      entregadoA: filas[0].recipient_name || null,
      cliente: filas[0].client_name || "",
      vendedor: filas[0].seller_name || null,
      autorizadoPor: filas[0].created_by_name || "",
      fecha,
      ordenOdoo: filas[0].odoo_order_name || null,
      observaciones: filas[0].notes || null,
      items: [...porProducto.values()],
      origen,
    });

    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("Error generando la nota de entrega de la salida:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
