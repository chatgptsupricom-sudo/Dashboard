import { query, getConnection } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { cambiarStock, leerStock } from "@/lib/adminleads/material-pop/stock";
import { randomUUID } from "node:crypto";

/**
 * Solicitudes de material POP de los vendedores.
 *
 * Flujo: el vendedor crea la solicitud (pendiente), el adminLeads la aprueba
 * —pudiendo recortar cantidades— o la rechaza, y más tarde la marca entregada.
 *
 * Aprobar RESERVA, no descuenta. La reserva no se guarda: es la suma de
 * `approved_quantity` de las solicitudes en estado 'aprobada'. Así no hay dos
 * números que puedan discrepar, y cancelar o rechazar libera la reserva sin
 * tener que acordarse de restar nada.
 *
 * El stock real baja al entregar, con los mismos movimientos de salida que
 * registra el adminLeads a mano; la solicitud guarda el `movement_group_id`
 * para poder ir de la orden al movimiento y al revés.
 */

export type EstadoSolicitud =
  | "pendiente"
  | "aprobada"
  | "rechazada"
  | "entregada"
  | "cancelada";

export interface SolicitudItem {
  productId: number;
  code: string;
  name: string;
  brand: string | null;
  /** Foto del producto, para saber qué se está pidiendo sin abrir el catálogo. */
  imageUrl: string | null;
  quantity: number;
  approvedQuantity: number | null;
  stockTotal: number;
  stockOffice: number;
  stockWarehouse: number;
  /** Comprometido en otras solicitudes aprobadas sin entregar. */
  reservadoOtras: number;
}

export interface Solicitud {
  id: number;
  code: string;
  sellerUserId: number | null;
  sellerName: string;
  clientId: number | null;
  clientName: string;
  deliveryCondition: "inmediata" | "al_comprar";
  odooOrderName: string | null;
  status: EstadoSolicitud;
  notes: string | null;
  reviewNotes: string | null;
  reviewedByName: string | null;
  reviewedAt: string | null;
  deliveredAt: string | null;
  movementGroupId: string | null;
  createdAt: string | null;
  items: SolicitudItem[];
}

const VALID_LOCATION = ["office", "warehouse"];

const n = (v: any): number => Number(v) || 0;

/**
 * Fecha/hora de MySQL a texto "YYYY-MM-DD HH:mm".
 *
 * mysql2 devuelve las columnas DATETIME como objetos Date, y `String(fecha)`
 * daba "Wed Sep 23 2026 14:02:11 GMT-0400": al recortar por el primer espacio
 * la pantalla mostraba "Wed" como fecha de autorización.
 */
function textoFecha(v: any): string | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v).replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return String(v);
  const p2 = (x: number) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

/** Cantidad comprometida por producto: solicitudes aprobadas sin entregar. */
export async function reservadoPorProducto(
  cids: number | null,
  excluirSolicitudId?: number,
): Promise<Map<number, number>> {
  const params: any[] = [];
  let where = "WHERE r.status = 'aprobada'";
  if (cids !== null) {
    where += " AND r.cids = ?";
    params.push(cids);
  }
  if (excluirSolicitudId) {
    where += " AND r.id <> ?";
    params.push(excluirSolicitudId);
  }
  const res = await query(
    `SELECT ri.product_id, SUM(ri.approved_quantity) AS reservado
     FROM pop_request_items ri
     JOIN pop_requests r ON r.id = ri.request_id
     ${where}
     GROUP BY ri.product_id`,
    params,
  );
  const map = new Map<number, number>();
  for (const row of res.rows || []) map.set(Number(row.product_id), n(row.reservado));
  return map;
}

