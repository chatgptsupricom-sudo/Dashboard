import { query } from "@/lib/db";
import { filtroIngresos } from "@/lib/seguridad/filtros";
import { requireSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { asegurarEsquemaPersonal } from "@/lib/seguridad/catalogoPersonal";
import { NextRequest, NextResponse } from "next/server";
import {
  guardarProductosIngreso,
  hayTablasSeguridad,
  validarProductosIngreso,
  type ProductoIngreso,
} from "@/lib/seguridad/productosEnvio";
import { leerProductos } from "@/lib/rma/items";
import { siguienteGuia } from "@/lib/seguridad/guia";
import { decodificarFirmaPng } from "@/lib/seguridad/firmas";

/** Tope de cada firma (PNG en base64), igual que /api/seguridad/firmas. */
const MAX_FIRMA_BYTES = 1024 * 1024;



const MAX = {
  factura_numero: 100,
  cliente_nombre: 200,
  hardware: 200,
  serial: 200,
  descripcion_falla: 5000,
  recibido_por: 200,
  foto_estado_url: 500,
  idempotency_key: 64,
  nd_numero: 50,
};

function truncate(value: any, max: number): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value);
  return s.length > max ? s.slice(0, max) : s;
}

// `dentro_de_fecha` y `falla_cubierta_garantia` nacieron NOT NULL sin default
// (a propósito, para no declarar por nadie que el equipo llegó bien). Al dejar
// de pedirlos (#48) hay que permitir NULL para poder omitirlos del INSERT.
// Se corre una sola vez por proceso, best-effort: si ya están nullables o la
// columna no existe, no pasa nada.
let columnasGarantiaAjustadas: Promise<void> | null = null;
function asegurarColumnasGarantiaNullables(): Promise<void> {
  if (!columnasGarantiaAjustadas) {
    columnasGarantiaAjustadas = (async () => {
      for (const col of ["dentro_de_fecha", "falla_cubierta_garantia"]) {
        try {
          await query(
            `ALTER TABLE seguridad_ingresos MODIFY ${col} TINYINT(1) NULL DEFAULT NULL`,
          );
        } catch (e: any) {
          console.warn(`No se pudo hacer nullable ${col}:`, e?.message);
        }
      }
    })();
  }
  return columnasGarantiaAjustadas;
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
    const rmaCaseIdParam = (searchParams.get("rma_case_id") || "").trim();
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "20", 10)));
    const offset = (page - 1) * limit;

    const { where, params } = filtroIngresos(searchParams, cids);

    const countResult = await query(
      `SELECT COUNT(*) as total FROM seguridad_ingresos ${where}`,
      params,
    );
    const total = countResult.rows[0]?.total || 0;

    const rowsResult = await query(
      // despacho_id: el listado tiene una columna "Despachado" y el filtro de
      // pendientes, y este SELECT no traia el dato, asi que la pantalla pintaba
      // "No" en todas las filas —incluido el equipo ya entregado al cliente.
      `SELECT *,
        (SELECT AVG(c.calificacion)
         FROM seguridad_calificaciones c
         WHERE c.relacionado_a = 'ingreso'
           AND c.relacionado_id = seguridad_ingresos.id
           AND c.almacenista_nombre = seguridad_ingresos.recibido_por
        ) AS promedio_calificacion,
        (SELECT d.id
         FROM seguridad_despachos d
         WHERE d.ingreso_id = seguridad_ingresos.id
         ORDER BY d.id DESC LIMIT 1
        ) AS despacho_id
       FROM seguridad_ingresos ${where}
       ORDER BY fecha_entrega DESC, created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return NextResponse.json({
      success: true,
      ingresos: rowsResult.rows,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error: any) {
    console.error("Error listando ingresos:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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

    const fechaEntrega = typeof body.fecha_entrega === "string" ? body.fecha_entrega.trim() : "";
    if (!fechaEntrega) errors.push("fecha_entrega es obligatorio");
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEntrega))
      errors.push("fecha_entrega debe tener formato YYYY-MM-DD");

    // #50: quién recibió, por cada lado del mostrador. `recibido_por` (viejo,
    // texto único) se sigue guardando para la calificación y los KPIs — es el
    // de Seguridad. Se acepta que el cliente lo mande directo (cola offline con
    // builds viejos) o que se derive del de Seguridad.
    const recibidoSeguridad = truncate(
      body.recibido_seguridad_nombre,
      MAX.recibido_por,
    );
    const recibidoRma = truncate(body.recibido_rma_nombre, MAX.recibido_por);
    const recibidoPor =
      truncate(body.recibido_por, MAX.recibido_por) || recibidoSeguridad;
    if (!recibidoSeguridad) errors.push("recibido_seguridad_nombre es obligatorio");
    if (!recibidoRma) errors.push("recibido_rma_nombre es obligatorio");
    if (!recibidoPor) errors.push("recibido_por es obligatorio");

    // Todo ingreso sale de un ticket del portal: no llega un equipo sin
    // ticket. Los datos del acta (cliente, factura, equipo, serial, falla)
    // salen del ticket y Seguridad no los edita; lo que mande la pantalla en
    // esos campos se ignora.
    let rmaCaseId: number | null = null;
    const parsedCase = parseInt(String(body.rma_case_id ?? ""), 10);
    if (!parsedCase || parsedCase <= 0) {
      errors.push("Elige el ticket del portal: todo ingreso sale de un ticket");
    } else {
      rmaCaseId = parsedCase;
    }

    let caso: any = null;
    if (rmaCaseId !== null) {
      const r = await query("SELECT * FROM rma_cases WHERE id = ?", [rmaCaseId]);
      caso = (r.rows as any[])[0] ?? null;
      // 404 y no 403 para otra sucursal: no confirmar que el ticket existe.
      if (!caso || (cids !== null && Number(caso.company_id) !== cids)) {
        return NextResponse.json({ error: "Ticket no encontrado" }, { status: 404 });
      }
      const ya = await query("SELECT id FROM seguridad_ingresos WHERE rma_case_id = ? LIMIT 1", [rmaCaseId]);
      if ((ya.rows as any[]).length && !body.idempotency_key) {
        return NextResponse.json(
          { error: "Ese ticket ya tiene un ingreso registrado", id: (ya.rows as any[])[0].id },
          { status: 409 },
        );
      }
    }

    // Firmas de quien recibe, por cada lado del mostrador: Seguridad y RMA
    // firman en el mismo formulario, al recibir el equipo.
    const firmas: { rol: "seguridad" | "tecnico"; nombre: string | null; png: { buffer: Buffer; mime: string } | null }[] = [
      { rol: "seguridad", nombre: recibidoSeguridad, png: null },
      { rol: "tecnico", nombre: recibidoRma, png: null },
    ];
    for (const f of firmas) {
      const dataUrl = f.rol === "seguridad" ? body.firma_seguridad : body.firma_rma;
      const quien = f.rol === "seguridad" ? "Seguridad" : "RMA";
      if (typeof dataUrl !== "string" || !dataUrl) {
        errors.push(`Falta la firma de ${quien}`);
        continue;
      }
      f.png = decodificarFirmaPng(dataUrl);
      if (!f.png) errors.push(`La firma de ${quien} no es válida`);
      else if (f.png.buffer.length > MAX_FIRMA_BYTES) errors.push(`La firma de ${quien} es demasiado grande`);
    }

    // Los checks de estado de la planilla son OBLIGATORIOS y hay que
    // declararlos explícitamente, uno por uno.
    //
    // Antes se guardaban con `body.x === false ? 0 : 1`, así que un campo
    // ausente quedaba registrado como "sí". Eso es grave justo en el sentido
    // contrario al que protege: si el Seguridad no marca "accesorios
    // íntegros", el sistema declaraba por su cuenta que el equipo llegó
    // completo. Cuando un cliente reclame que faltaba algo, ese registro es la
    // prueba de la empresa — y decía que sí sin que nadie lo hubiera revisado.
    //
    // `dentro_de_fecha` y `falla_cubierta_garantia` salieron de acá (#48): esa
    // evaluación de garantía viene resuelta y congelada en el ticket de RMA.
    // Se siguen aceptando si el cliente los manda (cola offline con builds
    // viejos), pero ya no se exigen ni se guardan.
    const CHECKS = ["accesorios_integros", "sin_manipulacion"] as const;

    for (const campo of CHECKS) {
      if (typeof body[campo] !== "boolean") {
        errors.push(`${campo} es obligatorio (true o false)`);
      }
    }

    // Clave de idempotencia de la cola offline del mostrador (#39). Opcional:
    // los envios con conexion no la mandan.
    const idempotencyKey = truncate(body.idempotency_key, MAX.idempotency_key);
    if (idempotencyKey !== null && !/^[A-Za-z0-9_-]{8,64}$/.test(idempotencyKey)) {
      errors.push("idempotency_key invalido");
    }

    // Envío con varios productos (issue #331): un solo ingreso, con lo que
    // pasó con cada producto. Se exige cuando el envío trae más de uno y ya
    // están las tablas; con uno solo, el ingreso de siempre.
    let productosIngreso: ProductoIngreso[] = [];
    if (errors.length === 0 && rmaCaseId !== null && (await hayTablasSeguridad())) {
      const productosCaso = await leerProductos(rmaCaseId);
      if (productosCaso.length > 1 || body.productos !== undefined) {
        const v = await validarProductosIngreso(rmaCaseId, body.productos);
        if ("error" in v) errors.push(v.error);
        else productosIngreso = v.filas;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ error: errors.join("; ") }, { status: 400 });
    }

    // Si esta clave ya se registro, devolver aquel ingreso en vez de crear otro.
    //
    // Esto es lo que hace segura la cola offline: cuando el telefono manda el
    // ingreso y la respuesta se pierde de vuelta, la cola no puede distinguir
    // "no llego" de "llego y no me entere", asi que reintenta. Sin esto,
    // quedarian dos actas de recepcion del mismo equipo y nadie sabria cual es
    // la buena.
    //
    // Se responde 200 y no 201 para que el cliente sepa que no creo nada nuevo.
    if (idempotencyKey !== null) {
      try {
        const yaExiste = await query(
          "SELECT id FROM seguridad_ingresos WHERE idempotency_key = ? LIMIT 1",
          [idempotencyKey],
        );
        if (yaExiste.rows.length > 0) {
          return NextResponse.json(
            { success: true, id: yaExiste.rows[0].id, duplicado: true },
            { status: 200 },
          );
        }
      } catch (e: any) {
        // Si la columna todavia no existe en esta base, se sigue adelante: es
        // preferible registrar el ingreso que rechazarlo por no poder
        // comprobar la clave.
        console.warn("idempotency_key no disponible:", e?.message);
      }
    }

    // Datos del acta, tal cual el ticket. Con varios productos (issue #331),
    // "hardware" y "serial" resumen el envío; el detalle va en los productos.
    const delEnvio = await leerProductos(rmaCaseId!);
    const varios = delEnvio.length > 1;
    const clienteNombre = truncate(caso.client_name || "", MAX.cliente_nombre) || "—";
    const hardware = varios
      ? delEnvio.map((x) => x.model || x.hardware || "").join(", ")
      : caso.model || caso.hardware || "";
    const serial = varios
      ? delEnvio.map((x) => x.serial).filter(Boolean).join(", ")
      : caso.serial || caso.serial_quantity || "";
    // Equipo externo: sin factura de Supricom (la pantalla dice "Producto externo").
    const facturaNumero = Number(caso.producto_externo) === 1 ? null : caso.invoice_number || null;
    const descripcionFalla = truncate(caso.reported_fault, MAX.descripcion_falla);

    await asegurarColumnasGarantiaNullables();
    // Crea las columnas recibido_seguridad_nombre / recibido_rma_nombre si esta
    // base todavía no las tiene (#50).
    await asegurarEsquemaPersonal();

    const result = await query(
      `INSERT INTO seguridad_ingresos
        (rma_case_id, fecha_entrega, factura_numero, cliente_nombre, hardware, serial,
         descripcion_falla, accesorios_integros, sin_manipulacion,
         recibido_por, recibido_seguridad_nombre, recibido_rma_nombre,
         foto_estado_url, idempotency_key,
         nd_numero, cids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        rmaCaseId,
        fechaEntrega,
        truncate(facturaNumero, MAX.factura_numero),
        clienteNombre,
        truncate(hardware, MAX.hardware),
        truncate(serial, MAX.serial),
        descripcionFalla,
        body.accesorios_integros ? 1 : 0,
        body.sin_manipulacion ? 1 : 0,
        recibidoPor,
        recibidoSeguridad,
        recibidoRma,
        truncate(body.foto_estado_url, MAX.foto_estado_url),
        idempotencyKey,
        // Número de guía: lo asigna el sistema (el siguiente de la sucursal),
        // ya no se escribe a mano. Se ignora el que mande el cliente.
        await siguienteGuia(cids),
        cids,
      ],
    );

    const insertId = (result.rows as any)?.insertId;
    if (insertId && productosIngreso.length) {
      await guardarProductosIngreso(insertId, productosIngreso);
    }
    // Las dos firmas del acta de recepción (seguridad_firmas, como las que se
    // hacen después desde el detalle). Si alguna no se guarda, el ingreso ya
    // quedó: se puede firmar desde su detalle.
    if (insertId) {
      for (const f of firmas) {
        try {
          await query(
            `INSERT INTO seguridad_firmas
               (acta_tipo, acta_id, rol, firmante_nombre, firma_data, firma_mime, cids)
             VALUES ('ingreso', ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE firmante_nombre = VALUES(firmante_nombre),
               firma_data = VALUES(firma_data), firma_mime = VALUES(firma_mime)`,
            [insertId, f.rol, f.nombre, f.png!.buffer, f.png!.mime, cids],
          );
        } catch (e: any) {
          console.error(`No se pudo guardar la firma ${f.rol} del ingreso ${insertId}:`, e?.message);
        }
      }
    }
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando ingreso:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
