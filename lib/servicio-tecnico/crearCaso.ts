/**
 * Crea un caso de servicio técnico del portal (origen 'portal', con tracking_token) a partir de los
 * productos ya validados de una factura. Lo usan el portal público (app/api/servicio-tecnico/ticket) y
 * «Mi cuenta» de la tienda web (app/api/tienda-web/clientes/rma), así los dos dejan el caso igual:
 * rma_cases + rma_history + rma_case_items + adjuntos enlazados, el aviso por socket y el webhook de n8n.
 *
 * Quien llama ya validó: que la factura es del cliente, que cada producto es de esa factura, el serial
 * escrito a mano cuando hace falta y que cada producto tiene al menos un adjunto subido.
 * (Extraído sin cambios de la ruta del portal, nov-2026.)
 */
import { getConnection } from "@/lib/db";
import type { FacturaConItems, ItemFactura } from "@/lib/servicio-tecnico/factura";
import { crearProductos } from "@/lib/rma/items";
import { estadoInicial } from "@/lib/rma/flujo";
import {
  MAX_REINTENTOS,
  asegurarColumnasPortal,
  enlazarAdjuntos,
  esChoqueReintentable,
  generarTrackingToken,
  siguienteNumeroCaso,
} from "@/lib/servicio-tecnico/casos";
import { urlWebhookRma } from "@/lib/rma/webhook";

export interface ProductoCaso {
  matched: ItemFactura;
  falla: string;
  /** Token con el que se subieron sus adjuntos (rma_ticket_adjuntos.tracking_token, ticket_id NULL). */
  uploadToken: string;
  /** El serial que se guarda: el de Odoo si existe; si no, el escrito a mano. */
  serialFinal: string | null;
}

export interface CasoCreado { caseId: number; caseNumber: string; trackingToken: string }

