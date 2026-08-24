import { query, getConnection } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/servicio-tecnico/ticket
// Crea un ticket publico del portal RMA. Sin sesion.
//
// Reglas de seguridad (issue #22):
//   1. NO confiamos en nada que mande el cliente sobre el producto o el cliente.
//      Re-resolvemos en el servidor contra Odoo con el numero de factura.
//   2. Validamos que el serial/producto realmente pertenezca a esa factura.
//   3. case_number: MAX_RETRIES con backoff para evitar condicion de carrera.
//   4. tracking_token: 32 bytes random (no uuid v4: queremos mas entropia).
//   5. tracking_token: UNIQUE en la tabla, asi si hay colision reintentamos.
//
// Body esperado (JSON):
//   {
//     invoice_number:   string (requerido, formato segun compania)
//     product_code:     string (codigo del producto a reportar)
//     odoo_product_id:  number (id de Odoo, OPCIONAL pero recomendado)
//     serial:           string (serial exacto del despacho, OPCIONAL)
//     client_phone:     string (telefono de contacto)
//     reported_fault:   string (descripcion de la falla)
//     company_id:       number (id de la compania en Odoo, default 9)
//     ticket_id:        number (id del ticket si ya existe pre-creado por #21,
//                                 OPCIONAL — para enlazar adjuntos ya subidos)
//   }

const MAX_RETRIES = 5;

// Genera el siguiente case_number consultando el maximo actual.
// Si dos requests obtienen el mismo numero, el INSERT va a fallar por UNIQUE
// y reintentamos. Esto es preferible a un lock de tabla porque el portal
// publico va a tener picos de carga impredecibles.
async function nextCaseNumber(conn: any): Promise<string> {
  const result = await conn.execute(
    `SELECT case_number FROM rma_cases ORDER BY id DESC LIMIT 1`
  );
  const rows = (result.rows as any[]) || [];
  let nextNum = 1;
  if (rows.length > 0) {
    const lastNum = parseInt(rows[0].case_number, 10);
    if (!Number.isFinite(lastNum)) {
      // Si el case_number no es numerico (caso legacy), seguimos con count().
      const countResult = await conn.execute(`SELECT COUNT(*) AS total FROM rma_cases`);
      nextNum = ((countResult.rows as any[])?.[0]?.total || 0) + 1;
    } else {
      nextNum = lastNum + 1;
    }
  }
  return String(nextNum).padStart(4, "0");
}

// Genera un token de seguimiento: 32 bytes random en hex.
// crypto.randomBytes es cryptographically secure.
function generateTrackingToken(): string {
  return randomBytes(32).toString("hex");
}

// Re-resuelve el partner y producto desde Odoo con el numero de factura.
// Cadena de Odoo (verificada contra produccion en issue #19):
//   account.move (invoice) -> account.move.line (display_type='product')
//   -> sale_line_ids -> sale.order.picking_ids (state='done')
//   -> stock.move.line.lot_id
//
// Trampas documentadas en #19:
//   - Formato de numero de factura varia por compania.
//   - Sin filtrar display_type='product', account.move.line devuelve el triple
//     de lineas (contrapartidas de costo).
//   - invoice_origin NO sirve como llave para encontrar el despacho.

interface OdooInvoiceLookup {
  partner_id: number;
  partner_name: string;
  products: Array<{
    product_id: number;
    product_code: string;
    product_name: string;
    brand: string;
    model: string;
    serials: string[];
    picking_id: number | null;
  }>;
}

