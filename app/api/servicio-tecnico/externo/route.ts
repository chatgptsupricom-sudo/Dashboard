import { getConnection, query } from "@/lib/db";
import { crearProductos } from "@/lib/rma/items";
import { verificarCaptcha } from "@/lib/servicio-tecnico/captcha";
import {
  MAX_REINTENTOS,
  asegurarColumnasPortal,
  enlazarAdjuntos,
  esChoqueReintentable,
  generarTrackingToken,
  siguienteNumeroCaso,
} from "@/lib/servicio-tecnico/casos";
import {
  componerDocumento,
  paisDeSucursal,
  validarDocumento,
} from "@/lib/servicio-tecnico/documento";
import {
  GARANTIA_EXTERNO,
  LARGOS,
  MAX_EQUIPOS,
  emailValido,
  erroresEquipo,
  nombreValido,
  telefonoValido,
  type EquipoExterno,
} from "@/lib/servicio-tecnico/externo";
import {
  aplicarLimites,
  consultarLimite,
  obtenerIp,
  registrarUso,
} from "@/lib/servicio-tecnico/limites";
import { esSucursalValida } from "@/lib/servicio-tecnico/sucursales";
import { NextRequest, NextResponse } from "next/server";
import { urlWebhookRma } from "@/lib/rma/webhook";

export const dynamic = "force-dynamic";

// POST /api/servicio-tecnico/externo
// Reporte público de un equipo que NO se compró en Supricom. Sin sesión.
//
// A diferencia de /api/servicio-tecnico/ticket no hay factura, así que no hay
// nada en Odoo contra lo que verificar al cliente ni al equipo: se guarda lo
// que el cliente escribe, marcado con producto_externo = 1 para que RMA sepa
// que no hay garantía de Supricom y que el servicio se presupuesta.
//
// Lo que sí se mantiene igual que en el reporte con factura, y es lo que
// frena el abuso de un formulario abierto:
//   - los MISMOS contadores de intentos y de tickets creados por IP (no se
//     suman: quien agota uno agota el otro),
//   - el captcha,
//   - al menos una foto o video por equipo, comprobado contra la base.
//
// Body (JSON):
//   {
//     sucursal:        number (cid, sale de la URL)
//     nombre:          string (persona o razón social)
//     tipo_documento:  string (código de lib/servicio-tecnico/documento)
//     documento:       string (número, con o sin guiones)
//     client_phone:    string
//     email:           string (para avisarle cuando esté listo)
//     acepta_condiciones: true
//     productos: [{ tipo, marca, modelo, serial?, reported_fault, upload_token }]
//     captcha_token:   string
//   }

type PedidoEquipo = EquipoExterno & { uploadToken: string };

const texto = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);