export async function crearCasoPortal(args: {
  resultado: FacturaConItems;
  elegidos: ProductoCaso[];
  telefono: string | null;
  /** Lo que escribió el cliente (el webhook lo manda así); en la base va el número canónico de Odoo. */
  facturaEscrita: string;
  /** Texto del historial al crear el caso. */
  nota?: string;
}): Promise<CasoCreado> {
  const { resultado, elegidos, telefono, facturaEscrita } = args;
  const nota = args.nota || "Caso creado desde portal publico";
  // Los campos de producto del caso son los del primero (paso 1 de #331). La falla del caso, en cambio,
  // junta la de todos: es lo que el técnico lee hoy en el panel, y ahí tiene que ver el envío completo.
  const { matched, serialFinal } = elegidos[0];
  const fallaCaso =
    elegidos.length === 1
      ? elegidos[0].falla
      : elegidos.map((e, i) => `${i + 1}. ${e.matched.nombre}${e.serialFinal ? ` (${e.serialFinal})` : ""}: ${e.falla}`).join("\n\n");

  const conn: any = await getConnection();
  let caseId: number | null = null;
  let caseNumber: string | null = null;
  let trackingToken: string | null = null;
  try {
    await asegurarColumnasPortal(conn);
    let lastError: any = null;
    // El equipo todavía no llegó: "por llegar" hasta que Seguridad lo ingrese.
    const estado = await estadoInicial(false);
    // created_by: nombre del cliente + "(portal)". Así el técnico ve de un vistazo quién lo creó.
    const createdBy = `${resultado.cliente.nombre} (portal)`;

    for (let attempt = 1; attempt <= MAX_REINTENTOS; attempt++) {
      try {
        // case_number y tracking_token frescos en cada intento (race condition del case_number).
        caseNumber = await siguienteNumeroCaso(conn);
        trackingToken = generarTrackingToken();
        const [insertResult] = (await conn.execute(
          `INSERT INTO rma_cases (
            case_number, product_code, hardware, brand, model,
            invoice_number, client_name, client_phone, serial_quantity,
            reported_fault, status, notes, company_id, created_by,
            origen, tracking_token, odoo_partner_id, odoo_product_id, serial,
            garantia_estado, garantia_meses, garantia_vence, garantia_marca
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 'portal', ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            caseNumber,
            matched.codigo || null,
            // hardware es la categoría, model el nombre del producto (convención del módulo interno).
            matched.categoria || null,
            matched.marca || null,
            matched.nombre || null,
            // El número canónico de Odoo, no lo que escribió el cliente.
            resultado.factura.numero,
            resultado.cliente.nombre,
            telefono || null,
            // serial_quantity es el campo viejo (texto libre) que usa el módulo interno para buscar.
            serialFinal,
            fallaCaso,
            estado,
            // La compañía sale de la factura (NOT NULL, default 9).
            resultado.factura.compania_id ?? 9,
            createdBy,
            trackingToken,
            resultado.partner_id,
            matched.producto_id || null,
            serialFinal,
            // La garantía se congela acá: la del día en que el cliente reportó.
            matched.garantia?.estado || null,
            matched.garantia?.meses_cubiertos ?? null,
            matched.garantia?.fecha_vencimiento ? matched.garantia.fecha_vencimiento.slice(0, 10) : null,
            matched.garantia?.marca_resuelta || null,
          ],
        )) as [{ insertId: number }, any];
        caseId = insertResult?.insertId;
        if (!caseId) throw new Error("El INSERT no devolvió insertId");

        // El módulo interno espera una fila en rma_history al crear el caso.
        await conn.execute(
          `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes) VALUES (?, NULL, ?, ?, ?)`,
          [caseId, estado, createdBy, nota],
        );
        // Los productos del envío (issue #331), en el orden en que el cliente los eligió.
        const idsProductos = await crearProductos(
          caseId,
          elegidos.map((e, i) => ({
            orden: i + 1,
            product_code: e.matched.codigo || null,
            hardware: e.matched.categoria || null,
            brand: e.matched.marca || null,
            model: e.matched.nombre || null,
            serial: e.serialFinal,
            odoo_product_id: e.matched.producto_id || null,
            reported_fault: e.falla,
            garantia_estado: e.matched.garantia?.estado || null,
            garantia_meses: e.matched.garantia?.meses_cubiertos ?? null,
            garantia_vence: e.matched.garantia?.fecha_vencimiento ? e.matched.garantia.fecha_vencimiento.slice(0, 10) : null,
            garantia_marca: e.matched.garantia?.marca_resuelta || null,
          })),
          conn,
          estado,
        );
        // Los adjuntos que ya se subieron con el token temporal de cada producto.
        await enlazarAdjuntos(conn, caseId, trackingToken, elegidos.map((e) => e.uploadToken), idsProductos);
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
    if (!caseId || !caseNumber || !trackingToken) throw lastError || new Error("No se pudo generar el ticket");
  } finally {
    // release(), NO close(): en el pool de mysql2 close() no existe y la conexión nunca volvía al pool.
    try { conn.release(); } catch (e: any) { console.error("[portal-ticket] release:", e?.message); }
  }

  // Aviso por socket y webhook de n8n (fire-and-forget): si fallan, el caso ya quedó guardado.
  if (typeof global !== "undefined" && (global as any).io) {
    try {
      (global as any).io.emit("rma_ticket_nuevo", {
        case_id: caseId,
        case_number: caseNumber,
        client_name: resultado.cliente.nombre,
        product: elegidos.length > 1 ? `${matched.nombre} (+${elegidos.length - 1})` : matched.nombre,
        productos: elegidos.length,
        invoice_number: facturaEscrita,
        origen: "portal",
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.error("[portal-ticket] socket emit error:", e);
    }
  }
  if (urlWebhookRma()) {
    fetch(urlWebhookRma()!, {
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
          client_phone: telefono,
          invoice_number: facturaEscrita,
          product_code: matched.codigo,
          product_name: matched.nombre,
          serial: matched.serial || null,
          reported_fault: fallaCaso,
          productos: elegidos.map((e) => ({
            product_code: e.matched.codigo,
            product_name: e.matched.nombre,
            serial: e.serialFinal,
            reported_fault: e.falla,
          })),
        },
      }),
    }).catch((err) => console.error("[portal-ticket] n8n webhook error:", err.message));
  }
  return { caseId: caseId!, caseNumber: caseNumber!, trackingToken: trackingToken! };
}
