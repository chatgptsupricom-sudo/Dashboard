import { query, getConnection } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import {
  isValidMovementDate,
  validateNonNegativeQuantity,
  validateQuantity,
} from "@/lib/adminleads/material-pop/validation";

export const dynamic = "force-dynamic";

const VALID_LOCATION = ["office", "warehouse"];
const VALID_TYPE = ["entry", "exit", "transfer", "adjustment"];

function truncar(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** Actualiza (suma o resta) el stock de una ubicación para un producto. */
async function cambiarStock(
  conn: any,
  productId: number,
  location: string,
  delta: number,
): Promise<void> {
  await conn.execute(
    `INSERT INTO pop_stock (product_id, location, quantity)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
    [productId, location, delta],
  );
}

/** Lee el stock actual de un producto en una ubicación. */
async function leerStock(
  conn: any,
  productId: number,
  location: string,
): Promise<number> {
  const [rows] = await conn.execute(
    "SELECT quantity FROM pop_stock WHERE product_id = ? AND location = ? FOR UPDATE",
    [productId, location],
  );
  if (rows.length === 0) return 0;
  return Number(rows[0].quantity) || 0;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const cids = resolveMaterialPopCids(auth.payload);
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type");
    const q = (searchParams.get("q") || "").trim();
    const client = searchParams.get("client");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const location = searchParams.get("location");
    const limit = Math.min(Number(searchParams.get("limit")) || 50, 500);
    const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

    const params: any[] = [];
    let where = "WHERE 1=1";

    if (cids !== null) {
      where += " AND m.cids = ?";
      params.push(cids);
    }

    if (type && VALID_TYPE.includes(type)) {
      where += " AND m.type = ?";
      params.push(type);
    }

    if (q) {
      where += " AND (p.name LIKE ? OR p.code LIKE ? OR m.client_name LIKE ?)";
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }

    if (client) {
      where += " AND m.client_name LIKE ?";
      params.push(`%${client}%`);
    }

    if (from) {
      where += " AND m.movement_date >= ?";
      params.push(from);
    }

    if (to) {
      where += " AND m.movement_date <= ?";
      params.push(to);
    }

    if (location && VALID_LOCATION.includes(location)) {
      where += " AND (m.location = ? OR m.source_location = ? OR m.target_location = ?)";
      params.push(location, location, location);
    }

    const countRes = await query(
      `SELECT COUNT(*) AS total
       FROM pop_movements m
       JOIN pop_products p ON m.product_id = p.id
       ${where}`,
      params,
    );

    const res = await query(
      `SELECT
        m.*,
        p.name as product_name,
        p.code as product_code
       FROM pop_movements m
       JOIN pop_products p ON m.product_id = p.id
       ${where}
       ORDER BY m.movement_date DESC, m.id DESC
         LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return NextResponse.json({
      success: true,
      movements: res.rows,
      pagination: { total: Number(countRes.rows[0]?.total || 0), limit, offset },
    });
  } catch (error: any) {
    console.error("Error listando movimientos POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let conn: any;
  try {
    const auth = await requireAdminLeadsValencia(request);
    if (auth.error) return auth.error;

    const body = await request.json();
    const type = String(body?.type || "").trim();

    if (!VALID_TYPE.includes(type)) {
      return NextResponse.json(
        { error: "Tipo de movimiento inválido" },
        { status: 400 },
      );
    }

    const productId = Number(body?.productId);
    if (!Number.isFinite(productId)) {
      return NextResponse.json(
        { error: "Selecciona un producto" },
        { status: 400 },
      );
    }

    const cids = resolveMaterialPopCids(auth.payload);
    const userId = auth.payload?.uid || auth.payload?.id || null;
    const userName = auth.payload?.name || "Usuario";
    const clientId = body?.clientId ? Number(body.clientId) : null;
    let verifiedClientName: string | null = null;

    if (type === "exit" && String(body?.reasonType || "cliente") === "cliente") {
      if (clientId === null || !Number.isInteger(clientId) || clientId <= 0) {
        return NextResponse.json({ error: "Selecciona un cliente de Odoo" }, { status: 400 });
      }
      const validatedClientId = clientId as number;

      const clients = await callOdooRPC<any[]>(
        "res.partner",
        "search_read",
        [[
          ["id", "=", validatedClientId],
          ["customer_rank", ">", 0],
          ["active", "=", true],
        ]],
        {
          fields: ["id", "name"],
          limit: 1,
          context: { allowed_company_ids: [cids ?? 9] },
        },
      );
      if (!clients?.length) {
        return NextResponse.json({ error: "El cliente no existe en Odoo" }, { status: 400 });
      }
      verifiedClientName = clients[0].name || null;
    }

    const movementDate = String(body?.movementDate || "").trim();
    if (!isValidMovementDate(movementDate)) {
      return NextResponse.json(
        { error: "Fecha inválida o futura (YYYY-MM-DD)" },
        { status: 400 },
      );
    }

    conn = await getConnection();
    await conn.beginTransaction();

    // Verificar que el producto existe y pertenece al cids
    const [prodCheck] = await conn.execute(
      `SELECT p.id, COALESCE(u.allows_decimal, 0) AS allows_decimal
       FROM pop_products p
       LEFT JOIN pop_uoms u ON u.id = p.uom_id
       WHERE p.id = ? AND p.is_active = 1 AND (p.cids = ? OR ? IS NULL)
       LIMIT 1`,
      [productId, cids, cids],
    );
    if (prodCheck.length === 0) {
      await conn.rollback();
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const allowsDecimal = Number(prodCheck[0].allows_decimal) === 1;

    const notas = truncar(body?.notes, 2000);

    if (type === "transfer") {
      const source = String(body?.sourceLocation || "").trim();
      const target = String(body?.targetLocation || "").trim();
      const quantity = Number(body?.quantity);

      if (
        !VALID_LOCATION.includes(source) ||
        !VALID_LOCATION.includes(target) ||
        source === target
      ) {
        await conn.rollback();
        return NextResponse.json(
          { error: "Ubicaciones de origen y destino inválidas" },
          { status: 400 },
        );
      }

      const quantityError = validateQuantity(body?.quantity, allowsDecimal);
      if (quantityError) {
        await conn.rollback();
        return NextResponse.json(
          { error: quantityError },
          { status: 400 },
        );
      }

      await conn.execute(
        "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
        [productId, source],
      );
      await conn.execute(
        "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
        [productId, target],
      );
      const actualOrigen = await leerStock(conn, productId, source);
      if (actualOrigen < quantity) {
        await conn.rollback();
        return NextResponse.json(
          { error: `Stock insuficiente en origen (disponible: ${actualOrigen})` },
          { status: 400 },
        );
      }

      await cambiarStock(conn, productId, source, -quantity);
      await cambiarStock(conn, productId, target, quantity);

      await conn.execute(
        `INSERT INTO pop_movements
          (type, product_id, source_location, target_location, quantity, reason_type,
           created_by_user_id, created_by_name, cids, movement_date, notes)
         VALUES ('transfer', ?, ?, ?, ?, 'traslado interno', ?, ?, ?, ?, ?)`,
        [
          productId,
          source,
          target,
          quantity,
          userId,
          userName,
          cids,
          movementDate,
          notas,
        ],
      );

      await conn.commit();
      return NextResponse.json({ success: true });
    }

    if (type === "exit") {
      const location = String(body?.location || "").trim();
      const quantity = Number(body?.quantity);
      const useOtherLocation = body?.useOtherLocation === true;

      if (!VALID_LOCATION.includes(location)) {
        await conn.rollback();
        return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
      }

      const quantityError = validateQuantity(body?.quantity, allowsDecimal);
      if (quantityError) {
        await conn.rollback();
        return NextResponse.json({ error: quantityError }, { status: 400 });
      }

      const otherLocation = location === "office" ? "warehouse" : "office";
      await conn.execute(
        "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
        [productId, location],
      );
      if (useOtherLocation) {
        await conn.execute(
          "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
          [productId, otherLocation],
        );
      }

      const actual = await leerStock(conn, productId, location);
      const otherActual = useOtherLocation ? await leerStock(conn, productId, otherLocation) : 0;
      if (actual + otherActual < quantity) {
        await conn.rollback();
        return NextResponse.json(
          { error: `Stock insuficiente (disponible total: ${actual + otherActual})` },
          { status: 400 },
        );
      }

      const reasonType = truncar(body?.reasonType, 50) || "cliente";
      const reasonCustom = truncar(body?.reasonCustom, 255);
      const clientName = verifiedClientName || truncar(body?.clientName, 255);
      const destination = truncar(body?.destination, 255);
      if (!["cliente", "uso_interno", "evento", "campana"].includes(reasonType)) {
        await conn.rollback();
        return NextResponse.json({ error: "Tipo de salida inválido" }, { status: 400 });
      }
      if (reasonType !== "cliente" && !destination) {
        await conn.rollback();
        return NextResponse.json({ error: "Indica el destino de la salida" }, { status: 400 });
      }
      const movementGroupId = useOtherLocation && actual < quantity ? randomUUID() : null;
      const portions = [
        { location, quantity: Math.min(actual, quantity) },
        ...(useOtherLocation && actual < quantity
          ? [{ location: otherLocation, quantity: quantity - actual }]
          : []),
      ].filter((portion) => portion.quantity > 0);

      for (const portion of portions) {
        await cambiarStock(conn, productId, portion.location, -portion.quantity);
        await conn.execute(
          `INSERT INTO pop_movements
            (movement_group_id, type, product_id, location, quantity, reason_type, reason_custom,
             client_id, client_name, client_cids, destination,
             created_by_user_id, created_by_name, cids, movement_date, notes)
           VALUES (?, 'exit', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            movementGroupId,
            productId,
            portion.location,
            portion.quantity,
            reasonType,
            reasonCustom,
            clientId,
            clientName,
            cids,
            destination,
            userId,
            userName,
            cids,
            movementDate,
            notas,
          ],
        );
      }

      await conn.commit();
      return NextResponse.json({ success: true });
    }

    // entry y adjustment: ambos modifican un stock en una ubicación.
    const location = String(body?.location || "").trim();
    if (!VALID_LOCATION.includes(location)) {
      await conn.rollback();
      return NextResponse.json({ error: "Ubicación inválida" }, { status: 400 });
    }

    let delta: number;

    if (type === "entry") {
      const quantity = Number(body?.quantity);
      const quantityError = validateQuantity(body?.quantity, allowsDecimal);
      if (quantityError) {
        await conn.rollback();
        return NextResponse.json({ error: quantityError }, { status: 400 });
      }
      delta = quantity;
    } else {
      // adjustment: el body manda `newQuantity` (cantidad real contada)
      const newQuantity = Number(body?.newQuantity);
      const quantityError = validateNonNegativeQuantity(body?.newQuantity, allowsDecimal);
      if (quantityError) {
        await conn.rollback();
        return NextResponse.json({ error: quantityError }, { status: 400 });
      }
      const actual = await leerStock(conn, productId, location);
      delta = newQuantity - actual;
    }

    if (delta !== 0) {
      await cambiarStock(conn, productId, location, delta);
    }

    const reasonType = truncar(body?.reasonType, 50) || (type === "entry" ? "compra" : "ajuste");
    const reasonCustom = truncar(body?.reasonCustom, 255);

    await conn.execute(
      `INSERT INTO pop_movements
        (type, product_id, location, quantity, reason_type, reason_custom,
         created_by_user_id, created_by_name, cids, movement_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        productId,
        location,
        Math.abs(delta),
        reasonType,
        reasonCustom,
        userId,
        userName,
        cids,
        movementDate,
        notas,
      ],
    );

    await conn.commit();

    return NextResponse.json({
      success: true,
      type,
      delta,
      stock: await leerStock(conn, productId, location),
    });
  } catch (error: any) {
    if (conn) await conn.rollback();
    console.error("Error registrando movimiento POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
