import { query } from "@/lib/db";
import { requireAlmacenOSeguridad, resolverCidsSesion } from "@/lib/seguridad/auth";
import { esTipoEntrega } from "@/lib/seguridad/egresoFlujo";
import { emitirMercancia } from "@/lib/seguridad/eventos";
import { filtroMercancia } from "@/lib/seguridad/filtros";
import {
  agruparLineas,
  buscarPickingEgresoPorId,
  parsearLista,
  serializarLista,
  type PickingOdoo,
} from "@/lib/seguridad/mercancia";
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

    // El mismo builder que usa el Excel: lo exportado es lo que se ve.
    const { where, params } = filtroMercancia(new URL(request.url).searchParams, cids);

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
    // El ingreso por factura de compra se reemplazo por la recepcion por
    // packing list (/api/recepcion): lo carga Compras y lo recibe Almacen.
    // Los ingresos viejos se siguen pudiendo leer; nuevos, ya no.
    if (tipo === "ingreso") {
      return NextResponse.json(
        { error: "El ingreso de mercancia ahora se hace por packing list" },
        { status: 410 },
      );
    }

    // El egreso arranca en Almacen: llega la orden, se asigna quien arma y de
    // ahi sigue por etapas hasta Seguridad (lib/seguridad/egresoFlujo). Que
    // Seguridad lo abriera se saltaria todo el armado.
    if (tipo === "egreso" && rol !== "almacen" && rol !== "superadmin") {
      return NextResponse.json(
        { error: "El egreso de mercancia lo inicia Almacen" },
        { status: 403 },
      );
    }

    const fecha = String(body?.fecha || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      errores.push("fecha invalida (YYYY-MM-DD)");
    }

    // Egreso por etapas: quien arma y como se entrega. La entrega decide si
    // hay paso de empaquetado (solo encomienda).
    const almacenistaArmado =
      tipo === "egreso" ? truncar(body?.almacenista_armado, MAX.almacenista_nombre) : null;
    const tipoEntrega = tipo === "egreso" ? body?.tipo_entrega : null;
    if (tipo === "egreso") {
      if (!almacenistaArmado) errores.push("falta el almacenista del armado");
      if (!esTipoEntrega(tipoEntrega)) errores.push("tipo de entrega invalido");
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
    // En el egreso por etapas el responsable inicial es quien arma; al
    // asignar el despacho pasa a ser el almacenista de despacho.
    const almacenistasJson =
      tipo === "egreso"
        ? serializarLista([almacenistaArmado], MAX.almacenista_nombre, MAX.listas)
        : Array.isArray(body?.almacenistas)
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

    if (errores.length > 0) {
      return NextResponse.json({ error: errores.join("; ") }, { status: 400 });
    }

    // Quien arma tiene que estar en el personal de Almacen de la sucursal,
    // igual que quien despacha (issue #302): se le califica el picking, y un
    // nombre escrito a mano no se suma a su historial.
    const armadoEnCatalogo = await query(
      `SELECT id FROM seguridad_catalogo_almacenistas
        WHERE nombre = ? ${cids !== null ? "AND cids = ?" : ""} LIMIT 1`,
      cids !== null ? [almacenistaArmado, cids] : [almacenistaArmado],
    );
    if (armadoEnCatalogo.rows.length === 0) {
      return NextResponse.json(
        { error: "El almacenista del armado no esta en el personal de Almacen" },
        { status: 400 },
      );
    }

    // La orden se relee de Odoo por su id en vez de creerle al navegador
    // (issue #298): de ahi salen el cliente, los renglones y la factura. Asi
    // no se registra una orden sin facturar aunque alguien arme el POST a
    // mano, ni con renglones distintos a los del picking.
    const pickingId = Number(body?.odoo_picking_id);
    let picking: PickingOdoo | null;
    try {
      picking = await buscarPickingEgresoPorId(pickingId, cids);
    } catch (e: any) {
      console.error("Error releyendo la orden de despacho en Odoo:", e?.message || e);
      return NextResponse.json({ error: "No se pudo consultar Odoo" }, { status: 502 });
    }
    if (!picking) {
      return NextResponse.json(
        { error: "No encontramos esa orden de despacho en Odoo" },
        { status: 404 },
      );
    }
    const facturasVenta = picking.facturas || [];
    if (facturasVenta.length === 0) {
      return NextResponse.json(
        { error: "Esta orden todavía no está facturada", codigo: "sin_factura" },
        { status: 409 },
      );
    }

    // Una orden de despacho, un egreso. La lista de pendientes ya las
    // esconde, pero buscando por numero se podia registrar dos veces.
    // El id de picking es unico en todo Odoo: no hace falta filtrar por cids.
    const repetido = await query(
      `SELECT id FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND odoo_picking_id = ? LIMIT 1`,
      [picking.odoo_picking_id],
    );
    if (repetido.rows.length > 0) {
      return NextResponse.json(
        {
          error: "Esta orden ya se registró como egreso",
          id: Number((repetido.rows[0] as any).id),
        },
        { status: 409 },
      );
    }

    if (picking.lineas.length === 0) {
      return NextResponse.json(
        { error: "La orden de despacho no tiene renglones en Odoo" },
        { status: 400 },
      );
    }
    if (picking.lineas.length > MAX.items) {
      return NextResponse.json({ error: `maximo ${MAX.items} renglones` }, { status: 400 });
    }
    const limpios = picking.lineas.map((l) => ({
      odoo_product_id: l.odoo_product_id,
      producto: truncar(l.producto, MAX.producto) || "—",
      codigo: truncar(l.codigo, MAX.codigo),
      cantidad_cargada: l.cantidad_cargada,
      lleva_serial: l.lleva_serial ? 1 : 0,
    }));

    const columnas = [
      "tipo", "fecha", "odoo_picking_id", "odoo_picking_name", "factura_numero",
      "facturas_json", "contraparte", "almacenista_nombre", "almacenistas_json",
      "chofer_nombre", "placa_vehiculo", "observaciones", "cids",
      "etapa", "tipo_entrega", "almacenista_armado",
    ];
    const valoresMov: unknown[] = [
      tipo,
      fecha,
      picking.odoo_picking_id,
      truncar(picking.odoo_picking_name, MAX.odoo_picking_name),
      facturaPrincipal,
      facturasJson,
      truncar(picking.contraparte, MAX.contraparte),
      almacenista,
      almacenistasJson,
      truncar(body?.chofer_nombre, MAX.chofer_nombre),
      truncar(body?.placa_vehiculo, MAX.placa_vehiculo),
      truncar(body?.observaciones, MAX.observaciones),
      cids,
      "por_armar",
      tipoEntrega,
      almacenistaArmado,
    ];
    // La factura se guarda sola, de Odoo: Almacen no la escribe.
    const columnasFactura = ["facturas_venta_json", "factura_venta_fecha"];
    const valoresFactura = [
      serializarLista(facturasVenta.map((f) => f.numero), MAX.factura_numero, MAX.listas),
      facturasVenta[0].fecha,
    ];

    const insertar = (cols: string[], vals: unknown[]) =>
      query(
        `INSERT INTO seguridad_mercancia (${cols.join(", ")})
         VALUES (${cols.map(() => "?").join(", ")})`,
        vals,
      );

    let res;
    try {
      res = await insertar([...columnas, ...columnasFactura], [...valoresMov, ...valoresFactura]);
    } catch (e: any) {
      // Sin la migracion (sql/egreso_facturas_venta.sql) el egreso se registra
      // igual, sin la factura: no se frena el despacho por una columna.
      if (!/Unknown column/i.test(e?.message || "")) throw e;
      console.warn(
        "[egreso] falta correr sql/egreso_facturas_venta.sql: se registra sin la factura",
      );
      res = await insertar(columnas, valoresMov);
    }

    const id = (res.rows as any)?.insertId;

    // Un renglon por producto (ver agruparLineas): si el mismo producto viene
    // dos veces se suma, para no contarlo dos veces por separado.
    const renglones = agruparLineas(limpios as any[]);

    // Los renglones en una sola sentencia: 300 INSERT sueltos en el porton,
    // con el camion esperando, se notan.
    // `lleva_serial` (issue #299) sale del tracking de Odoo. Sin la migracion
    // (sql/egreso_seriales.sql) se registra igual, sin esa columna.
    const insertarRenglones = (conSerial: boolean) => {
      const valores: any[] = [];
      const marcadores = renglones
        .map((i: any) => {
          valores.push(id, i.odoo_product_id, i.producto, i.codigo, i.cantidad_cargada);
          if (conSerial) valores.push(i.lleva_serial);
          return conSerial ? "(?, ?, ?, ?, ?, ?)" : "(?, ?, ?, ?, ?)";
        })
        .join(", ");
      return query(
        `INSERT INTO seguridad_mercancia_items
          (mercancia_id, odoo_product_id, producto, codigo, cantidad_cargada${conSerial ? ", lleva_serial" : ""})
         VALUES ${marcadores}`,
        valores,
      );
    };
    try {
      await insertarRenglones(true);
    } catch (e: any) {
      if (!/Unknown column/i.test(e?.message || "")) throw e;
      console.warn("[egreso] falta correr sql/egreso_seriales.sql: renglones sin lleva_serial");
      await insertarRenglones(false);
    }

    // Aviso en vivo: Seguridad ve aparecer el registro que Almacen acaba de
    // preparar sin recargar la pantalla del porton.
    emitirMercancia(
      {
        accion: "creado",
        id,
        tipo: tipo as "ingreso" | "egreso",
        etapa: tipo === "egreso" ? "por_armar" : undefined,
        documento: picking.odoo_picking_name,
      },
      cids,
    );

    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (error: any) {
    console.error("Error creando movimiento de mercancia:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