async function lookupInvoice(
  invoiceNumber: string,
  companyId: number,
): Promise<OdooInvoiceLookup | null> {
  // 1. Buscar la factura
  const invoice = (await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[["name", "=", invoiceNumber], ["move_type", "=", "out_invoice"]]],
    { fields: ["id", "partner_id"], limit: 1 },
  )) as any[];

  if (!invoice || invoice.length === 0) return null;

  const inv = invoice[0];
  const partnerId = Array.isArray(inv.partner_id) ? inv.partner_id[0] : inv.partner_id;
  const partnerName = Array.isArray(inv.partner_id) ? inv.partner_id[1] : "";

  // 2. Buscar lineas de producto de esa factura
  const lines = (await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [[["move_id", "=", inv.id], ["display_type", "=", "product"]]],
    {
      fields: ["product_id", "quantity", "sale_line_ids"],
      limit: 50,
    },
  )) as any[];

  if (!lines || lines.length === 0) {
    return { partner_id: partnerId, partner_name: partnerName, products: [] };
  }

  // 3. Para cada linea, seguir a sale_line -> stock.move.line -> lot_id
  const products: OdooInvoiceLookup["products"] = [];

  for (const line of lines) {
    const productId = Array.isArray(line.product_id) ? line.product_id[0] : line.product_id;
    const productName = Array.isArray(line.product_id) ? line.product_id[1] : "";
    const productCode = line.product_id ? "" : "";
    const saleLineIds: number[] = line.sale_line_ids || [];

    if (saleLineIds.length === 0) continue;

    // Buscar los pickings done de la sale order
    const pickings = (await callOdooRPC<any[]>(
      "stock.move",
      "search_read",
      [[["sale_line_id", "in", saleLineIds], ["state", "=", "done"]]],
      { fields: ["id", "picking_id", "product_id"], limit: 1 },
    )) as any[];

    if (!pickings || pickings.length === 0) continue;

    const pickingId = pickings[0].picking_id
      ? (Array.isArray(pickings[0].picking_id) ? pickings[0].picking_id[0] : pickings[0].picking_id)
      : null;

    // Buscar los lots (seriales) del picking
    const moveLines = (await callOdooRPC<any[]>(
      "stock.move.line",
      "search_read",
      [[["picking_id", "=", pickingId], ["product_id", "=", productId]]],
      { fields: ["lot_id"], limit: 10 },
    )) as any[];

    const serials: string[] = [];
    for (const ml of moveLines || []) {
      if (ml.lot_id) {
        const lotName = Array.isArray(ml.lot_id) ? ml.lot_id[1] : "";
        if (lotName) serials.push(lotName);
      }
    }

    // Leer el product_code por separado (display_name ya da nombre, el codigo
    // interno es default_code)
    const productInfo = (await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["id", "=", productId]]],
      { fields: ["default_code", "name"], limit: 1 },
    )) as any[];
    const pCode = productInfo?.[0]?.default_code || "";
    const pName = productInfo?.[0]?.name || productName;

    products.push({
      product_id: productId,
      product_code: pCode,
      product_name: pName,
      brand: "",
      model: "",
      serials,
      picking_id: pickingId,
    });
  }

  return { partner_id: partnerId, partner_name: partnerName, products };
}

// Asegura que las columnas del portal existan (idempotente).
// Asi el portal funciona aunque no se haya corrido el ALTER manualmente.
async function ensurePortalColumns(conn: any) {
  const alters = [
    `ALTER TABLE rma_cases ADD COLUMN origen ENUM('interno','portal') DEFAULT 'interno'`,
    `ALTER TABLE rma_cases ADD COLUMN tracking_token VARCHAR(64) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN odoo_partner_id INT DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN odoo_product_id INT DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD COLUMN serial VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE rma_cases ADD INDEX idx_origen (origen)`,
  ];
  for (const sql of alters) {
    try {
      await conn.execute(sql);
    } catch (e: any) {
      if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) {
        console.error("[portal-ticket] ensurePortalColumns:", e.message);
      }
    }
  }
  try {
    await conn.execute(
      `ALTER TABLE rma_cases ADD UNIQUE INDEX uk_tracking_token (tracking_token)`,
    );
  } catch (e: any) {
    // Duplicate index o duplicate entry, ignorar.
    if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) {
      // Si falla por "Duplicate entry", significa que ya hay duplicados
      // y debemos limpiar primero. Pero en un deploy limpio esto no pasa.
      console.error("[portal-ticket] uk_tracking_token:", e.message);
    }
  }
}