export async function listarSolicitudes(opts: {
  cids: number | null;
  sellerUserId?: number | null;
  status?: string | null;
  id?: number;
}): Promise<Solicitud[]> {
  const params: any[] = [];
  let where = "WHERE 1=1";
  if (opts.cids !== null) {
    where += " AND r.cids = ?";
    params.push(opts.cids);
  }
  if (opts.sellerUserId) {
    where += " AND r.seller_user_id = ?";
    params.push(opts.sellerUserId);
  }
  if (opts.status) {
    where += " AND r.status = ?";
    params.push(opts.status);
  }
  if (opts.id) {
    where += " AND r.id = ?";
    params.push(opts.id);
  }

  const cabeceras = await query(
    `SELECT r.* FROM pop_requests r ${where}
     ORDER BY FIELD(r.status, 'pendiente', 'aprobada', 'entregada', 'rechazada', 'cancelada'),
              r.created_at DESC`,
    params,
  );
  const filas = cabeceras.rows || [];
  if (filas.length === 0) return [];

  const ids = filas.map((r: any) => Number(r.id));
  const marcadores = ids.map(() => "?").join(",");
  const detalle = await query(
    `SELECT ri.*, p.code, p.name, p.brand, p.image_id,
            COALESCE(SUM(CASE WHEN s.location = 'office' THEN s.quantity END), 0) AS stock_office,
            COALESCE(SUM(CASE WHEN s.location = 'warehouse' THEN s.quantity END), 0) AS stock_warehouse,
            COALESCE(SUM(s.quantity), 0) AS stock_total
     FROM pop_request_items ri
     JOIN pop_products p ON p.id = ri.product_id
     LEFT JOIN pop_stock s ON s.product_id = ri.product_id
     WHERE ri.request_id IN (${marcadores})
     GROUP BY ri.id
     ORDER BY p.name ASC`,
    ids,
  );

  const reservado = await reservadoPorProducto(opts.cids);

  const porSolicitud = new Map<number, SolicitudItem[]>();
  for (const row of detalle.rows || []) {
    const requestId = Number(row.request_id);
    const propio = row.approved_quantity == null ? 0 : n(row.approved_quantity);
    const lista = porSolicitud.get(requestId) || [];
    lista.push({
      productId: Number(row.product_id),
      code: row.code || "",
      name: row.name || "",
      brand: row.brand || null,
      imageUrl: row.image_id ? `/api/adminleads/material-pop/images/${row.image_id}` : null,
      quantity: n(row.quantity),
      approvedQuantity: row.approved_quantity == null ? null : n(row.approved_quantity),
      stockTotal: n(row.stock_total),
      stockOffice: n(row.stock_office),
      stockWarehouse: n(row.stock_warehouse),
      // Lo comprometido por OTRAS solicitudes: a esta hay que descontarle lo
      // suyo, si ya está aprobada, o mostraría su propia reserva como ajena.
      reservadoOtras: Math.max(0, (reservado.get(Number(row.product_id)) || 0) - propio),
    });
    porSolicitud.set(requestId, lista);
  }

  return filas.map((r: any) => ({
    id: Number(r.id),
    code: r.code || `SOL-${r.id}`,
    sellerUserId: r.seller_user_id == null ? null : Number(r.seller_user_id),
    sellerName: r.seller_name || "",
    clientId: r.client_id == null ? null : Number(r.client_id),
    clientName: r.client_name || "",
    deliveryCondition: r.delivery_condition,
    odooOrderName: r.odoo_order_name || null,
    status: r.status,
    notes: r.notes || null,
    reviewNotes: r.review_notes || null,
    reviewedByName: r.reviewed_by_name || null,
    reviewedAt: textoFecha(r.reviewed_at),
    deliveredAt: textoFecha(r.delivered_at),
    movementGroupId: r.movement_group_id || null,
    createdAt: textoFecha(r.created_at),
    items: porSolicitud.get(Number(r.id)) || [],
  }));
}

