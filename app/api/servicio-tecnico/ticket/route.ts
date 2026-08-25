import { getConnection, query } from "@/lib/db";
import {
  buscarFacturaConSeriales,
  type ItemFactura,
} from "@/lib/servicio-tecnico/factura";
import { verificarCaptcha } from "@/lib/servicio-tecnico/captcha";
import {
  aplicarLimites,
  consultarLimite,
  obtenerIp,
  registrarUso,
} from "@/lib/servicio-tecnico/limites";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";

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
  // conn.execute() devuelve [filas, campos]. Ojo: NO tiene .rows — eso lo pone
  // el wrapper `query()` de lib/db.ts, que sí desestructura. Leyendo .rows
  // sobre la conexión cruda sale siempre undefined.
  const [filas] = (await conn.execute(
    `SELECT case_number FROM rma_cases ORDER BY id DESC LIMIT 1`
  )) as [any[], any];

  let nextNum = 1;
  if (filas.length > 0) {
    const lastNum = parseInt(filas[0].case_number, 10);
    if (!Number.isFinite(lastNum)) {
      // Si el case_number no es numerico (caso legacy), seguimos con count().
      const [conteo] = (await conn.execute(
        `SELECT COUNT(*) AS total FROM rma_cases`
      )) as [any[], any];
      nextNum = (conteo?.[0]?.total || 0) + 1;
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

// La resolución contra Odoo vive en lib/servicio-tecnico/factura.ts, que es
// la misma que usa GET /api/servicio-tecnico/factura (issue #19). Es
// deliberado que sea una sola: si el formulario ofrece un item y este POST lo
// resuelve con otra lógica, el cliente elige algo válido y el envío falla.
//
// Eso pasaba con la versión anterior de este archivo, que reimplementaba la
// cadena: descartaba las líneas sin despacho hecho (`continue` cuando no había
// stock.move en estado done), y la factura INV/2026/06384 de Panamá tiene 3
// productos en esa situación. El cliente los veía en el formulario y acá se
// llevaba un 400.

// Asegura que las columnas del portal existan (idempotente).
// Asi el portal funciona aunque no se haya corrido el ALTER manualmente.
async function ensurePortalColumns(conn: any) {
  const alters = [
    // client_phone NO es una columna del portal: está en sql/rma_cases.sql
    // desde el principio y el módulo RMA interno también inserta en ella. Pero
    // faltaba en la base del entorno de prueba, así que el schema del repo y el
    // real habían divergido. Se incluye acá para que cualquier entorno con esa
    // misma laguna se arregle solo — si falta, no se puede guardar el teléfono
    // de contacto, que es la mitad del sentido de un reporte.
    `ALTER TABLE rma_cases ADD COLUMN client_phone VARCHAR(50) DEFAULT NULL`,
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
  // Dos límites distintos, y la diferencia importa.
  //
  // El primero es sobre INTENTOS y es holgado: un cliente que se equivoca
  // escribiendo el número de factura, o que no encuentra su producto a la
  // primera, no puede quedarse sin poder reportar por eso. Solo frena al que
  // martillea.
  const bloqueoIntentos = aplicarLimites(request, "ticket-intentos", [
    { max: 20, ventanaSegundos: 3600 },
  ]);
  if (bloqueoIntentos) return bloqueoIntentos;

  // El segundo es sobre tickets REALMENTE CREADOS, y ese sí es estricto: es el
  // que evita que llenen la bandeja del técnico. Se consulta acá sin gastar
  // cuota y se anota más abajo, solo si el ticket llegó a existir.
  //
  // Ojo con bajarlo: un cliente corporativo sale a internet por una sola IP, y
  // dos empleados con equipos distintos comparten este contador.
  const LIMITE_CREADOS = { max: 5, ventanaSegundos: 3600 };
  const bloqueoCreados = consultarLimite(request, "ticket-creado", LIMITE_CREADOS);
  if (bloqueoCreados) return bloqueoCreados;

  let conn: any;
  try {
    // Igual que en adjuntos: un cuerpo que no es JSON es culpa del que llama,
    // no un fallo del servidor.
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Peticion invalida" },
        { status: 400 },
      );
    }

    // Validacion basica. NO se valida aqui el serial/producto — eso lo hace
    // el cruce con Odoo mas abajo.
    const invoiceNumber = String(body.invoice_number || "").trim();
    const reportedFault = String(body.reported_fault || "").trim();
    const clientPhone = String(body.client_phone || "").trim();
    const clientOdooProductId = body.odoo_product_id ? parseInt(String(body.odoo_product_id), 10) : null;
    const clientProductCode = String(body.product_code || "").trim();
    const clientSerial = String(body.serial || "").trim();
    // Identificador del item tal como lo devuelve la consulta de factura.
    const clientItemId = String(body.item_id || "").trim();
    // Documento del cliente, opcional, para desambiguar (ver issue #25).
    const clientRif = String(body.rif || "").trim() || undefined;
    // Token temporal con el que el formulario subió los adjuntos antes de que
    // el ticket existiera. Es una cadena (uuid), no un id: la versión anterior
    // le hacía parseInt y quedaba en NaN, así que el UPDATE de más abajo nunca
    // corría y los adjuntos se quedaban huérfanos con ticket_id NULL.
    const uploadToken = String(body.upload_token || body.ticket_id || "").trim();

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

    // Captcha. Inerte mientras no haya TURNSTILE_SECRET_KEY configurada, así
    // que hoy no bloquea a nadie. Va antes de tocar Odoo: si no pasa, no
    // gastamos llamadas RPC contra producción.
    const captcha = await verificarCaptcha(
      typeof body.captcha_token === "string" ? body.captcha_token : undefined,
      obtenerIp(request),
    );
    if (!captcha.ok) {
      return NextResponse.json(
        { error: "No pudimos verificar que eres una persona. Intenta de nuevo." },
        { status: 400 },
      );
    }

    // Paso 1: re-resolver contra Odoo. El cliente puede mentir en su navegador,
    // pero no puede mentir contra Odoo.
    const resultado = await buscarFacturaConSeriales(invoiceNumber, clientRif);

    if (resultado.estado === "no_encontrada") {
      // Mensaje generico (issue #25: no distinguir entre "no existe" y "no
      // verificaste bien" para no ayudar a enumerar facturas).
      return NextResponse.json(
        { error: "No encontramos esa factura o el dato de verificacion no coincide." },
        { status: 404 },
      );
    }

    if (resultado.estado === "ambiguo") {
      // El formulario manda el numero exacto que devolvio la consulta, asi que
      // esto solo pasa si alguien llama al endpoint a mano con un numero
      // parcial. No decimos cuantas ni cuales coinciden.
      return NextResponse.json(
        {
          error:
            "No pudimos identificar tu factura de forma unica. Vuelve a intentarlo desde el formulario.",
        },
        { status: 400 },
      );
    }

    // Paso 2: validar que el item reportado pertenece a la factura.
    //
    // El identificador bueno es `item_id`, que la consulta ya devuelve por
    // item ("<linea>:<serial>"): es lo unico que distingue entre dos unidades
    // del mismo producto con seriales distintos. Se aceptan tambien
    // odoo_product_id / product_code + serial para no romper a quien ya
    // estuviera llamando asi.
    const items = resultado.items;
    let matched: ItemFactura | null = null;

    if (clientItemId) {
      matched = items.find((i) => i.id === clientItemId) || null;
    } else {
      const candidatos = clientOdooProductId
        ? items.filter((i) => i.producto_id === clientOdooProductId)
        : clientProductCode
          ? items.filter(
              (i) => i.codigo.toLowerCase() === clientProductCode.toLowerCase(),
            )
          : // Sin ningun identificador de producto solo se puede asumir el item
            // cuando la factura trae uno solo.
            items.length === 1
            ? items
            : [];

      if (clientSerial) {
        matched = candidatos.find((i) => i.serial === clientSerial) || null;
      } else if (candidatos.length === 1) {
        matched = candidatos[0];
      } else if (candidatos.length > 1) {
        // Varias unidades del mismo producto con seriales distintos: hay que
        // saber cual fallo, no se puede elegir por el cliente.
        return NextResponse.json(
          { error: "Indica el serial del equipo que presenta la falla." },
          { status: 400 },
        );
      }
    }

    if (!matched) {
      return NextResponse.json(
        {
          error:
            "El producto no pertenece a esta factura. Verifica que seleccionaste el correcto.",
        },
        { status: 400 },
      );
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
        const createdBy = `${resultado.cliente.nombre} (portal)`;

        const [insertResult] = (await conn.execute(
          `INSERT INTO rma_cases (
            case_number, product_code, hardware, brand, model,
            invoice_number, client_name, client_phone, serial_quantity,
            reported_fault, status, notes, company_id, created_by,
            origen, tracking_token, odoo_partner_id, odoo_product_id, serial
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido', NULL, ?, ?, 'portal', ?, ?, ?, ?)`,
          [
            caseNumber,
            matched.codigo || null,
            // hardware/brand/model siguen la convencion del modulo interno
            // (ver app/api/rma/products): hardware es la categoria, model es
            // el nombre del producto. La version anterior metia el nombre en
            // `hardware` y dejaba marca y modelo en NULL, y el caso salia
            // incompleto en el panel del tecnico.
            matched.categoria || null,
            matched.marca || null,
            matched.nombre || null,
            // El numero canonico de Odoo, no lo que escribio el cliente.
            resultado.factura.numero,
            resultado.cliente.nombre,
            clientPhone || null,
            // serial_quantity es el campo viejo (texto libre) que usa el
            // modulo interno para buscar. El serial real va aparte.
            matched.serial || null,
            reportedFault,
            // La compania sale de la factura. Antes venia del body con 9 por
            // defecto, asi que un reporte de una factura de Caracas quedaba
            // guardado como Valencia. La columna es NOT NULL con default 9, asi
            // que si Odoo no la trae caemos en ese mismo default en vez de
            // reventar el INSERT.
            resultado.factura.compania_id ?? 9,
            createdBy,
            trackingToken,
            resultado.partner_id,
            matched.producto_id,
            matched.serial || null,
          ],
        )) as [{ insertId: number }, any];

        caseId = insertResult?.insertId;

        if (!caseId) {
          throw new Error("El INSERT no devolvió insertId");
        }

        // Historial: el modulo interno espera que haya una fila en rma_history
        // al crear el caso, si no aparece sin historial en el panel.
        await conn.execute(
          `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
           VALUES (?, NULL, 'recibido', ?, 'Caso creado desde portal publico')`,
          [caseId, createdBy],
        );

        // Enlazar los adjuntos que ya se subieron con el token temporal, y
        // pasarlos al token definitivo del ticket (que es con el que después
        // se sirven).
        if (uploadToken && caseId) {
          await conn.execute(
            `UPDATE rma_ticket_adjuntos SET ticket_id = ?, tracking_token = ?
              WHERE tracking_token = ? AND ticket_id IS NULL`,
            [caseId, trackingToken, uploadToken],
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

    // Notificar por socket y disparar webhook de n8n (fire-and-forget).
    // No bloqueamos ni la respuesta ni la liberacion de la conexion: si fallan,
    // el ticket ya quedo guardado.
    if (typeof global !== "undefined" && (global as any).io) {
      try {
        (global as any).io.emit("rma_ticket_nuevo", {
          case_id: caseId,
          case_number: caseNumber,
          client_name: resultado.cliente.nombre,
          product: matched.nombre,
          invoice_number: invoiceNumber,
          origen: "portal",
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error("[portal-ticket] socket emit error:", e);
      }
    }

    if (process.env.N8N_LEAD_WEBHOOK_URL) {
      // No bloqueamos la respuesta. Si falla, el ticket ya se guardó.
      fetch(process.env.N8N_LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "rma_ticket_nuevo",
          origen: "portal",
          ticket: {
            case_id: caseId,
            case_number: caseNumber,
            tracking_token: trackingToken,
            client_name: resultado.cliente.nombre,
            client_phone: clientPhone,
            invoice_number: invoiceNumber,
            product_code: matched.codigo,
            product_name: matched.nombre,
            serial: matched.serial || null,
            reported_fault: reportedFault,
          },
        }),
      }).catch((err) => {
        console.error("[portal-ticket] n8n webhook error:", err.message);
      });
    }

    // Ahora sí: el ticket existe, se consume la cuota de creación.
    registrarUso(request, "ticket-creado", LIMITE_CREADOS);

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
        // release(), NO close(). En una conexión de pool de mysql2, close()
        // ni siquiera existe en la conexión base: lanza un TypeError que este
        // catch se tragaba, y la conexión nunca volvía al pool. Con
        // connectionLimit 40, waitForConnections y queueLimit 0, a los 40
        // reportes el pool quedaba vacío y CUALQUIER consulta del panel
        // —no solo las del portal— se quedaba encolada para siempre.
        conn.release();
      } catch (e: any) {
        console.error("[portal-ticket] release:", e?.message);
      }
    }
  }
}

// GET /api/servicio-tecnico/ticket?numero=...&factura=...
// Lookup manual para la pantalla de consulta (issue #23).
// El case_number solo no alcanza: son secuenciales (0001, 0002...) y cualquiera
// los itera. Por eso pedimos case_number + invoice_number (el segundo dato que
// solo el cliente que reporto conoce).
//
// Privacidad: mismo error generico para "no existe" y "dato de verificacion no
// coincide" — sin esto se vuelve una forma de enumerar tickets existentes.
const TICKET_NOT_FOUND = "No encontramos ese reporte";

function maskPhoneForResponse(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "****";
  return `****${digits.slice(-4)}`;
}

export async function GET(request: NextRequest) {
  try {
    const bloqueo = aplicarLimites(request, "ticket-consultar", [
      { max: 20, ventanaSegundos: 60 },
    ]);
    if (bloqueo) return bloqueo;

    const { searchParams } = new URL(request.url);
    const numero = searchParams.get("numero")?.trim() || "";
    const factura = searchParams.get("factura")?.trim() || "";

    if (!numero || !factura) {
      return NextResponse.json({ error: TICKET_NOT_FOUND }, { status: 400 });
    }

    if (numero.length > 20 || factura.length > 100) {
      return NextResponse.json({ error: TICKET_NOT_FOUND }, { status: 400 });
    }

    // Solo tickets del portal. Los internos no son accesibles publicamente.
    // Validamos case_number + invoice_number en una sola consulta para evitar
    // race conditions / enumeration.
    const caseResult = await query(
      `SELECT case_number, status, model, hardware, product_code, invoice_number,
              serial, created_at, client_phone
       FROM rma_cases
       WHERE case_number = ? AND invoice_number = ? AND origen = 'portal'
       LIMIT 1`,
      [numero, factura],
    );

    const rows = (caseResult as any).rows ?? caseResult;
    const row = Array.isArray(rows) ? rows[0] : null;

    if (!row) {
      return NextResponse.json({ error: TICKET_NOT_FOUND }, { status: 404 });
    }

    // Timeline
    const historyResult = await query(
      `SELECT from_status, to_status, created_at
       FROM rma_history
       WHERE case_id = (SELECT id FROM rma_cases WHERE case_number = ? AND invoice_number = ? LIMIT 1)
       ORDER BY created_at ASC`,
      [numero, factura],
    );
    const historyRows = (historyResult as any).rows ?? historyResult;

    return NextResponse.json({
      success: true,
      ticket: {
        case_number: row.case_number,
        status: row.status,
        // `model` es el nombre del producto y `hardware` la categoría, según la
        // convención del módulo interno. Mostrar hardware acá le enseñaba al
        // cliente "IMPRESORA" o "CONSUMIBLES" en vez de su producto.
        product_name: row.model || row.hardware || "",
        product_code: row.product_code || "",
        invoice_number: row.invoice_number || "",
        serial: row.serial || null,
        client_phone_masked: maskPhoneForResponse(row.client_phone),
        created_at: row.created_at,
        timeline: (Array.isArray(historyRows) ? historyRows : []).map(
          // Sin `changed_by`: en los cambios de estado posteriores es la
          // identidad del técnico que lo atendió, y esto es un endpoint
          // público. El cliente no necesita saber quién tocó su caso.
          (h: any) => ({
            from_status: h.from_status,
            to_status: h.to_status,
            created_at: h.created_at,
          }),
        ),
      },
    });
  } catch (error: any) {
    console.error("[portal-ticket] GET error:", error.message);
    return NextResponse.json({ error: TICKET_NOT_FOUND }, { status: 500 });
  }
}