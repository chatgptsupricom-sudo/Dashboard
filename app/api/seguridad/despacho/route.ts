import { query } from "@/lib/db";
import { filtroDespachos } from "@/lib/seguridad/filtros";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";
import { decodificarFirmaPng } from "@/lib/seguridad/firmas";
import { firmasRequeridasDespacho } from "@/lib/seguridad/despachoFirmas";
import { hayTablaProductos, leerProductos, marcarProductosDespachados, sincronizarEnvio } from "@/lib/rma/items";
import { getPublicOrigin } from "@/lib/publicOrigin";
import {
  guardarProductosDespacho,
  productosParaDespacho,
  type ProductoDespacho,
} from "@/lib/seguridad/productosEnvio";
import { guiaDeIngreso, siguienteGuia } from "@/lib/seguridad/guia";



const MAX = {
  almacenista_nombre: 200,
  factura: 100,
  cliente_retira: 200,
  observaciones: 5000,
  firma_url: 500,
  max_facturas: 50,
  nd_numero: 50,
};

function truncate(value: any, max: number): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const { searchParams } = new URL(request.url);
    const search = (searchParams.get("search") || "").trim();
    const desde = (searchParams.get("desde") || "").trim();
    const hasta = (searchParams.get("hasta") || "").trim();
    const ingresoIdParam = (searchParams.get("ingreso_id") || "").trim();
    const rmaCaseIdParam = (searchParams.get("rma_case_id") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    const { where, params } = filtroDespachos(searchParams, cids);

    let total = 0;
    let rows: any[];
    try {
      const countResult = await query(
        `SELECT COUNT(*) as total
         FROM seguridad_despachos d
         LEFT JOIN seguridad_ingresos i ON i.id = d.ingreso_id
         ${where}`,
        params,
      );
      total = countResult.rows[0]?.total || 0;

      const rowsResult = await query(
        `SELECT d.*, i.cliente_nombre AS cliente_nombre,
          (SELECT AVG(c.calificacion)
           FROM seguridad_calificaciones c
           WHERE c.relacionado_a = 'despacho'
             AND c.relacionado_id = d.id
             AND c.almacenista_nombre = d.almacenista_nombre
          ) AS promedio_calificacion
         FROM seguridad_despachos d
         LEFT JOIN seguridad_ingresos i ON i.id = d.ingreso_id
         ${where}
         ORDER BY d.fecha_despacho DESC, d.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      rows = rowsResult.rows;
    } catch (e: any) {
      console.warn("seguridad_ingresos no disponible para join:", e?.message);
      // Alias `d` aunque sea una sola tabla: `where` (de filtroDespachos)
      // puede traer `d.cids = ?` calificado, porque en la consulta de arriba
      // (con el JOIN) un `cids` sin calificar es ambiguo contra
      // `seguridad_ingresos.cids`. Sin el alias aqui, este fallback rompe con
      // "Unknown table 'd'" en cuanto haya un filtro de sucursal.
      const countResult = await query(
        `SELECT COUNT(*) as total FROM seguridad_despachos d ${where}`,
        params,
      );
      total = countResult.rows[0]?.total || 0;

      const rowsResult = await query(
        `SELECT d.*,
          (SELECT AVG(c.calificacion)
           FROM seguridad_calificaciones c
           WHERE c.relacionado_a = 'despacho'
             AND c.relacionado_id = d.id
             AND c.almacenista_nombre = d.almacenista_nombre
          ) AS promedio_calificacion
         FROM seguridad_despachos d ${where}
         ORDER BY d.fecha_despacho DESC, d.created_at DESC
         LIMIT ${limit} OFFSET ${offset}`,
        params,
      );
      rows = rowsResult.rows;
    }

    const despachos = rows.map((row: any) => {
      let facturas: string[] = [];
      if (row.facturas_json) {
        try {
          const parsed = JSON.parse(row.facturas_json);
          if (Array.isArray(parsed)) facturas = parsed.map((f) => String(f));
        } catch {
          facturas = [];
        }
      }
      return { ...row, facturas, cliente_nombre: row.cliente_nombre ?? null };
    });

    return NextResponse.json({
      success: true,
      despachos,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error listando despachos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** Tope de cada firma (PNG en base64), igual que /api/seguridad/firmas. */
const MAX_FIRMA_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const errors: string[] = [];

    const fechaDespacho = typeof body.fecha_despacho === "string" ? body.fecha_despacho.trim() : "";
    if (!fechaDespacho) errors.push("fecha_despacho es obligatorio");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaDespacho))
      errors.push("fecha_despacho debe tener formato YYYY-MM-DD");

    // Todo despacho devuelve un ingreso: se elige de "RMA por despachar".
    // El ticket, los datos del equipo y las facturas salen del ingreso y del
    // caso en el servidor; lo que mande la pantalla en esos campos se ignora.
    const ingresoId = parseInt(String(body.ingreso_id ?? ""), 10) || null;
    if (!ingresoId) {
      return NextResponse.json(
        { error: "Elige el RMA por despachar: todo despacho devuelve un ingreso" },
        { status: 400 },
      );
    }
    const ir = await query("SELECT * FROM seguridad_ingresos WHERE id = ?", [ingresoId]);
    const ingreso = (ir.rows as any[])[0];
    // 404 y no 403 para otra sucursal: no confirmar que existe.
    if (!ingreso || (cids !== null && Number(ingreso.cids) !== cids)) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }
    const rmaCaseId: number | null = ingreso.rma_case_id ? Number(ingreso.rma_case_id) : null;
    let caso: any = null;
    if (rmaCaseId !== null) {
      const cr = await query("SELECT * FROM rma_cases WHERE id = ?", [rmaCaseId]);
      caso = (cr.rows as any[])[0] ?? null;
    }

    // Lo único que escribe Seguridad en los datos del despacho: quién retira.
    const clienteRetira = truncate(body.cliente_retira, MAX.cliente_retira);
    if (!clienteRetira?.trim()) {
      errors.push("Escribe el nombre del cliente que retira");
    }

    if (typeof body.accesorios_integros !== "boolean") {
      errors.push("accesorios_integros es obligatorio (true o false)");
    }

    // Firmas del acta, todas obligatorias: cliente que retira, RMA y
    // Seguridad (retiro físico o por ruta / encomienda, igual).
    const firmas: { rol: string; nombre: string; png: { buffer: Buffer; mime: string } }[] = [];
    for (const req of firmasRequeridasDespacho()) {
      const f = body.firmas?.[req.rol];
      const nombre = req.rol === "cliente" ? clienteRetira : truncate(f?.nombre, MAX.almacenista_nombre);
      if (!nombre?.trim()) {
        errors.push(`Falta el nombre de ${req.etiqueta}`);
        continue;
      }
      const png = typeof f?.data === "string" ? decodificarFirmaPng(f.data) : null;
      if (!png) errors.push(`Falta la firma de ${req.etiqueta}`);
      else if (png.buffer.length > MAX_FIRMA_BYTES) errors.push(`La firma de ${req.etiqueta} es demasiado grande`);
      else firmas.push({ rol: req.rol, nombre: nombre.trim(), png });
    }

    // Quien entrega por Seguridad: es el que se califica en el despacho.
    const almacenistaNombre =
      truncate(body.firmas?.seguridad?.nombre, MAX.almacenista_nombre) ||
      truncate((auth.payload?.name as string) || "", MAX.almacenista_nombre);
    if (!almacenistaNombre) errors.push("Elige quién entrega por Seguridad");

    // Con un solo producto (o sin la tabla de productos), el caso tiene que
    // estar terminado por RMA y el ingreso sin despachar.
    const productosCaso = rmaCaseId !== null ? await leerProductos(rmaCaseId) : [];
    if (productosCaso.length <= 1) {
      const estado = productosCaso[0]?.status ?? caso?.status ?? null;
      if (caso && !["reparado", "nota_credito", "no_procesado"].includes(estado)) {
        errors.push("RMA todavía no terminó este caso: no se puede despachar");
      }
      const ya = await query("SELECT id FROM seguridad_despachos WHERE ingreso_id = ? LIMIT 1", [ingresoId]);
      if ((ya.rows as any[]).length) {
        return NextResponse.json({ error: "Este equipo ya se despachó", id: (ya.rows as any[])[0].id }, { status: 409 });
      }
    }

    // Facturas: las del ticket. Equipo externo: sin factura de Supricom.
    const externo = Number(caso?.producto_externo) === 1;
    const factura = externo ? null : caso?.invoice_number || ingreso.factura_numero || null;
    const facturasJson: string | null = factura ? JSON.stringify([String(factura).slice(0, MAX.factura)]) : null;

    // Devolución total o parcial de un envío (issue #331). Sin `item_ids`,
    // salen todos los productos que siguen en el taller; con ellos, esos.
    let salen: { filas: ProductoDespacho[]; ids: number[] } | null = null;
    if (errors.length === 0 && rmaCaseId !== null && (await hayTablaProductos())) {
      let itemIds: number[] | null = null;
      if (body.item_ids !== undefined && body.item_ids !== null) {
        if (!Array.isArray(body.item_ids)) errors.push("item_ids debe ser un array");
        else itemIds = body.item_ids.map((x: unknown) => parseInt(String(x), 10)).filter((n: number) => n > 0);
      }
      if (errors.length === 0) {
        const sel = await productosParaDespacho(rmaCaseId, itemIds, ingresoId);
        if ("error" in sel) errors.push(sel.error);
        else if (productosCaso.length > 1 && !sel.ids.length) errors.push("Ya salieron todos los productos de este envío");
        else salen = sel;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO seguridad_despachos
        (ingreso_id, rma_case_id, fecha_despacho, almacenista_nombre, facturas_json,
         cliente_retira, accesorios_integros, observaciones, firma_url, nd_numero, cids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ingresoId,
        rmaCaseId,
        fechaDespacho,
        almacenistaNombre,
        facturasJson,
        clienteRetira,
        body.accesorios_integros ? 1 : 0,
        truncate(body.observaciones, MAX.observaciones),
        null,
        // Número de guía: el del ingreso que se devuelve (recepción y
        // despacho son una sola hoja); sin ingreso, el siguiente de la
        // sucursal. Ya no se escribe a mano.
        (ingresoId !== null ? await guiaDeIngreso(ingresoId) : null) || (await siguienteGuia(cids)),
        cids,
      ],
    );

    const insertId = (result.rows as any)?.insertId;

    // Las firmas del acta de despacho (seguridad_firmas, las mismas que
    // muestran el detalle y el comprobante). Si alguna no se guarda, el
    // despacho ya quedó: se puede firmar desde su detalle.
    if (insertId) {
      for (const f of firmas) {
        try {
          await query(
            `INSERT INTO seguridad_firmas
               (acta_tipo, acta_id, rol, firmante_nombre, firma_data, firma_mime, cids)
             VALUES ('despacho', ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE firmante_nombre = VALUES(firmante_nombre),
               firma_data = VALUES(firma_data), firma_mime = VALUES(firma_mime)`,
            [insertId, f.rol, f.nombre, f.png.buffer, f.png.mime, cids],
          );
        } catch (e: any) {
          console.error(`No se pudo guardar la firma ${f.rol} del despacho ${insertId}:`, e?.message);
        }
      }
    }

    // Marcar en el ticket del portal que el equipo ya se entrego (issue #32).
    //
    // Se escribe `despachado_at` y NO se toca `status`: el estado guarda el
    // desenlace del caso —reparado, nota de credito, no procesado— y la
    // entrega le ocurre a cualquiera de ellos. Pisarlo con "despachado"
    // borraria el motivo por el que el caso se cerro, que es justo lo que el
    // cliente consulta en el portal.
    //
    // `IS NULL` para que un segundo despacho del mismo caso (un reingreso que
    // se vuelve a entregar) no mueva la fecha de la primera entrega.
    //
    // Va en su propio try: si esto falla, el despacho ya quedo registrado y no
    // se puede perder por no haber podido anotar la fecha en el ticket.
    if (rmaCaseId !== null) {
      try {
        if (salen) {
          // Por producto: salen los elegidos, y el caso queda entregado
          // cuando sale el último (sincronizarEnvio).
          await guardarProductosDespacho(insertId, salen.filas);
          await marcarProductosDespachados(rmaCaseId, fechaDespacho, salen.ids);
          await sincronizarEnvio(rmaCaseId, {
            changedBy: almacenistaNombre || "Seguridad",
            origenPeticion: getPublicOrigin(request),
          });
        } else {
          await query(
            `UPDATE rma_cases SET despachado_at = ?
             WHERE id = ? AND despachado_at IS NULL`,
            [fechaDespacho, rmaCaseId],
          );
        }
      } catch (e: any) {
        console.warn(
          `[despacho ${insertId}] no se pudo marcar despachado_at en rma_cases ${rmaCaseId}:`,
          e?.message,
        );
      }
    }

    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando despacho:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