export async function POST(request: NextRequest) {
  let conn: any;
  try {
    const body = await request.json();

    // Validacion basica. NO se valida aqui el serial/producto — eso lo hace
    // el cruce con Odoo mas abajo.
    const invoiceNumber = String(body.invoice_number || "").trim();
    const reportedFault = String(body.reported_fault || "").trim();
    const clientPhone = String(body.client_phone || "").trim();
    const companyId = parseInt(String(body.company_id || "9"), 10);
    const clientOdooProductId = body.odoo_product_id ? parseInt(String(body.odoo_product_id), 10) : null;
    const clientProductCode = String(body.product_code || "").trim();
    const clientSerial = String(body.serial || "").trim();
    const preTicketId = body.ticket_id ? parseInt(String(body.ticket_id), 10) : null;

    if (!invoiceNumber || invoiceNumber.length > 100) {
      return NextResponse.json({ error: "Numero de factura invalido" }, { status: 400 });
    }
    if (!reportedFault || reportedFault.length < 10) {
      return NextResponse.json(
        { error: "Describe la falla con al menos 10 caracteres" },
        { status: 400 },
      );
    }
    if (reportedFault.length > 5000) {
      return NextResponse.json(
        { error: "La descripcion no puede superar 5000 caracteres" },
        { status: 400 },
      );
    }
    if (clientPhone && clientPhone.length > 50) {
      return NextResponse.json({ error: "Telefono demasiado largo" }, { status: 400 });
    }

    // Paso 1: re-resolver contra Odoo. El cliente puede mentir en su navegador,
    // pero no puede mentir contra Odoo.
    const lookup = await lookupInvoice(invoiceNumber, companyId);
    if (!lookup) {
      // Mensaje generico (issue #25: no distinguir entre "no existe" y "no
      // verificaste bien" para no ayudar a enumerar facturas).
      return NextResponse.json(
        { error: "No encontramos esa factura o el dato de verificacion no coincide." },
        { status: 404 },
      );
    }

    // Paso 2: validar que el producto/serial reportado pertenece a la factura.
    // Si el cliente mando odoo_product_id y/o serial, validamos contra el lookup.
    let matchedProduct: OdooInvoiceLookup["products"][number] | null = null;

    if (clientOdooProductId) {
      matchedProduct = lookup.products.find((p) => p.product_id === clientOdooProductId) || null;
    } else if (clientProductCode) {
      matchedProduct = lookup.products.find(
        (p) => p.product_code.toLowerCase() === clientProductCode.toLowerCase(),
      ) || null;
    }

    if (!matchedProduct && lookup.products.length === 1) {
      matchedProduct = lookup.products[0];
    }

    if (!matchedProduct) {
      return NextResponse.json(
        {
          error:
            "El producto no pertenece a esta factura. Verifica que seleccionaste el correcto.",
        },
        { status: 400 },
      );
    }

    if (clientSerial && matchedProduct.serials.length > 0) {
      if (!matchedProduct.serials.includes(clientSerial)) {
        return NextResponse.json(
          { error: "El serial no corresponde a esta factura." },
          { status: 400 },
        );
      }
    }

    // Paso 3: abrir conexion y asegurar schema.
    conn = await getConnection();
    await ensurePortalColumns(conn);

    // Paso 4: intentar INSERT con reintentos (race condition del case_number).
    let caseId: number | null = null;
    let caseNumber: string | null = null;
    let trackingToken: string | null = null;
    let lastError: any = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Generar case_number y tracking_token frescos en cada intento.
        caseNumber = await nextCaseNumber(conn);
        trackingToken = generateTrackingToken();

        // created_by: nombre del cliente + "(portal)". Asi el tecnico ve de un
        // vistazo quien lo creo. El campo es NOT NULL y VARCHAR(200), asi que
        // nos cabe.
        const createdBy = `${lookup.partner_name} (portal)`;

        const insertResult = await conn.execute(
          `INSERT INTO rma_cases (
            case_number, product_code, hardware, brand, model,
            invoice_number, client_name, client_phone, serial_quantity,
            reported_fault, status, notes, company_id, created_by,
            origen, tracking_token, odoo_partner_id, odoo_product_id, serial
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido', NULL, ?, ?, 'portal', ?, ?, ?, ?)`,
          [
            caseNumber,
            matchedProduct.product_code || clientProductCode || null,
            matchedProduct.product_name || null,
            matchedProduct.brand || null,
            matchedProduct.model || null,
            invoiceNumber,
            lookup.partner_name,
            clientPhone || null,
            // serial_quantity es el campo viejo (texto libre). Mantenemos el
            // serial real en `serial` aparte, y dejamos serial_quantity con
            // lo que el cliente mando si lo mando (sirve para busqueda en el
            // modulo interno).
            clientSerial || matchedProduct.serials[0] || null,
            reportedFault,
            companyId,
            createdBy,
            trackingToken,
            lookup.partner_id,
            matchedProduct.product_id,
            clientSerial || matchedProduct.serials[0] || null,
          ],
        );

        caseId = (insertResult.rows as any)?.insertId;

        // Historial: el modulo interno espera que haya una fila en rma_history
        // al crear el caso, si no aparece sin historial en el panel.
        await conn.execute(
          `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
           VALUES (?, NULL, 'recibido', ?, 'Caso creado desde portal publico')`,
          [caseId, createdBy],
        );

        // Si habia adjuntos pre-subidos (preTicketId), enlazarlos al nuevo caso.
        if (preTicketId && caseId) {
          await conn.execute(
            `UPDATE rma_ticket_adjuntos SET ticket_id = ?, tracking_token = ? WHERE tracking_token = ?`,
            [caseId, trackingToken, preTicketId],
          );
        }

        break; // exito, salir del loop
      } catch (e: any) {
        lastError = e;
        const msg = e.message || "";
        const isDuplicate =
          msg.includes("Duplicate entry") && msg.includes("case_number");
        const isTokenDup =
          msg.includes("Duplicate entry") && msg.includes("tracking_token");
        if ((isDuplicate || isTokenDup) && attempt < MAX_RETRIES) {
          // Backoff lineal corto (50, 100, 150 ms) — la mayoria de las veces
          // el segundo intento ya pasa.
          await new Promise((r) => setTimeout(r, attempt * 50));
          continue;
        }
        // No es duplicado, o se acabaron los reintentos: propagar.
        throw e;
      }
    }

    if (!caseId || !caseNumber || !trackingToken) {
      // En teoria nunca llegamos aca, pero por seguridad.
      throw lastError || new Error("No se pudo generar el ticket");
    }

    return NextResponse.json(
      {
        success: true,
        case_id: caseId,
        case_number: caseNumber,
        tracking_token: trackingToken,
      },
      { status: 201 },
    );
  } catch (error: any) {
    // Mensaje generico al cliente. Detalle al log del servidor.
    console.error("[portal-ticket] POST error:", error.message, error.stack);
    return NextResponse.json(
      { error: "No pudimos procesar tu reporte. Intenta de nuevo." },
      { status: 500 },
    );
  } finally {
    if (conn) {
      try {
        await conn.close();
      } catch {}
    }
  }
}