/** Error de negocio: el endpoint lo traduce a un 400 con su mensaje. */
export class ErrorSolicitud extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function crearSolicitud(opts: {
  cids: number;
  sellerUserId: number | null;
  sellerName: string;
  sellerOdooId: number | null;
  clientId: number;
  clientName: string;
  deliveryCondition: "inmediata" | "al_comprar";
  odooOrderName: string | null;
  notes: string | null;
  items: { productId: number; quantity: number }[];
}): Promise<{ id: number; code: string }> {
  if (opts.items.length === 0) throw new ErrorSolicitud("Agrega al menos un producto");
  if (opts.items.some((it) => !Number.isFinite(it.productId) || !(it.quantity > 0))) {
    throw new ErrorSolicitud("Cantidad inválida");
  }
  if (new Set(opts.items.map((it) => it.productId)).size !== opts.items.length) {
    throw new ErrorSolicitud("Hay un producto repetido en la solicitud");
  }
  if (opts.deliveryCondition === "al_comprar" && !opts.odooOrderName) {
    throw new ErrorSolicitud("Indica la orden de Odoo: el material se entrega contra la compra");
  }

  let conn: any;
  try {
    conn = await getConnection();
    await conn.beginTransaction();

    const [ins] = await conn.execute(
      `INSERT INTO pop_requests
        (seller_user_id, seller_name, seller_odoo_id, client_id, client_name,
         delivery_condition, odoo_order_name, status, notes, cids)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente', ?, ?)`,
      [
        opts.sellerUserId,
        opts.sellerName.slice(0, 255),
        opts.sellerOdooId,
        opts.clientId,
        opts.clientName.slice(0, 255),
        opts.deliveryCondition,
        opts.odooOrderName ? opts.odooOrderName.slice(0, 50) : null,
        opts.notes,
        opts.cids,
      ],
    );
    const id = Number(ins.insertId);
    // El código sale del id ya asignado: dos solicitudes simultáneas no pueden
    // pelearse el mismo número, como pasaría contando filas antes de insertar.
    const code = `SOL-${String(id).padStart(4, "0")}`;
    await conn.execute("UPDATE pop_requests SET code = ? WHERE id = ?", [code, id]);

    for (const item of opts.items) {
      const [prod] = await conn.execute(
        "SELECT id FROM pop_products WHERE id = ? AND is_active = 1 AND cids = ? LIMIT 1",
        [item.productId, opts.cids],
      );
      if (prod.length === 0) throw new ErrorSolicitud("Producto no encontrado", 404);
      await conn.execute(
        "INSERT INTO pop_request_items (request_id, product_id, quantity) VALUES (?, ?, ?)",
        [id, item.productId, item.quantity],
      );
    }

    await conn.commit();
    return { id, code };
  } catch (e) {
    if (conn) await conn.rollback();
    throw e;
  } finally {
    if (conn) conn.release();
  }
}

export async function cancelarSolicitud(opts: {
  id: number;
  cids: number | null;
  sellerUserId: number | null;
}): Promise<void> {
  const params: any[] = [opts.id];
  let where = "id = ?";
  if (opts.cids !== null) {
    where += " AND cids = ?";
    params.push(opts.cids);
  }
  if (opts.sellerUserId) {
    where += " AND seller_user_id = ?";
    params.push(opts.sellerUserId);
  }
  const res = await query(`SELECT status FROM pop_requests WHERE ${where} LIMIT 1`, params);
  const actual = res.rows?.[0];
  if (!actual) throw new ErrorSolicitud("Solicitud no encontrada", 404);
  // Pendiente no tiene nada tomado; aprobada sí, pero como la reserva es
  // derivada, cancelar la libera solo con cambiar el estado. Entregada ya movió
  // stock: para esa hay que revertir la entrega primero.
  if (actual.status !== "pendiente" && actual.status !== "aprobada") {
    throw new ErrorSolicitud(
      actual.status === "entregada"
        ? "La solicitud ya se entregó: revierte la entrega antes de cancelarla"
        : `La solicitud ya está ${actual.status}`,
    );
  }
  await query("UPDATE pop_requests SET status = 'cancelada' WHERE id = ?", [opts.id]);
}

