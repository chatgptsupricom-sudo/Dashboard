import { query, getConnection } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import {
  requireAdminLeadsValencia,
  resolveMaterialPopCids,
} from "@/lib/adminleads/material-pop/auth";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { cambiarStock, leerStock } from "@/lib/adminleads/material-pop/stock";
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

/**
 * Un movimiento puede llevar varios productos.
 *
 * El body acepta `items: [{ productId, quantity | newQuantity }]`. Lo que es
 * del movimiento y no del producto —tipo, ubicación, motivo, cliente, fecha y
 * notas— sigue viniendo suelto y se aplica a todos por igual. Se mantiene el
 * formato viejo de un solo `productId` para no romper a nadie que ya lo use.
 *
 * Todos los productos entran en la MISMA transacción: si uno falla por stock
 * insuficiente no se aplica ninguno. Cuando hay más de uno comparten
 * `movement_group_id`, la columna que ya existía para las salidas partidas
 * entre dos ubicaciones, así el historial puede mostrarlos juntos.
 */

interface ItemMovimiento {
  productId: number;
  quantity?: any;
  newQuantity?: any;
}

/** Error de validación de negocio: corta el bucle y revierte la transacción. */
class ErrorMovimiento extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_ITEMS = 50;

function leerItems(body: any): ItemMovimiento[] {
  const crudos = Array.isArray(body?.items) && body.items.length > 0
    ? body.items
    : [{ productId: body?.productId, quantity: body?.quantity, newQuantity: body?.newQuantity }];

  if (crudos.length > MAX_ITEMS) {
    throw new ErrorMovimiento(`Máximo ${MAX_ITEMS} productos por movimiento`);
  }

  const items: ItemMovimiento[] = crudos.map((it: any) => ({
    productId: Number(it?.productId),
    quantity: it?.quantity,
    newQuantity: it?.newQuantity,
  }));

  if (items.some((it) => !Number.isFinite(it.productId))) {
    throw new ErrorMovimiento("Selecciona un producto");
  }
  const ids = new Set(items.map((it) => it.productId));
  if (ids.size !== items.length) {
    // Dos filas del mismo producto dejan un stock final ambiguo y dos
    // movimientos que parecen duplicados en el historial.
    throw new ErrorMovimiento("Hay un producto repetido en la lista");
  }
  return items;
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

    const items = leerItems(body);

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

    const notas = truncar(body?.notes, 2000);
    // Un solo producto no forma grupo: la columna queda NULL como antes.
    const grupoId = items.length > 1 ? randomUUID() : null;

    conn = await getConnection();
    await conn.beginTransaction();

    const resultados: { productId: number; delta: number }[] = [];

    for (const item of items) {
      const productId = item.productId;

      // Verificar que el producto existe y pertenece al cids
      const [prodCheck] = await conn.execute(
        `SELECT p.id, p.code, p.name, COALESCE(u.allows_decimal, 0) AS allows_decimal
         FROM pop_products p
         LEFT JOIN pop_uoms u ON u.id = p.uom_id
         WHERE p.id = ? AND p.is_active = 1 AND (p.cids = ? OR ? IS NULL)
         LIMIT 1`,
        [productId, cids, cids],
      );
      if (prodCheck.length === 0) {
        throw new ErrorMovimiento("Producto no encontrado", 404);
      }

      const allowsDecimal = Number(prodCheck[0].allows_decimal) === 1;
      // Los mensajes nombran el producto: con varios en el mismo movimiento,
      // "Stock insuficiente" a secas no dice cuál falló.
      const etiqueta = `${prodCheck[0].code} ${prodCheck[0].name}`.trim();

      if (type === "transfer") {
        const source = String(body?.sourceLocation || "").trim();
        const target = String(body?.targetLocation || "").trim();
        const quantity = Number(item.quantity);

        if (
          !VALID_LOCATION.includes(source) ||
          !VALID_LOCATION.includes(target) ||
          source === target
        ) {
          throw new ErrorMovimiento("Ubicaciones de origen y destino inválidas");
        }

        const quantityError = validateQuantity(item.quantity, allowsDecimal);
        if (quantityError) throw new ErrorMovimiento(`${etiqueta}: ${quantityError}`);

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
          throw new ErrorMovimiento(
            `${etiqueta}: stock insuficiente en origen (disponible: ${actualOrigen})`,
          );
        }

        await cambiarStock(conn, productId, source, -quantity);
        await cambiarStock(conn, productId, target, quantity);

        await conn.execute(
          `INSERT INTO pop_movements
            (movement_group_id, type, product_id, source_location, target_location, quantity,
             reason_type, created_by_user_id, created_by_name, cids, movement_date, notes)
           VALUES (?, 'transfer', ?, ?, ?, ?, 'traslado interno', ?, ?, ?, ?, ?)`,
          [
            grupoId,
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

        resultados.push({ productId, delta: quantity });
        continue;
      }

      if (type === "exit") {
        const location = String(body?.location || "").trim();
        const quantity = Number(item.quantity);
        const useOtherLocation = body?.useOtherLocation === true;

        if (!VALID_LOCATION.includes(location)) {
          throw new ErrorMovimiento("Ubicación inválida");
        }

        const quantityError = validateQuantity(item.quantity, allowsDecimal);
        if (quantityError) throw new ErrorMovimiento(`${etiqueta}: ${quantityError}`);

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
          throw new ErrorMovimiento(
            `${etiqueta}: stock insuficiente (disponible total: ${actual + otherActual})`,
          );
        }

        const reasonType = truncar(body?.reasonType, 50) || "cliente";
        const reasonCustom = truncar(body?.reasonCustom, 255);
        const clientName = verifiedClientName || truncar(body?.clientName, 255);
        const destination = truncar(body?.destination, 255);
        if (!["cliente", "uso_interno", "evento", "campana"].includes(reasonType)) {
          throw new ErrorMovimiento("Tipo de salida inválido");
        }
        if (reasonType !== "cliente" && !destination) {
          throw new ErrorMovimiento("Indica el destino de la salida");
        }
        // Una salida repartida entre dos ubicaciones también se agrupa, igual
        // que antes; si el movimiento ya tiene grupo, se reutiliza ese.
        const movementGroupId =
          grupoId || (useOtherLocation && actual < quantity ? randomUUID() : null);
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

        resultados.push({ productId, delta: -quantity });
        continue;
      }

      // entry y adjustment: ambos modifican un stock en una ubicación.
      const location = String(body?.location || "").trim();
      if (!VALID_LOCATION.includes(location)) {
        throw new ErrorMovimiento("Ubicación inválida");
      }

      let delta: number;

      if (type === "entry") {
        const quantityError = validateQuantity(item.quantity, allowsDecimal);
        if (quantityError) throw new ErrorMovimiento(`${etiqueta}: ${quantityError}`);
        delta = Number(item.quantity);
      } else {
        // adjustment: el item manda `newQuantity` (cantidad real contada)
        const quantityError = validateNonNegativeQuantity(item.newQuantity, allowsDecimal);
        if (quantityError) throw new ErrorMovimiento(`${etiqueta}: ${quantityError}`);
        const actual = await leerStock(conn, productId, location);
        delta = Number(item.newQuantity) - actual;
      }

      if (delta !== 0) {
        await cambiarStock(conn, productId, location, delta);
      }

      const reasonType = truncar(body?.reasonType, 50) || (type === "entry" ? "compra" : "ajuste");
      const reasonCustom = truncar(body?.reasonCustom, 255);

      await conn.execute(
        `INSERT INTO pop_movements
          (movement_group_id, type, product_id, location, quantity, reason_type, reason_custom,
           created_by_user_id, created_by_name, cids, movement_date, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          grupoId,
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

      resultados.push({ productId, delta });
    }

    await conn.commit();

    return NextResponse.json({ success: true, type, productos: resultados.length, resultados });
  } catch (error: any) {
    if (conn) await conn.rollback();
    if (error instanceof ErrorMovimiento) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("Error registrando movimiento POP:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (conn) conn.release();
  }
}
