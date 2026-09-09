import { query } from "@/lib/db";
import { requireRoles } from "@/lib/auth/roles";
import { NextRequest, NextResponse } from "next/server";
import { enviarCorreoReparado } from "@/lib/rma/emailReparado";
import { getPublicOrigin } from "@/lib/publicOrigin";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    const caseResult = await query(
      `SELECT * FROM rma_cases WHERE id = ? OR case_number = ?`,
      [id, id]
    );

    if (caseResult.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const caseData = caseResult.rows[0];

    const historyResult = await query(
      `SELECT * FROM rma_history WHERE case_id = ? ORDER BY created_at ASC`,
      [caseData.id]
    );

    let adjuntos: any[] = [];
    try {
      // Idempotente -- si ya existe, el error se traga (mismo patron que
      // el resto del modulo). Sin esto, un `SELECT ... tipo` contra una
      // base que todavia no tiene la columna (nadie subio una guia
      // todavia) tira TODOS los adjuntos del caso al catch de abajo, no
      // solo los de tipo guia -- se perderian tambien las fotos del
      // reporte original.
      await query(`ALTER TABLE rma_ticket_adjuntos ADD COLUMN tipo VARCHAR(30) DEFAULT 'reporte'`).catch((e: any) => {
        if (!e.message?.includes("Duplicate") && !e.message?.includes("exists")) throw e;
      });

      const adjuntosResult = await query(
        `SELECT id, filename, mime, size, created_at, tracking_token, tipo
         FROM rma_ticket_adjuntos
         WHERE ticket_id = ?
         ORDER BY created_at ASC`,
        [caseData.id]
      );
      adjuntos = adjuntosResult.rows.map((row: any) => ({
        id: row.id,
        filename: row.filename,
        mime: row.mime,
        size: row.size,
        created_at: row.created_at,
        // Casos viejos no tienen la columna `tipo` poblada -- se asume
        // "reporte" (foto que el cliente subio al reportar la falla), que
        // es lo unico que existia antes de que hubiera guias de agencia.
        tipo: row.tipo || "reporte",
        url: row.tracking_token
          ? `/api/servicio-tecnico/ticket/adjuntos/${row.tracking_token}/${row.id}`
          : null,
      }));
    } catch (adjErr: any) {
      console.warn("rma_ticket_adjuntos no disponible:", adjErr?.message);
      adjuntos = [];
    }

    return NextResponse.json({
      success: true,
      case: caseData,
      history: historyResult.rows,
      adjuntos,
    });
  } catch (error: any) {
    console.error("Error fetching RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;
    const body = await request.json();
    const {
      product_code,
      hardware,
      brand,
      model,
      invoice_number,
      client_name,
      client_phone,
      serial_quantity,
      reported_fault,
      status,
      diagnosis,
      notes,
      company_id,
      changed_by,
      change_notes,
    } = body;

    const existing = await query(
      `SELECT id, status, case_number, origen, company_id, odoo_partner_id,
              tracking_token, model, hardware, client_name
       FROM rma_cases WHERE id = ?`,
      [id],
    );
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    const casoActual = existing.rows[0];
    const oldStatus = casoActual.status;

    // Marcar que el cliente ya se llevo el equipo (issue #122). Mismo campo
    // que ya usa app/api/seguridad/despacho/route.ts para los despachos
    // formales de Seguridad -- `despachado_at` es independiente de `status`
    // (un caso reparado, con nota de credito, o no procesado igual se
    // "entrega"), asi que esto NO toca status. `IS NULL` evita que un
    // segundo click mueva la fecha de la primera entrega. Peticion
    // aparte de la edicion general de campos: no se mezcla con `updates`.
    if (body.marcar_entregado === true) {
      await query(
        `UPDATE rma_cases SET despachado_at = CURDATE() WHERE id = ? AND despachado_at IS NULL`,
        [id],
      );
      return NextResponse.json({ success: true });
    }

    // Correccion manual: deshace una eleccion de entrega y/o una entrega
    // marcada por error (ej. un caso de prueba real que se toco sin
    // querer). Tambien limpia client_email -- se popula solo al enviar el
    // correo de "reparado" (issue #119), asi que si se llego hasta aca fue
    // por el mismo error. No hay botón para esto en la UI a proposito --
    // es un escape hatch para casos excepcionales, no un flujo normal.
    // Requiere el mismo rol "rma" que el resto de este endpoint.
    if (body.reset_entrega === true) {
      await query(
        `UPDATE rma_cases SET
           despachado_at = NULL,
           entrega_metodo = NULL,
           entrega_ciudad = NULL,
           entrega_ruta_id = NULL,
           entrega_agencia = NULL,
           entrega_datos = NULL,
           entrega_elegida_at = NULL,
           client_email = NULL
         WHERE id = ?`,
        [id],
      );
      return NextResponse.json({ success: true });
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (product_code !== undefined) { updates.push("product_code = ?"); values.push(product_code); }
    if (hardware !== undefined) { updates.push("hardware = ?"); values.push(hardware); }
    if (brand !== undefined) { updates.push("brand = ?"); values.push(brand); }
    if (model !== undefined) { updates.push("model = ?"); values.push(model); }
    if (invoice_number !== undefined) { updates.push("invoice_number = ?"); values.push(invoice_number); }
    if (client_name !== undefined) { updates.push("client_name = ?"); values.push(client_name); }
    if (client_phone !== undefined) { updates.push("client_phone = ?"); values.push(client_phone); }
    if (serial_quantity !== undefined) { updates.push("serial_quantity = ?"); values.push(serial_quantity); }
    if (reported_fault !== undefined) { updates.push("reported_fault = ?"); values.push(reported_fault); }
    if (diagnosis !== undefined) { updates.push("diagnosis = ?"); values.push(diagnosis); }
    if (notes !== undefined) { updates.push("notes = ?"); values.push(notes); }
    if (company_id !== undefined) { updates.push("company_id = ?"); values.push(company_id); }

    if (status && status !== oldStatus) {
      updates.push("status = ?");
      values.push(status);

      await query(
        `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [id, oldStatus, status, changed_by || "Sistema", change_notes || null]
      );
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
    }

    values.push(id);
    await query(`UPDATE rma_cases SET ${updates.join(", ")} WHERE id = ?`, values);

    // Aviso al cliente de "tu equipo esta reparado" (issue #119). Solo en
    // la TRANSICION hacia reparado -- si el caso ya estaba reparado (ej. se
    // edito otro campo sin tocar el estado), no se reenvia. Fire-and-forget:
    // el estado ya quedo guardado arriba, un fallo aca no debe tumbar esta
    // respuesta.
    if (status === "reparado" && oldStatus !== "reparado") {
      enviarCorreoReparado(
        {
          id: casoActual.id,
          case_number: casoActual.case_number,
          origen: casoActual.origen,
          company_id: casoActual.company_id,
          odoo_partner_id: casoActual.odoo_partner_id,
          tracking_token: casoActual.tracking_token,
          model: model !== undefined ? model : casoActual.model,
          hardware: hardware !== undefined ? hardware : casoActual.hardware,
          client_name: client_name !== undefined ? client_name : casoActual.client_name,
        },
        getPublicOrigin(request),
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRoles(request, ["rma"]);
  if (auth.error) return auth.error;

  try {
    const { id } = await params;

    const existing = await query("SELECT id FROM rma_cases WHERE id = ?", [id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Caso no encontrado" }, { status: 404 });
    }

    await query("DELETE FROM rma_cases WHERE id = ?", [id]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error deleting RMA case:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