export async function revisarSolicitud(opts: {
  id: number;
  cids: number | null;
  accion: "aprobar" | "rechazar";
  /** Cantidad autorizada por producto. Vacío = se aprueba lo pedido. */
  aprobadas?: Record<string, number>;
  notas: string | null;
  revisorId: number | null;
  revisorNombre: string;
}): Promise<void> {
  const [solicitud] = await listarSolicitudes({ cids: opts.cids, id: opts.id });
  if (!solicitud) throw new ErrorSolicitud("Solicitud no encontrada", 404);
  if (solicitud.status !== "pendiente") {
    throw new ErrorSolicitud(`La solicitud ya está ${solicitud.status}`);
  }

  if (opts.accion === "rechazar") {
    if (!opts.notas) throw new ErrorSolicitud("Indica el motivo del rechazo");
    await query(
      `UPDATE pop_requests
       SET status = 'rechazada', review_notes = ?, reviewed_by_user_id = ?,
           reviewed_by_name = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [opts.notas.slice(0, 500), opts.revisorId, opts.revisorNombre.slice(0, 255), opts.id],
    );
    return;
  }

  const aprobadas = opts.aprobadas || {};
  const conCantidad = solicitud.items.map((it) => {
    const pedida = it.quantity;
    const valor = aprobadas[String(it.productId)];
    const cantidad = valor === undefined ? pedida : Number(valor);
    if (!Number.isFinite(cantidad) || cantidad < 0) {
      throw new ErrorSolicitud(`${it.code}: cantidad aprobada inválida`);
    }
    // Se puede aprobar MÁS de lo pedido: el adminLeads conoce el stock y la
    // campaña, y a veces conviene mandar más de lo que el vendedor pidió. El
    // único techo real es el material libre.
    //
    // Aprobar reserva material, así que no puede comprometer lo que ya está
    // comprometido en otra solicitud.
    const disponible = it.stockTotal - it.reservadoOtras;
    if (cantidad > disponible) {
      throw new ErrorSolicitud(
        `${it.code}: solo hay ${disponible} disponible (stock ${it.stockTotal}, reservado ${it.reservadoOtras})`,
      );
    }
    return { productId: it.productId, cantidad };
  });

  if (conCantidad.every((it) => it.cantidad === 0)) {
    throw new ErrorSolicitud("Aprobar con todo en cero no tiene sentido: rechaza la solicitud");
  }

  let conn: any;
  try {
    conn = await getConnection();
    await conn.beginTransaction();
    for (const it of conCantidad) {
      await conn.execute(
        "UPDATE pop_request_items SET approved_quantity = ? WHERE request_id = ? AND product_id = ?",
        [it.cantidad, opts.id, it.productId],
      );
    }
    await conn.execute(
      `UPDATE pop_requests
       SET status = 'aprobada', review_notes = ?, reviewed_by_user_id = ?,
           reviewed_by_name = ?, reviewed_at = NOW()
       WHERE id = ?`,
      [opts.notas ? opts.notas.slice(0, 500) : null, opts.revisorId, opts.revisorNombre.slice(0, 255), opts.id],
    );
    await conn.commit();
  } catch (e) {
    if (conn) await conn.rollback();
    throw e;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Marca la solicitud como entregada y descuenta el stock con movimientos de
 * salida, uno por producto, todos bajo el mismo `movement_group_id`.
 */
export async function entregarSolicitud(opts: {
  id: number;
  cids: number | null;
  location: string;
  revisorId: number | null;
  revisorNombre: string;
}): Promise<{ movementGroupId: string }> {
  if (!VALID_LOCATION.includes(opts.location)) {
    throw new ErrorSolicitud("Ubicación inválida");
  }
  const [solicitud] = await listarSolicitudes({ cids: opts.cids, id: opts.id });
  if (!solicitud) throw new ErrorSolicitud("Solicitud no encontrada", 404);
  if (solicitud.status !== "aprobada") {
    throw new ErrorSolicitud("Solo se entrega una solicitud aprobada");
  }

  const hoy = new Date();
  const movementDate = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;
  const movementGroupId = randomUUID();

  let conn: any;
  try {
    conn = await getConnection();
    await conn.beginTransaction();

    for (const item of solicitud.items) {
      const cantidad = item.approvedQuantity ?? 0;
      if (cantidad <= 0) continue;

      await conn.execute(
        "INSERT IGNORE INTO pop_stock (product_id, location, quantity) VALUES (?, ?, 0)",
        [item.productId, opts.location],
      );
      const disponible = await leerStock(conn, item.productId, opts.location);
      if (disponible < cantidad) {
        throw new ErrorSolicitud(
          `${item.code}: stock insuficiente en ${opts.location === "office" ? "Oficina" : "Almacén"} (disponible: ${disponible})`,
        );
      }

      await cambiarStock(conn, item.productId, opts.location, -cantidad);
      await conn.execute(
        `INSERT INTO pop_movements
          (movement_group_id, type, product_id, location, quantity, reason_type, reason_custom,
           client_id, client_name, client_cids, created_by_user_id, created_by_name,
           cids, movement_date, notes)
         VALUES (?, 'exit', ?, ?, ?, 'cliente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movementGroupId,
          item.productId,
          opts.location,
          cantidad,
          `Solicitud ${solicitud.code}`,
          solicitud.clientId,
          solicitud.clientName,
          null,
          opts.revisorId,
          opts.revisorNombre.slice(0, 255),
          opts.cids ?? 9,
          movementDate,
          `Entrega de la solicitud ${solicitud.code} · vendedor ${solicitud.sellerName}`,
        ],
      );
    }

    await conn.execute(
      `UPDATE pop_requests
       SET status = 'entregada', delivered_at = NOW(), movement_group_id = ?
       WHERE id = ?`,
      [movementGroupId, opts.id],
    );

    await conn.commit();
    return { movementGroupId };
  } catch (e) {
    if (conn) await conn.rollback();
    throw e;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Deshace una entrega: devuelve el material al stock y la solicitud a
 * 'aprobada', con la reserva otra vez tomada.
 *
 * El stock se repone con movimientos de ENTRADA que espejan las salidas, no
 * editando `pop_stock` a mano: el historial tiene que mostrar que el material
 * salió y volvió. Un inventario que cuadra con un historial que no lo explica
 * es peor que uno descuadrado, porque nadie lo detecta.
 */
export async function revertirEntrega(opts: {
  id: number;
  cids: number | null;
  revisorId: number | null;
  revisorNombre: string;
  motivo: string | null;
}): Promise<void> {
  const [solicitud] = await listarSolicitudes({ cids: opts.cids, id: opts.id });
  if (!solicitud) throw new ErrorSolicitud("Solicitud no encontrada", 404);
  if (solicitud.status !== "entregada") {
    throw new ErrorSolicitud("Solo se revierte una solicitud entregada");
  }

  // Las salidas de la entrega dicen de qué ubicación salió cada producto: la
  // devolución entra por la misma, no por una elegida al azar.
  const salidas = await query(
    `SELECT product_id, location, quantity
     FROM pop_movements
     WHERE movement_group_id = ? AND type = 'exit'`,
    [solicitud.movementGroupId],
  );
  const filas = salidas.rows || [];
  if (filas.length === 0) {
    throw new ErrorSolicitud("No se encontraron los movimientos de la entrega");
  }

  const hoy = new Date();
  const movementDate = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`;

  let conn: any;
  try {
    conn = await getConnection();
    await conn.beginTransaction();

    for (const fila of filas) {
      const productId = Number(fila.product_id);
      const location = String(fila.location || "office");
      const cantidad = n(fila.quantity);
      if (cantidad <= 0) continue;

      await cambiarStock(conn, productId, location, cantidad);
      await conn.execute(
        `INSERT INTO pop_movements
          (movement_group_id, type, product_id, location, quantity, reason_type, reason_custom,
           created_by_user_id, created_by_name, cids, movement_date, notes)
         VALUES (?, 'entry', ?, ?, ?, 'devolucion', ?, ?, ?, ?, ?, ?)`,
        [
          solicitud.movementGroupId,
          productId,
          location,
          cantidad,
          `Reverso de la solicitud ${solicitud.code}`,
          opts.revisorId,
          opts.revisorNombre.slice(0, 255),
          opts.cids ?? 9,
          movementDate,
          opts.motivo
            ? `Reverso de la entrega de ${solicitud.code}: ${opts.motivo}`
            : `Reverso de la entrega de ${solicitud.code}`,
        ],
      );
    }

    // Vuelve a 'aprobada': el material queda reservado otra vez. Si además hay
    // que soltarlo, se cancela después — una acción por concepto.
    await conn.execute(
      `UPDATE pop_requests
       SET status = 'aprobada', delivered_at = NULL, movement_group_id = NULL
       WHERE id = ?`,
      [opts.id],
    );

    await conn.commit();
  } catch (e) {
    if (conn) await conn.rollback();
    throw e;
  } finally {
    if (conn) conn.release();
  }
}

/* ───────────────────────── Órdenes de Odoo ───────────────────────── */

export interface OrdenOdoo {
  id: number;
  name: string;
  clienteId: number | null;
  cliente: string;
  vendedor: string;
  fecha: string | null;
  estado: string;
  total: number;
  lineas: { producto: string; cantidad: number; subtotal: number }[];
}

const ESTADOS: Record<string, string> = {
  draft: "Cotización",
  sent: "Cotización enviada",
  sale: "Confirmada",
  done: "Cerrada",
  cancel: "Cancelada",
};

/** Órdenes de un vendedor, opcionalmente de un cliente puntual. */
export async function ordenesDeVendedor(opts: {
  companyIds: number[];
  odooUserId: number | null;
  partnerId?: number | null;
  limit?: number;
}): Promise<{ id: number; name: string; cliente: string; fecha: string | null; estado: string; total: number }[]> {
  const dom: any[] = [["company_id", "in", opts.companyIds]];
  if (opts.odooUserId) dom.push(["user_id", "=", opts.odooUserId]);
  if (opts.partnerId) dom.push(["partner_id", "=", opts.partnerId]);

  const ordenes =
    (await callOdooRPC<any[]>("sale.order", "search_read", [dom], {
      fields: ["id", "name", "partner_id", "date_order", "state", "amount_total"],
      limit: Math.min(opts.limit || 30, 100),
      order: "date_order desc",
    })) || [];

  return ordenes.map((o: any) => ({
    id: o.id,
    name: o.name || "",
    cliente: o.partner_id?.[1] || "",
    fecha: o.date_order ? String(o.date_order).split(/[ T]/)[0] : null,
    estado: ESTADOS[o.state] || o.state || "",
    total: Math.round((Number(o.amount_total) || 0) * 100) / 100,
  }));
}

/** Una orden por nombre, con sus renglones. `null` si no existe en el alcance. */
export async function leerOrden(
  name: string,
  companyIds: number[],
): Promise<OrdenOdoo | null> {
  const limpio = (name || "").trim();
  if (!limpio) return null;

  const ordenes =
    (await callOdooRPC<any[]>(
      "sale.order",
      "search_read",
      [[["name", "=", limpio], ["company_id", "in", companyIds]]],
      {
        fields: ["id", "name", "partner_id", "user_id", "date_order", "state", "amount_total", "order_line"],
        limit: 1,
      },
    )) || [];
  if (ordenes.length === 0) return null;
  const o = ordenes[0];

  const lineIds = (o.order_line || []).slice(0, 200);
  const lineas = lineIds.length
    ? (await callOdooRPC<any[]>(
        "sale.order.line",
        "read",
        [lineIds],
        { fields: ["name", "product_uom_qty", "price_subtotal"] },
      )) || []
    : [];

  return {
    id: o.id,
    name: o.name || "",
    clienteId: o.partner_id?.[0] ?? null,
    cliente: o.partner_id?.[1] || "",
    vendedor: o.user_id?.[1] || "",
    fecha: o.date_order ? String(o.date_order).split(/[ T]/)[0] : null,
    estado: ESTADOS[o.state] || o.state || "",
    total: Math.round((Number(o.amount_total) || 0) * 100) / 100,
    lineas: lineas.map((l: any) => ({
      producto: String(l.name || "").split("\n")[0],
      cantidad: Number(l.product_uom_qty) || 0,
      subtotal: Math.round((Number(l.price_subtotal) || 0) * 100) / 100,
    })),
  };
}
