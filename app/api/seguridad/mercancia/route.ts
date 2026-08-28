import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { parsearLista, serializarLista } from "@/lib/seguridad/mercancia";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX = {
  contraparte: 200,
  almacenista_nombre: 200,
  chofer_nombre: 200,
  placa_vehiculo: 50,
  odoo_picking_name: 100,
  factura_numero: 100,
  producto: 300,
  codigo: 100,
  observaciones: 5000,
  items: 500,
  listas: 30, // maximo de facturas o almacenistas por egreso
};

function truncar(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** GET: listado de movimientos de mercancia. */
export async function GET(request: NextRequest) {
  try {
    // Almacen ve lo mismo que Seguridad en esta lista — no hay hoy un campo
    // que diga quien registro cada fila, asi que no se puede filtrar "lo mio".
    // Lo que Almacen no tiene es el boton de verificar (eso vive en la
    // pantalla de detalle, gateada aparte).
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    const sp = new URL(request.url).searchParams;
    const tipo = (sp.get("tipo") || "").trim();
    const estado = (sp.get("estado") || "").trim();

    let where = "WHERE 1=1";
    const params: any[] = [];
    if (tipo === "ingreso" || tipo === "egreso") {
      where += " AND tipo = ?";
      params.push(tipo);
    }
    if (["pendiente", "conforme", "descuadre"].includes(estado)) {
      where += " AND estado = ?";
      params.push(estado);
    }
    // null = superadmin, ve todas las sucursales. Las filas viejas sin cids
    // (de antes de este filtro) quedan fuera para todos los demas — no se les
    // asigna una sucursal adivinada.
    if (cids !== null) {
      where += " AND m.cids = ?";
      params.push(cids);
    }

    const res = await query(
      `SELECT m.*,
        (SELECT COUNT(*) FROM seguridad_mercancia_items i
          WHERE i.mercancia_id = m.id) AS total_items,
        (SELECT COUNT(*) FROM seguridad_mercancia_items i
          WHERE i.mercancia_id = m.id
            AND i.cantidad_verificada IS NOT NULL
            AND i.cantidad_verificada <> i.cantidad_cargada) AS items_con_diferencia
       FROM seguridad_mercancia m ${where}
       ORDER BY m.fecha DESC, m.id DESC
       LIMIT 100`,
      params,
    );

    const movimientos = res.rows.map((row: any) => ({
      ...row,
      facturas: parsearLista(row.facturas_json).length
        ? parsearLista(row.facturas_json)
        : row.factura_numero
          ? [row.factura_numero]
          : [],
      almacenistas: parsearLista(row.almacenistas_json).length
        ? parsearLista(row.almacenistas_json)
        : [row.almacenista_nombre],
    }));

    return NextResponse.json({ success: true, movimientos });
  } catch (error: any) {
    console.error("Error listando mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** POST: registra la carga (o el ingreso) con sus renglones. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAlmacenOSeguridad(request);
    if (auth.error) return auth.error;

    const { cids, error: cidsError } = resolverCidsSesion(auth.payload);
    if (cidsError) return cidsError;

    let body: any;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Body invalido" }, { status: 400 });
    }

    const errores: string[] = [];

    const tipo = String(body?.tipo || "").trim();
    if (tipo !== "ingreso" && tipo !== "egreso") {
      errores.push("tipo debe ser ingreso o egreso");
    }

    // Almacen solo prepara egresos. El ingreso (mercancia que entra por
    // compra) sigue siendo exclusivo de Seguridad — no cambio de dueño en el
    // issue #42/#43, y `requireAlmacenOSeguridad` por si solo no distingue
    // esto: lo valida aqui, por tipo, dentro del handler.
    const rol = String(auth.payload?.role || "").toLowerCase().trim();
    if (tipo === "ingreso" && rol !== "seguridad" && rol !== "superadmin") {
      return NextResponse.json(
        { error: "El ingreso de mercancia lo registra Seguridad" },
        { status: 403 },
      );
    }

    const fecha = String(body?.fecha || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push("fecha invalida (YYYY-MM-DD)");
    }

    // Facturas: si llega `facturas` (array), es la fuente de verdad — un
    // camion puede salir con varias. Si no, se usa el `factura_numero` suelto
    // de siempre (asi el ingreso, que manda un solo valor, no cambia).
    const facturasJson = Array.isArray(body?.facturas)
      ? serializarLista(body.facturas, MAX.factura_numero, MAX.listas)
      : null;
    const listaFacturas = parsearLista(facturasJson);
    const facturaPrincipal = listaFacturas.length
      ? listaFacturas[0]
      : truncar(body?.factura_numero, MAX.factura_numero);

    // Almacenistas: mismo patron. `almacenista_nombre` sigue obligatorio —
    // todo registro tiene que decir quien responde — y sale del primero de
    // la lista cuando se manda `almacenistas`.
    const almacenistasJson = Array.isArray(body?.almacenistas)
      ? serializarLista(body.almacenistas, MAX.almacenista_nombre, MAX.listas)
      : null;
    const listaAlmacenistas = parsearLista(almacenistasJson);
    const almacenista = listaAlmacenistas.length
      ? listaAlmacenistas[0]
      : truncar(body?.almacenista_nombre, MAX.almacenista_nombre);

    if (!almacenista) {
      // Sin almacenista no hay a quien calificar ni a quien atribuir un
      // descuadre, que es justo para lo que existe este registro.
      errores.push("almacenista_nombre es obligatorio");
    }

    const items = Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) {
      errores.push("hace falta al menos un renglon");
    } else if (items.length > MAX.items) {
      errores.push(`maximo ${MAX.items} renglones`);
    }

    const limpios = items.slice(0, MAX.items).map((it: any) => ({
      odoo_product_id: Number.isFinite(Number(it?.odoo_product_id))
        ? Number(it.odoo_product_id)
        : null,
      producto: truncar(it?.producto, MAX.producto),
      codigo: truncar(it?.codigo, MAX.codigo),
      cantidad_cargada: Number(it?.cantidad_cargada),
    }));

    if (limpios.some((i: any) => !i.producto)) {
      errores.push("todos los renglones necesitan producto");
    }
    if (limpios.some((i: any) => !Number.isFinite(i.cantidad_cargada) || i.cantidad_cargada < 0)) {
      errores.push("cantidad_cargada invalida");
    }

    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join("; ") }, { status: 400 });
    }

    const res = await query(
      `INSERT INTO seguridad_mercancia
        (tipo, fecha, odoo_picking_id, odoo_picking_name, factura_numero,
         facturas_json, contraparte, almacenista_nombre, almacenistas_json,
         chofer_nombre, placa_vehiculo, observaciones, cids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tipo,
        fecha,
        Number.isFinite(Number(body?.odoo_picking_id))
          ? Number(body.odoo_picking_id)
          : null,
        truncar(body?.odoo_picking_name, MAX.odoo_picking_name),
        facturaPrincipal,
        facturasJson,
        truncar(body?.contraparte, MAX.contraparte),
        almacenista,
        almacenistasJson,
        truncar(body?.chofer_nombre, MAX.chofer_nombre),
        truncar(body?.placa_vehiculo, MAX.placa_vehiculo),
        truncar(body?.observaciones, MAX.observaciones),
        cids,
      ],
    );

    const id = (res.rows as any)?.insertId;

    // Los renglones en una sola sentencia: 300 INSERT sueltos en el porton,
    // con el camion esperando, se notan.
    const valores: any[] = [];
    const marcadores = limpios
      .map((i: any) => {
        valores.push(id, i.odoo_product_id, i.producto, i.codigo, i.cantidad_cargada);
        return "(?, ?, ?, ?, ?)";
      })
      .join(", ");

    await query(
      `INSERT INTO seguridad_mercancia_items
        (mercancia_id, odoo_product_id, producto, codigo, cantidad_cargada)
       VALUES ${marcadores}`,
      valores,
    );

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando movimiento de mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
