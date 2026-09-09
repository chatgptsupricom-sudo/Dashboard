import { getConnection, query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";

const JWT_SECRET = jwtSecretBytes();

const MONEDAS_VALIDAS = new Set(["USD", "EUR", "VES"]);
const SEDES_VALIDAS = new Set([7, 9, 10]);
const MAX_RETRIES = 5;

type LineaEntrada = {
  product_odoo_id?: number | null;
  product_code?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
};

function redondear2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Valida y recalcula las lineas en el servidor -- nunca se confia en los
 * totales que manda el cliente (issue #153). Devuelve las lineas con su
 * line_total ya calculado, mas subtotal/total de la orden.
 */
function procesarLineas(lines: any): { lineas: (LineaEntrada & { line_total: number })[]; subtotal: number } {
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

// Genera OC-<año>-<correlativo 6 digitos>. Mismo patron de MAX+1 con
// reintento-por-colision que nextCaseNumber() en
// app/api/servicio-tecnico/ticket/route.ts -- preferible a un lock de tabla
// porque compras no tiene picos de carga que justifiquen esa complejidad, y
// asi se reusa un patron ya probado en el repo.
async function nextOrderNumber(conn: any): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const [filas] = (await conn.execute(
    `SELECT order_number FROM purchase_orders WHERE order_number LIKE ? ORDER BY id DESC LIMIT 1`,
    [`${prefix}%`],
  )) as [any[], any];

  let next = 1;
  if (filas.length > 0) {
    const correlativo = parseInt(String(filas[0].order_number).slice(prefix.length), 10);
    if (Number.isFinite(correlativo)) next = correlativo + 1;
  }
  return `${prefix}${String(next).padStart(6, "0")}`;
}

export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const sedeParam = searchParams.get("sede");
    const sedeId = sedeParam ? parseInt(sedeParam, 10) : null;
    const mine = searchParams.get("mine") === "true";
    const q = searchParams.get("q")?.trim();

    const where: string[] = [];
    const params: any[] = [];

    // `compras` solo ve las ordenes que creo -- restriccion dura, no opcional
    // via `mine` (un comprador no debe poder listar las de otro comprador
    // cambiando el query param). `superadmin` ve todas por default; `mine`
    // para superadmin es solo un filtro de conveniencia (ver las que el/ella
    // mismo creo, ya que el rol tambien puede crear ordenes).
    if (userRole === "compras") {
      where.push("po.created_by_id = ?");
      params.push(String(payload.sub));
    } else if (mine) {
      where.push("po.created_by_id = ?");
      params.push(String(payload.sub));
    }

    if (status) { where.push("po.status = ?"); params.push(status); }
    if (sedeId) { where.push("po.company_id = ?"); params.push(sedeId); }
    if (q) {
      where.push("(po.order_number LIKE ? OR po.supplier_name LIKE ?)");
      params.push(`%${q}%`, `%${q}%`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const result = await query(
      `SELECT po.*,
              (SELECT COUNT(*) FROM purchase_order_lines pol WHERE pol.order_id = po.id) AS lines_count
       FROM purchase_orders po
       ${whereSql}
       ORDER BY po.created_at DESC`,
      params,
    );

    return NextResponse.json({ success: true, data: result.rows });
  } catch (error: any) {
    console.error("Error listando ordenes de compra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let conn: any = null;
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
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
    const total = subtotal; // sin impuestos/descuentos por ahora, ver sql/purchase_orders.sql

    const createdBy = String(payload.name || payload.email || "Usuario");
    const createdById = String(payload.sub || "");

    conn = await getConnection();

    let orderId: number | null = null;
    let orderNumber: string | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        orderNumber = await nextOrderNumber(conn);

        const [insertResult] = (await conn.execute(
          `INSERT INTO purchase_orders
             (order_number, company_id, supplier_odoo_id, supplier_name, status,
              currency, expected_date, notes, subtotal, total, created_by, created_by_id)
           VALUES (?, ?, ?, ?, 'borrador', ?, ?, ?, ?, ?, ?, ?)`,
          [orderNumber, companyId, supplierOdooId, supplierName, currency, expectedDate, notes, subtotal, total, createdBy, createdById],
        )) as [{ insertId: number }, any];

        orderId = insertResult?.insertId;
        if (!orderId) throw new Error("El INSERT no devolvio insertId");
        break;
      } catch (e: any) {
        lastError = e;
        const msg = e.message || "";
        const isDuplicate = msg.includes("Duplicate entry") && msg.includes("order_number");
        if (isDuplicate && attempt < MAX_RETRIES) continue;
        throw e;
      }
    }
    if (!orderId) throw lastError || new Error("No se pudo crear la orden");

    for (const l of lineas) {
      await conn.execute(
        `INSERT INTO purchase_order_lines
           (order_id, product_odoo_id, product_code, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [orderId, l.product_odoo_id, l.product_code, l.description, l.quantity, l.unit_price, l.line_total],
      );
    }

    await conn.execute(
      `INSERT INTO purchase_order_history (order_id, from_status, to_status, changed_by, changed_by_role, comment)
       VALUES (?, NULL, 'borrador', ?, ?, 'Orden creada')`,
      [orderId, createdBy, userRole],
    );

    // La UI (#155) espera la orden envuelta en `order` -- mismo contrato
    // que el GET de detalle, para poder redirigir con json.order.id sin una
    // consulta extra.
    return NextResponse.json(
      {
        success: true,
        order: {
          id: orderId,
          order_number: orderNumber,
          status: "borrador",
          company_id: companyId,
          supplier_name: supplierName,
          currency,
          total,
        },
      },
      { status: 201 },
    );
  } catch (error: any) {
    console.error("Error creando orden de compra:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) {
      try { conn.release(); } catch (e: any) { console.error("[compras/ordenes] release:", e?.message); }
    }
  }
}
