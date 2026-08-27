import { normalizarCanal, SIN_CANAL } from "@/lib/canales";
import { query } from "@/lib/db";
import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/env";

declare global {
  var io: any;
}


export async function GET(request: Request) {
  try {
    const cookieHeader = request.headers.get("cookie");
    const token = cookieHeader
      ?.split(";")
      .find((c) => c.trim().startsWith("token="))
      ?.split("=")[1];

    if (!token) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { payload } = await jwtVerify(token, jwtSecretBytes());
    const userId = parseInt(payload.uid as string);

    const sellerResult = await query(
      "SELECT id FROM sellers WHERE user_id = ?",
      [userId],
    );
    const sellerRows = Array.isArray(sellerResult)
      ? sellerResult
      : (sellerResult as any).rows;

    if (!sellerRows || sellerRows.length === 0) {
      return NextResponse.json([], { status: 404 });
    }

    const sellerId = sellerRows[0].id;

    const sql = `
        SELECT leads.*, sellers.name AS seller_name
        FROM leads
        LEFT JOIN sellers ON leads.seller_id = sellers.id
        WHERE leads.seller_id = ?
        ORDER BY leads.fecha_ingreso DESC
      `;
    const result = await query(sql, [sellerId]);
    const rows = Array.isArray(result) ? result : (result as any).rows;

    return NextResponse.json(rows || [], {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (error: any) {
    console.error("Error crítico en API de Leads:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const {
      id,
      status,
      motivo,
      monto,
      factura,
      fecha,
      tiempoPrimerContacto,
      segundaCompraRealizada,
      reactivacion,
      nombre,
      empresa,
      telefono,
      rif,
      ubicacionEstado,
      observacionesVendedor,
      observacionesCierres,
      motivoPerdido,
      productoPerdido,
      productoGanado,
    } = body;

    // Helper: log status change to history
    const logStatusChange = async (leadId: any, statusNuevo: string) => {
      try {
        const current: any = await query(
          "SELECT status, seller_id FROM leads WHERE id = ?",
          [leadId],
        );
        const lead = current.rows?.[0];
        if (!lead || lead.status === statusNuevo) return;
        await query(
          `INSERT INTO leads_status_history (lead_id, status_anterior, status_nuevo, seller_id, fecha_cambio)
           VALUES (?, ?, ?, ?, NOW())`,
          [leadId, lead.status, statusNuevo, lead.seller_id],
        );
      } catch (err) {
        console.error("Error al registrar historial de status:", err);
      }
    };

    if (
      nombre !== undefined ||
      empresa !== undefined ||
      telefono !== undefined ||
      rif !== undefined ||
      ubicacionEstado !== undefined
    ) {
      const fields: string[] = [];
      const params: any[] = [];
      if (nombre !== undefined) {
        fields.push("nombre_contacto = ?");
        params.push(nombre);
      }
      if (empresa !== undefined) {
        fields.push("name = ?");
        params.push(empresa);
      }
      if (telefono !== undefined) {
        fields.push("telefono = ?");
        params.push(telefono);
      }
      if (rif !== undefined) {
        fields.push("rif = ?");
        params.push(rif);
      }
      if (ubicacionEstado !== undefined) {
        fields.push("ubicacion_estado = ?");
        params.push(ubicacionEstado);
      }
      params.push(id);
      await query(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`, params);
    } else if (observacionesVendedor !== undefined) {
      await query("UPDATE leads SET observaciones_vendedor = ? WHERE id = ?", [
        observacionesVendedor,
        id,
      ]);
    } else if (segundaCompraRealizada) {
      await query("UPDATE leads SET has_segunda_compra = 1 WHERE id = ?", [id]);
    } else if (reactivacion) {
      const motivoResult: any = await query(
        "SELECT motivo_cierre FROM leads WHERE id = ?",
        [id],
      );
      const motivoRows = Array.isArray(motivoResult)
        ? motivoResult
        : motivoResult.rows;
      const motivoCierre = motivoRows?.[0]?.motivo_cierre;
      const esGanado = motivoCierre === "GANADO" || motivoCierre === "VENTA";
      if (esGanado) {
        return NextResponse.json(
          { error: "Solo el administrador puede reactivar leads ganados" },
          { status: 403 },
        );
      }
      await logStatusChange(id, status ?? "NUEVO");
      await query(
        "UPDATE leads SET status = ?, motivo_cierre = NULL, reactivacion = 1 WHERE id = ?",
        [status ?? null, id],
      );
    } else {
      const fields: string[] = [];
      const params: any[] = [];

      if (status !== undefined) { fields.push("status = ?"); params.push(status); }
      if (motivo !== undefined) { fields.push("motivo_cierre = ?"); params.push(motivo); }
      if (monto !== undefined) { fields.push("monto_cerrado_usd = ?"); params.push(monto ? Number(monto) : null); }
      if (factura !== undefined) { fields.push("num_factura = ?"); params.push(factura); }
      if (fecha !== undefined) { fields.push("fecha_venta = ?"); params.push(fecha ? `${fecha} ${new Date().toTimeString().split(" ")[0]}` : null); }
      if (tiempoPrimerContacto !== undefined) { fields.push("tiempo_primer_contacto_minutos = ?"); params.push(tiempoPrimerContacto); }
      if (observacionesCierres !== undefined) { fields.push("observaciones_cierres = ?"); params.push(observacionesCierres); }
      if (motivoPerdido !== undefined) { fields.push("motivo_perdido = ?"); params.push(motivoPerdido); }
      if (productoPerdido !== undefined) { fields.push("producto_perdido = ?"); params.push(productoPerdido); }
      if (productoGanado !== undefined) { fields.push("producto_ganado = ?"); params.push(productoGanado); }

      if (fields.length === 0) {
        return NextResponse.json({ error: "No hay campos para actualizar" }, { status: 400 });
      }

      if (status !== undefined) await logStatusChange(id, status);
      params.push(id);

      await query(`UPDATE leads SET ${fields.join(", ")} WHERE id = ?`, params);
    }

    if (global.io) {
      global.io.emit("leads-updated", { action: "PATCH", id });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en PATCH:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      nombre,
      empresa,
      telefono,
      rif,
      ubicacionEstado,
      ubicacionDetalle,
      canalOrigen,
      campana,
      seller_id,
      status,
      motivo,
      monto,
      factura,
      fecha,
      crearNuevo,
    } = body;

    // `canal_origen` es texto libre y de ahi salen las variantes sucias
    // ("Whatsaap", el string "null"): se normaliza antes de insertar para no
    // seguir generando valores nuevos que despues haya que limpiar.
    const canalNormalizado = normalizarCanal(canalOrigen);
    const canalGuardado = canalNormalizado === SIN_CANAL ? null : canalNormalizado;

    if (crearNuevo) {
      // Creación manual de lead desde el admin
      await query(
        `INSERT INTO leads
          (nombre_contacto, name, telefono, rif, ubicacion_estado, ubicacion_detalle,
           canal_origen, campana, seller_id, status, fecha_ingreso)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          nombre ?? "",
          empresa ?? "",
          telefono ?? "",
          rif ?? "",
          ubicacionEstado ?? "",
          ubicacionDetalle ?? "",
          canalGuardado,
          campana ?? "",
          seller_id ?? null,
          status ?? "NUEVO",
        ],
      );

      // Notificar a n8n con los datos del lead y el nombre del vendedor
      if (process.env.N8N_LEAD_WEBHOOK_URL) {
        let vendedorNombre = "Sin asignar";
        if (seller_id) {
          const sellerResult: any = await query(
            "SELECT name FROM sellers WHERE id = ?",
            [seller_id],
          );
          const sellerRows = Array.isArray(sellerResult)
            ? sellerResult
            : sellerResult.rows;
          if (sellerRows?.[0]?.name) vendedorNombre = sellerRows[0].name;
        }

        // Fire-and-forget: no bloqueamos la respuesta
        fetch(process.env.N8N_LEAD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            evento: "lead_creado",
            vendedor: vendedorNombre,
            lead: {
              nombre_contacto: nombre ?? "",
              empresa: empresa ?? "",
              telefono: telefono ?? "",
              rif: rif ?? "",
              ubicacion_estado: ubicacionEstado ?? "",
              ubicacion_detalle: ubicacionDetalle ?? "",
              canal_origen: canalOrigen ?? "",
              campana: campana ?? "",
              status: status ?? "NUEVO",
              seller_id: seller_id ?? null,
            },
          }),
        }).catch((err) => console.error("Error al notificar n8n:", err));
      }

      if (global.io) {
        global.io.emit("leads-updated", { action: "POST" });
      }
    } else {
      // Comportamiento original: segunda compra / cierre
      await query(
        `INSERT INTO leads
          (nombre_contacto, name, telefono, rif, ubicacion_estado, ubicacion_detalle,
           canal_origen, campana, seller_id, status, motivo_cierre, monto_cerrado_usd, num_factura, fecha_venta, fecha_ingreso, has_segunda_compra)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), 1)`,
        [
          nombre ?? "",
          empresa ?? "",
          telefono ?? "",
          rif ?? "",
          ubicacionEstado ?? "",
          ubicacionDetalle ?? "",
          canalGuardado,
          campana ?? "",
          seller_id ?? null,
          status ?? "CERRADO",
          motivo ?? "VENTA",
          monto ? Number(monto) : null,
          factura ?? null,
          fecha ?? null,
        ],
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en POST:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id)
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    await query("DELETE FROM leads WHERE id = ?", [id]);

    if (global.io) {
      global.io.emit("leads-updated", { action: "DELETE", id });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error en DELETE:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
