import { getConnection, query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
import { leerEstadoOdoo, sincronizarOrdenConOdoo } from "@/lib/compras/odooSync";

const JWT_SECRET = jwtSecretBytes();

const MONEDAS_VALIDAS = new Set(["USD", "EUR", "VES"]);
const SEDES_VALIDAS = new Set([7, 9, 10]);
const EDITABLES = new Set(["borrador", "rechazada"]);

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function procesarLineas(lines: any): { lineas: any[]; subtotal: number } {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("La orden necesita al menos una linea");
  }
  const lineas = lines.map((l: any, idx: number) => {
    const description = String(l?.description || "").trim();
    const quantity = Number(l?.quantity);
    const unit_price = Number(l?.unit_price);
    if (!description) throw new Error(`Linea ${idx + 1}: falta la descripcion`);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Linea ${idx + 1}: cantidad invalida`);
    if (!Number.isFinite(unit_price) || unit_price < 0) throw new Error(`Linea ${idx + 1}: precio invalido`);
    return {
      product_odoo_id: l?.product_odoo_id != null ? Number(l.product_odoo_id) : null,
      product_code: l?.product_code ? String(l.product_code).trim() : null,
      description,
      quantity,
      unit_price,
      line_total: redondear2(quantity * unit_price),
    };
  });
  const subtotal = redondear2(lineas.reduce((s, l) => s + l.line_total, 0));
  return { lineas, subtotal };
}

async function verificarSesion(request: NextRequest) {
  const token = request.cookies.get("token")?.value;
  if (!token) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) };
  const { payload } = await jwtVerify(token, JWT_SECRET);
  const userRole = ((payload.role as string) || "").toLowerCase().trim();
  if (userRole !== "compras" && userRole !== "superadmin") {
    return { error: NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 }) };
  }
  return { payload, userRole };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await verificarSesion(request);
    if (sesion.error) return sesion.error;
    const { payload, userRole } = sesion;

    const { id } = await params;
    const orderResult = await query(`SELECT * FROM purchase_orders WHERE id = ?`, [id]);
    const orden = orderResult.rows[0];
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    // `compras` solo ve el detalle de sus propias ordenes -- mismo criterio
    // de ownership que el listado.
    if (userRole === "compras" && String(orden.created_by_id) !== String(payload!.sub)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const [lineasResult, historialResult] = await Promise.all([
      query(`SELECT * FROM purchase_order_lines WHERE order_id = ? ORDER BY id ASC`, [id]),
      query(`SELECT * FROM purchase_order_history WHERE order_id = ? ORDER BY created_at ASC`, [id]),
    ]);

    // Estado real en Odoo, leido en vivo (issue #166) -- no se guarda en
    // MySQL, es solo para mostrar en el detalle. Si Odoo esta caido o la
    // orden nunca se sincronizo, se omite sin romper el resto de la
    // respuesta.
    let odoo_live: { state: string; name: string; amount_total: number } | null = null;
    if (orden.odoo_purchase_order_id) {
      odoo_live = await leerEstadoOdoo(orden.odoo_purchase_order_id);
    }

    return NextResponse.json({
      success: true,
      order: { ...orden, odoo_live },
      lines: lineasResult.rows,
      history: historialResult.rows,
    });
  } catch (error: any) {
    console.error("Error obteniendo orden de compra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let conn: any = null;
  try {
    const sesion = await verificarSesion(request);
    if (sesion.error) return sesion.error;
    const { payload, userRole } = sesion;

    const { id } = await params;
    const existing = await query(
      `SELECT id, status, created_by_id FROM purchase_orders WHERE id = ?`,
      [id],
    );
    const orden = existing.rows[0];
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    if (userRole === "compras" && String(orden.created_by_id) !== String(payload!.sub)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }
    if (!EDITABLES.has(orden.status)) {
      return NextResponse.json(
        { error: "Solo se pueden editar ordenes en borrador o rechazadas" },
        { status: 409 },
      );
    }

    const body = await request.json();
    const supplierName = String(body?.supplier_name || "").trim();
    if (!supplierName) {
      return NextResponse.json({ error: "Falta el proveedor" }, { status: 400 });
    }
    const companyId = SEDES_VALIDAS.has(Number(body?.company_id)) ? Number(body.company_id) : 9;
    const currency = MONEDAS_VALIDAS.has(String(body?.currency)) ? String(body.currency) : "USD";
    const supplierOdooId = body?.supplier_odoo_id != null ? Number(body.supplier_odoo_id) : null;
    const expectedDate = body?.expected_date ? String(body.expected_date).slice(0, 10) : null;
    const notes = body?.notes ? String(body.notes) : null;

    let lineas, subtotal;
    try {
      ({ lineas, subtotal } = procesarLineas(body?.lines));
    } catch (e: any) {
      return NextResponse.json({ error: e.message }, { status: 400 });
    }
    const total = subtotal;

    conn = await getConnection();

    // Reemplazar lineas: delete + insert en la misma conexion. No hace
    // falta BEGIN/COMMIT explicito -- si el INSERT de una linea falla a
    // mitad de camino, el catch de abajo devuelve 500 y la orden queda con
    // menos lineas de las que debería; es una ventana pequeña y ya
    // aceptada en el resto del repo (ver INSERT+UPDATE sueltos de
    // app/api/rma/[id]/guia/route.ts), no se introduce nada nuevo.
    await conn.execute(`DELETE FROM purchase_order_lines WHERE order_id = ?`, [id]);
    for (const l of lineas) {
      await conn.execute(
        `INSERT INTO purchase_order_lines
           (order_id, product_odoo_id, product_code, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, l.product_odoo_id, l.product_code, l.description, l.quantity, l.unit_price, l.line_total],
      );
    }

    // El status NO cambia aca -- si estaba 'rechazada' sigue 'rechazada'
    // hasta que se reenvie explicitamente con el endpoint de #D.
    await conn.execute(
      `UPDATE purchase_orders SET
         company_id = ?, supplier_odoo_id = ?, supplier_name = ?, currency = ?,
         expected_date = ?, notes = ?, subtotal = ?, total = ?
       WHERE id = ?`,
      [companyId, supplierOdooId, supplierName, currency, expectedDate, notes, subtotal, total, id],
    );

    // Sync a Odoo (issue #166) -- best-effort, ver lib/compras/odooSync.ts.
    await sincronizarOrdenConOdoo(Number(id));

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error editando orden de compra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e: any) { console.error("[compras/ordenes/id] release:", e?.message); }
    }
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const sesion = await verificarSesion(request);
    if (sesion.error) return sesion.error;
    const { payload, userRole } = sesion;

    const { id } = await params;
    const existing = await query(
      `SELECT id, status, created_by_id FROM purchase_orders WHERE id = ?`,
      [id],
    );
    const orden = existing.rows[0];
    if (!orden) return NextResponse.json({ error: "Orden no encontrada" }, { status: 404 });

    if (userRole === "compras" && String(orden.created_by_id) !== String(payload!.sub)) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }
    if (orden.status !== "borrador") {
      return NextResponse.json({ error: "Solo se pueden borrar ordenes en borrador" }, { status: 409 });
    }

    // Lineas e historial se van solos: FOREIGN KEY ... ON DELETE CASCADE
    // en sql/purchase_orders.sql.
    await query(`DELETE FROM purchase_orders WHERE id = ?`, [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error borrando orden de compra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