export async function POST(request: NextRequest) {
  // Mismos nombres de límite que el reporte con factura, a propósito.
  const bloqueoIntentos = aplicarLimites(request, "ticket-intentos", [
    { max: 20, ventanaSegundos: 3600 },
  ]);
  if (bloqueoIntentos) return bloqueoIntentos;

  const LIMITE_CREADOS = { max: 5, ventanaSegundos: 3600 };
  const bloqueoCreados = consultarLimite(request, "ticket-creado", LIMITE_CREADOS);
  if (bloqueoCreados) return bloqueoCreados;

  let conn: any;
  try {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Peticion invalida" }, { status: 400 });
    }

    const cid = parseInt(String(body.sucursal || ""), 10);
    if (!esSucursalValida(cid)) {
      return NextResponse.json({ error: "Falta elegir la sucursal" }, { status: 400 });
    }

    // Se valida sin recortar primero: un nombre de 300 caracteres es un error
    // del que llama, no algo para guardar a medias.
    const nombre = String(body.nombre ?? "").trim();
    const email = String(body.email ?? "").trim();
    const telefono = String(body.client_phone ?? "").trim();
    const tipoDoc = String(body.tipo_documento ?? "");
    const numeroDoc = String(body.documento ?? "");
    const pais = paisDeSucursal(cid);

    if (!nombreValido(nombre)) {
      return NextResponse.json({ error: "Escribe tu nombre o el de tu empresa." }, { status: 400 });
    }
    if (validarDocumento(pais, tipoDoc, numeroDoc)) {
      return NextResponse.json({ error: "Revisa el número de documento." }, { status: 400 });
    }
    if (!telefonoValido(telefono)) {
      return NextResponse.json({ error: "Necesitamos un número donde contactarte." }, { status: 400 });
    }
    if (!emailValido(email)) {
      return NextResponse.json({ error: "Revisa el correo electrónico." }, { status: 400 });
    }
    // El cliente tiene que saber, antes de mandar el equipo, que no es una
    // garantía y que el trabajo se cobra. Sin esto, el primer presupuesto es
    // una discusión.
    if (body.acepta_condiciones !== true) {
      return NextResponse.json(
        { error: "Confirma que entiendes que el servicio tiene un costo." },
        { status: 400 },
      );
    }

    if (!Array.isArray(body.productos) || body.productos.length === 0) {
      return NextResponse.json({ error: "Agrega al menos un equipo." }, { status: 400 });
    }
    if (body.productos.length > MAX_EQUIPOS) {
      return NextResponse.json(
        { error: `Un envío puede llevar hasta ${MAX_EQUIPOS} equipos.` },
        { status: 400 },
      );
    }

    const pedidos: PedidoEquipo[] = body.productos.map((p: any) => ({
      tipo: String(p?.tipo ?? ""),
      marca: String(p?.marca ?? ""),
      modelo: String(p?.modelo ?? ""),
      serial: String(p?.serial ?? ""),
      falla: String(p?.reported_fault ?? ""),
      uploadToken: String(p?.upload_token ?? "").trim(),
    }));

    for (const [i, p] of pedidos.entries()) {
      if (erroresEquipo(p).length) {
        return NextResponse.json(
          { error: `Revisa los datos del equipo ${i + 1}.` },
          { status: 400 },
        );
      }
    }
    // Dos equipos con el mismo token de fotos: el primero se llevaría las de
    // los dos.
    const tokens = pedidos.map((p) => p.uploadToken);
    if (tokens.some((t) => !t) || new Set(tokens).size !== tokens.length) {
      return NextResponse.json({ error: "Peticion invalida" }, { status: 400 });
    }

    // Captcha antes de tocar la base con consultas de más.
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

    // Al menos una foto o video por equipo, ya en el servidor.
    for (const [i, p] of pedidos.entries()) {
      const r = await query(
        `SELECT COUNT(*) AS total FROM rma_ticket_adjuntos
          WHERE tracking_token = ? AND ticket_id IS NULL`,
        [p.uploadToken],
      );
      if (Number((r.rows as any[])?.[0]?.total || 0) === 0) {
        return NextResponse.json(
          { error: `Adjunta al menos una foto o un video del equipo ${i + 1}.` },
          { status: 400 },
        );
      }
    }

    const documento = componerDocumento(pais, tipoDoc, numeroDoc);
    const equipos = pedidos.map((p) => ({
      tipo: texto(p.tipo, LARGOS.tipo),
      marca: texto(p.marca, LARGOS.marca),
      modelo: texto(p.modelo, LARGOS.modelo),
      serial: texto(p.serial, LARGOS.serial) || null,
      falla: texto(p.falla, LARGOS.falla),
      uploadToken: p.uploadToken,
    }));
    const nombreEquipo = (e: (typeof equipos)[number]) => `${e.tipo} ${e.marca} ${e.modelo}`;

    // Igual que en el reporte con factura: los campos de producto del caso son
    // los del primero, y la falla del caso junta la de todos.
    const primero = equipos[0];
    const fallaCaso =
      equipos.length === 1
        ? primero.falla
        : equipos
            .map((e, i) => `${i + 1}. ${nombreEquipo(e)}${e.serial ? ` (${e.serial})` : ""}: ${e.falla}`)
            .join("\n\n");

    conn = await getConnection();
    await asegurarColumnasPortal(conn);

    let caseId: number | null = null;
    let caseNumber: string | null = null;
    let trackingToken: string | null = null;
    let lastError: any = null;
    const createdBy = `${nombre.slice(0, 180)} (portal)`;

    for (let attempt = 1; attempt <= MAX_REINTENTOS; attempt++) {
      try {
        caseNumber = await siguienteNumeroCaso(conn);
        trackingToken = generarTrackingToken();

        const [insertResult] = (await conn.execute(
          `INSERT INTO rma_cases (
            case_number, product_code, hardware, brand, model,
            invoice_number, client_name, client_phone, serial_quantity,
            reported_fault, status, notes, company_id, created_by,
            origen, tracking_token, serial, garantia_estado,
            producto_externo, client_document, contacto_email, client_email
          ) VALUES (?, NULL, ?, ?, ?, NULL, ?, ?, ?, ?, 'recibido', NULL, ?, ?, 'portal', ?, ?, ?, 1, ?, ?, ?)`,
          [
            caseNumber,
            // Misma convención que el resto del módulo: hardware es la
            // categoría y model el nombre del producto.
            primero.tipo,
            primero.marca,
            primero.modelo,
            nombre,
            telefono,
            primero.serial,
            fallaCaso,
            // La sucursal de la URL: no hay factura de la que sacarla.
            cid,
            createdBy,
            trackingToken,
            primero.serial,
            GARANTIA_EXTERNO,
            documento,
            // contacto_email es el que escribió el cliente y no se borra;
            // client_email es el que usan los correos, y el reset de entrega
            // lo limpia (lib/rma/emailReparado.ts lo vuelve a tomar de acá).
            email,
            email,
          ],
        )) as [{ insertId: number }, any];

        caseId = insertResult?.insertId;
        if (!caseId) throw new Error("El INSERT no devolvió insertId");

        await conn.execute(
          `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
           VALUES (?, NULL, 'recibido', ?, 'Caso creado desde portal publico: equipo no comprado en Supricom (servicio con costo)')`,
          [caseId, createdBy],
        );

        const idsProductos = await crearProductos(
          caseId,
          equipos.map((e, i) => ({
            orden: i + 1,
            hardware: e.tipo,
            brand: e.marca,
            model: e.modelo,
            serial: e.serial,
            reported_fault: e.falla,
            garantia_estado: GARANTIA_EXTERNO,
          })),
          conn,
        );

        await enlazarAdjuntos(
          conn,
          caseId,
          trackingToken,
          equipos.map((e) => e.uploadToken),
          idsProductos,
        );

        break;
      } catch (e: any) {
        lastError = e;
        if (esChoqueReintentable(e) && attempt < MAX_REINTENTOS) {
          await new Promise((r) => setTimeout(r, attempt * 50));
          continue;
        }
        throw e;
      }
    }

    if (!caseId || !caseNumber || !trackingToken) {
      throw lastError || new Error("No se pudo generar el ticket");
    }

    if (typeof global !== "undefined" && (global as any).io) {
      try {
        (global as any).io.emit("rma_ticket_nuevo", {
          case_id: caseId,
          case_number: caseNumber,
          client_name: nombre,
          product:
            equipos.length > 1
              ? `${nombreEquipo(primero)} (+${equipos.length - 1})`
              : nombreEquipo(primero),
          productos: equipos.length,
          invoice_number: null,
          origen: "portal",
          externo: true,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.error("[portal-externo] socket emit error:", e);
      }
    }

    if (urlWebhookRma()) {
      fetch(urlWebhookRma()!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          evento: "rma_ticket_nuevo",
          origen: "portal",
          externo: true,
          ticket: {
            case_id: caseId,
            case_number: caseNumber,
            tracking_token: trackingToken,
            client_name: nombre,
            client_phone: telefono,
            client_email: email,
            invoice_number: null,
            product_code: null,
            product_name: nombreEquipo(primero),
            serial: primero.serial,
            reported_fault: fallaCaso,
            productos: equipos.map((e) => ({
              product_code: null,
              product_name: nombreEquipo(e),
              serial: e.serial,
              reported_fault: e.falla,
            })),
          },
        }),
      }).catch((err) => {
        console.error("[portal-externo] n8n webhook error:", err.message);
      });
    }

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
    console.error("[portal-externo] POST error:", error.message, error.stack);
    return NextResponse.json(
      { error: "No pudimos procesar tu reporte. Intenta de nuevo." },
      { status: 500 },
    );
  } finally {
    if (conn) {
      try {
        // release(), no close(): ver el comentario en ../ticket/route.ts.
        conn.release();
      } catch (e: any) {
        console.error("[portal-externo] release:", e?.message);
      }
    }
  }
}
