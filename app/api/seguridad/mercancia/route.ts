import { query } from "@/lib/db";
import { requireSeguridad } from "@/lib/seguridad/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const MAX = {
  cliente_nombre: 200,
  almacenista_nombre: 200,
  chofer_nombre: 200,
  placa_vehiculo: 50,
  odoo_picking_name: 100,
  factura_numero: 100,
  producto: 300,
  codigo: 100,
  observaciones: 5000,
  items: 500,
};

function truncar(v: any, max: number): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** GET: listado de movimientos de mercancia. */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

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

    return NextResponse.json({ success: true, movimientos: res.rows });
  } catch (error: any) {
    console.error("Error listando mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/** POST: registra la carga (o el ingreso) con sus renglones. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireSeguridad(request);
    if (auth.error) return auth.error;

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

    const fecha = String(body?.fecha || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push("fecha invalida (YYYY-MM-DD)");
    }

    const almacenista = truncar(body?.almacenista_nombre, MAX.almacenista_nombre);
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
         cliente_nombre, almacenista_nombre, chofer_nombre, placa_vehiculo,
         observaciones)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tipo,
        fecha,
        Number.isFinite(Number(body?.odoo_picking_id))
          ? Number(body.odoo_picking_id)
          : null,
        truncar(body?.odoo_picking_name, MAX.odoo_picking_name),
        truncar(body?.factura_numero, MAX.factura_numero),
        truncar(body?.cliente_nombre, MAX.cliente_nombre),
        almacenista,
        truncar(body?.chofer_nombre, MAX.chofer_nombre),
        truncar(body?.placa_vehiculo, MAX.placa_vehiculo),
        truncar(body?.observaciones, MAX.observaciones),
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
