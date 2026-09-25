import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { leerSerialesEgreso } from "@/lib/seguridad/seriales";

/**
 * Documentos de Odoo para la seccion Mercancia.
 *
 * Los dos flujos trabajan por documentos distintos: la mercancia que ENTRA
 * se sigue por la factura de la orden de compra (account.move, in_invoice —
 * Seguridad no maneja el picking de ingreso en el dia a dia, la factura es el
 * documento que tiene en la mano). La que SALE se sigue por la orden de
 * despacho (stock.picking, entrega/outgoing): es el documento que realmente
 * dice si el camion esta listo para salir — una factura de venta puede estar
 * `posted` sin que el almacen haya alistado nada, mientras que el picking
 * pasa a "Listo" (`assigned`) recien cuando el inventario esta apartado y
 * listo para cargar. Antes esto tambien se seguia por factura de venta; se
 * volvio a picking porque la factura no reflejaba si el despacho estaba
 * realmente listo. La factura no se descarta: es la que dispara el trabajo
 * de Almacen (issue #298), asi que el egreso pide las dos — picking listo y
 * orden de venta facturada.
 *
 * La lista de renglones sale de Odoo, no de lo que alguien escriba a mano: si
 * el papel lo llena el mismo que carga, verificar contra el no prueba nada.
 */

export type LineaPicking = {
  odoo_product_id: number | null;
  producto: string;
  codigo: string | null;
  cantidad_cargada: number;
  /** Solo egreso: el producto lleva serial en Odoo (`tracking = 'serial'`). */
  lleva_serial?: boolean;
};

/** Factura de cliente publicada de la orden de venta de un picking (issue #298). */
export type FacturaVenta = {
  numero: string;
  /** `invoice_date` de Odoo: solo fecha. Odoo no guarda la hora de publicacion. */
  fecha: string | null;
  /** `create_date`: desempata dos facturas del mismo dia. */
  creada: string | null;
};

export type PickingOdoo = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  /** Proveedor en un ingreso, cliente en un egreso. */
  contraparte: string;
  estado: string;
  origen: string | null;
  lineas: LineaPicking[];
  /** Solo egreso: facturas vigentes de la orden de venta. Vacio = sin facturar. */
  facturas?: FacturaVenta[];
};

export type PickingResumen = {
  odoo_picking_id: number;
  odoo_picking_name: string;
  contraparte: string;
  estado: string;
  origen: string | null;
  fecha: string | null;
  facturas: FacturaVenta[];
};

/**
 * Un renglon por producto. Odoo trae una stock.move.line por lote o
 * ubicacion de donde se saca, asi que un producto que sale de dos estantes
 * llegaba como dos renglones y se contaba dos veces por separado. Se suman
 * las cantidades y se deja el orden en que aparece cada producto por primera
 * vez. Sin id de Odoo se agrupa por codigo + nombre.
 */
export function agruparLineas<T extends LineaPicking>(lineas: T[]): T[] {
  const porClave = new Map<string, T>();
  for (const l of lineas) {
    const clave =
      l.odoo_product_id != null
        ? `id:${l.odoo_product_id}`
        : `txt:${(l.codigo || "").trim().toUpperCase()}|${l.producto.trim().toUpperCase()}`;
    const ya = porClave.get(clave);
    if (ya) {
      // Redondeo para que 0.1 + 0.2 no quede en 0.30000000000000004.
      ya.cantidad_cargada = Math.round((ya.cantidad_cargada + l.cantidad_cargada) * 1000) / 1000;
    } else {
      porClave.set(clave, { ...l });
    }
  }
  return [...porClave.values()];
}

/**
 * Listas de facturas y almacenistas por egreso (issue #43).
 *
 * Un camion puede salir con varias facturas y con mas de un almacenista
 * cargandolo. Se guardan como JSON en una columna de texto, mismo patron que
 * `seguridad_despachos.facturas_json` en RMA — no una tabla aparte, porque no
 * hace falta consultarlas por separado, solo mostrarlas junto al registro.
 */
export function serializarLista(items: unknown, max: number, maxItems: number): string | null {
  if (!Array.isArray(items)) return null;
  const limpios = items
    .map((v) => String(v ?? "").trim().slice(0, max))
    .filter((v) => v.length > 0)
    .slice(0, maxItems);
  return limpios.length > 0 ? JSON.stringify(limpios) : null;
}

export function parsearLista(json: unknown): string[] {
  if (!json || typeof json !== "string") return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.map((x) => String(x)) : [];
  } catch {
    return [];
  }
}

/**
 * Un movimiento con sus renglones y calificaciones, listo para la pantalla.
 *
 * Vive aca y no en una ruta porque lo usan dos: el detalle/verificacion del
 * flujo simple y las acciones del egreso por etapas. Las dos tienen que
 * devolver exactamente la misma forma, o la pantalla se rompe segun por que
 * camino llego el dato.
 */
export async function cargarMovimiento(id: number) {
  const mov = await query("SELECT * FROM seguridad_mercancia WHERE id = ?", [id]);
  if (mov.rows.length === 0) return null;
  const items = await query(
    "SELECT * FROM seguridad_mercancia_items WHERE mercancia_id = ? ORDER BY id",
    [id],
  );
  // Plural: puede haber mas de un almacenista por egreso (issue #43), y cada
  // uno se califica aparte. Antes se traia solo uno con LIMIT 1, que se
  // quedaba con la primera calificacion y ocultaba el resto.
  const calif = await query(
    `SELECT id, almacenista_nombre, calificacion, comentario, calificado_por, created_at
       FROM seguridad_calificaciones
      WHERE relacionado_a = 'mercancia' AND relacionado_id = ?
      ORDER BY id`,
    [id],
  ).catch(() => ({ rows: [] as any[] }));

  const fila = mov.rows[0] as any;
  const facturas = parsearLista(fila.facturas_json).length
    ? parsearLista(fila.facturas_json)
    : fila.factura_numero
      ? [fila.factura_numero]
      : [];
  const almacenistas = parsearLista(fila.almacenistas_json).length
    ? parsearLista(fila.almacenistas_json)
    : [fila.almacenista_nombre];
  // Facturas de venta traidas de Odoo al registrar (issue #298). Aparte de
  // `facturas`, que en el egreso son las ordenes de despacho del camion.
  const facturas_venta = parsearLista(fila.facturas_venta_json);
  // Seriales esperados, leidos del picking de Odoo (issue #299).
  const seriales = fila.tipo === "egreso" ? await leerSerialesEgreso(id) : [];

  return {
    movimiento: { ...fila, facturas, almacenistas, facturas_venta },
    items: items.rows as any[],
    calificaciones: calif.rows as any[],
    seriales,
  };
}

/**
 * El nombre del producto en Odoo viene como "[CODIGO] Descripcion".
 * Se separan para que el codigo se pueda leer de un vistazo en el porton,
 * que es donde alguien compara caja contra pantalla.
 */
function partirProducto(nombre: string): { codigo: string | null; producto: string } {
  const m = String(nombre || "").match(/^\s*\[([^\]]+)\]\s*(.*)$/);
  if (!m) return { codigo: null, producto: String(nombre || "").trim() };
  return { codigo: m[1].trim(), producto: m[2].trim() || m[1].trim() };
}

/**
 * Busca una factura (compra o venta) por su numero, ej. "FACTU/2026/08/0064".
 *
 * Acepta tambien la referencia (`ref`), que es lo que muchas veces trae el
 * papel en la mano: el numero interno de Odoo no siempre esta impreso.
 *
 * Solo lineas de producto: una factura trae ademas secciones, notas y lineas
 * de impuesto, y contar eso en el porton no significa nada.
 *
 * `cids` acota la busqueda a la sucursal de quien la hace (9=Valencia,
 * 10=Caracas, 7=Panama) — sin esto, cualquiera podia buscar y verificar una
 * factura de otra sucursal con solo saber (o adivinar) su numero. `null` es
 * "sin filtro" (superadmin).
 */
async function buscarFactura(
  numero: string,
  cids: number | null,
  moveType: "in_invoice" | "out_invoice",
): Promise<PickingOdoo | null> {
  const limpio = String(numero || "").trim();
  if (!limpio || limpio.length > 100) return null;

  const domain: any[] = [["move_type", "=", moveType]];
  if (cids !== null) domain.push(["company_id", "=", cids]);
  domain.push("|", ["name", "=", limpio], ["ref", "=", limpio]);

  const facturas = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [domain],
    { fields: ["name", "partner_id", "state", "invoice_origin", "ref"], limit: 1 },
  );

  const f = facturas?.[0];
  if (!f) return null;

  const lineas_raw = await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [
      [
        ["move_id", "=", f.id],
        ["display_type", "=", "product"],
      ],
    ],
    { fields: ["product_id", "quantity", "name"], limit: 500 },
  );

  const lineas: LineaPicking[] = (lineas_raw || []).map((l: any) => {
    // Si la linea no tiene producto de catalogo, se usa su descripcion: es lo
    // unico que identifica lo que salio/llego, y perderla dejaria un renglon
    // mudo.
    const etiqueta = l.product_id?.[1] || l.name || "";
    const { codigo, producto } = partirProducto(etiqueta);
    return {
      odoo_product_id: l.product_id?.[0] ?? null,
      producto,
      codigo,
      cantidad_cargada: Number(l.quantity || 0),
    };
  });

  return {
    odoo_picking_id: f.id,
    odoo_picking_name: f.name,
    // Proveedor en una factura de compra, cliente en una de venta.
    contraparte: f.partner_id?.[1] || "",
    estado: f.state || "",
    origen: f.invoice_origin || f.ref || null,
    lineas,
  };
}

/** Factura de la orden de compra — el documento con el que llega la mercancia (ingreso). */
export async function buscarFacturaCompra(
  numero: string,
  cids: number | null,
): Promise<PickingOdoo | null> {
  return buscarFactura(numero, cids, "in_invoice");
}

/**
 * Facturas de cliente vigentes de cada orden de venta (issue #298): la
 * factura es la que dispara el trabajo de Almacen, una orden sin facturar no
 * se arma.
 *
 * Se llega por `sale.order.invoice_ids` y no por `invoice_origin`: hay
 * ordenes de compañias distintas con el mismo nombre (ver
 * lib/servicio-tecnico/factura.ts).
 *
 * Vigente = `out_invoice` publicada y no revertida. Quedan fuera:
 *  - el borrador: Odoo ya marca la orden como `invoiced` con la factura en
 *    borrador, por eso no sirve mirar `invoice_status`;
 *  - la cancelada;
 *  - la revertida por completo con una nota de credito (`payment_state =
 *    'reversed'`): la orden vuelve a estar por facturar.
 *
 * Si Odoo no responde lanza en vez de devolver vacio: "nadie facturo nada"
 * y "no se pudo preguntar" tienen que verse distinto en la pantalla.
 */
async function facturasDeVentas(saleIds: number[]): Promise<Map<number, FacturaVenta[]>> {
  const porVenta = new Map<number, FacturaVenta[]>();
  if (saleIds.length === 0) return porVenta;

  const ventas = await callOdooRPC<any[]>("sale.order", "read", [saleIds, ["invoice_ids"]]);
  if (!ventas) throw new Error("no se pudieron leer las ordenes de venta");

  const invoiceIds = [...new Set(ventas.flatMap((v: any) => v.invoice_ids || []))];
  const vigentes = new Map<number, FacturaVenta>();
  if (invoiceIds.length > 0) {
    const facturas = await callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [
        [
          ["id", "in", invoiceIds],
          ["move_type", "=", "out_invoice"],
          ["state", "=", "posted"],
          ["payment_state", "!=", "reversed"],
        ],
      ],
      { fields: ["name", "invoice_date", "create_date"] },
    );
    if (!facturas) throw new Error("no se pudieron leer las facturas");
    for (const f of facturas) {
      vigentes.set(f.id, {
        numero: f.name,
        fecha: f.invoice_date || null,
        creada: f.create_date || null,
      });
    }
  }

  for (const v of ventas) {
    const lista = (v.invoice_ids || [])
      .map((id: number) => vigentes.get(id))
      .filter(Boolean) as FacturaVenta[];
    porVenta.set(v.id, lista.sort(compararFacturas));
  }
  return porVenta;
}

function compararFacturas(a: FacturaVenta, b: FacturaVenta): number {
  return (
    String(a.fecha || "").localeCompare(String(b.fecha || "")) ||
    String(a.creada || "").localeCompare(String(b.creada || ""))
  );
}

/**
 * Orden de despacho (stock.picking, tipo "entrega"/outgoing) — el documento
 * con el que sale la mercancia (egreso). Trae tambien las facturas vigentes
 * de su orden de venta (`facturas`, vacio = todavia no facturada).
 *
 * El `name` de un picking (ej. "CENT1/OUT/06321") NO es unico entre
 * compañias: el mismo prefijo de almacen se reutiliza en mas de una, asi que
 * `cids` no es solo un filtro de conveniencia aca — sin el, dos pickings
 * distintos con el mismo nombre son ambiguos y `search_read` puede devolver
 * el que no es. Un superadmin (`cids: null`) queda expuesto a esa ambiguedad;
 * en la practica quien busca aca siempre es Almacen o Seguridad, con su
 * sucursal ya resuelta. Por eso al registrar se relee por id
 * (`buscarPickingEgresoPorId`), que no es ambiguo.
 */
export async function buscarPickingEgreso(
  numero: string,
  cids: number | null,
): Promise<PickingOdoo | null> {
  const limpio = String(numero || "").trim();
  if (!limpio || limpio.length > 100) return null;
  return leerPickingEgreso([["name", "=", limpio]], cids);
}

export async function buscarPickingEgresoPorId(
  id: number,
  cids: number | null,
): Promise<PickingOdoo | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  return leerPickingEgreso([["id", "=", id]], cids);
}

async function leerPickingEgreso(
  filtro: any[],
  cids: number | null,
): Promise<PickingOdoo | null> {
  const domain: any[] = [...filtro, ["picking_type_id.code", "=", "outgoing"]];
  if (cids !== null) domain.push(["company_id", "=", cids]);

  const pickings = await callOdooRPC<any[]>(
    "stock.picking",
    "search_read",
    [domain],
    { fields: ["name", "partner_id", "state", "origin", "sale_id"], limit: 1 },
  );

  const p = pickings?.[0];
  if (!p) return null;

  const lineas_raw = await callOdooRPC<any[]>(
    "stock.move.line",
    "search_read",
    [[["picking_id", "=", p.id]]],
    { fields: ["product_id", "quantity", "tracking"], limit: 500 },
  );

  // Los seriales NO se leen aca: en un picking "Listo" todavia no estan (ver
  // lib/seguridad/seriales.ts). Solo se anota que producto los lleva.
  const lineas: LineaPicking[] = agruparLineas(
    (lineas_raw || []).map((l: any) => {
      const etiqueta = l.product_id?.[1] || "";
      const { codigo, producto } = partirProducto(etiqueta);
      return {
        odoo_product_id: l.product_id?.[0] ?? null,
        producto,
        codigo,
        cantidad_cargada: Number(l.quantity || 0),
        lleva_serial: l.tracking === "serial",
      };
    }),
  );

  // Sin orden de venta (ej. una devolucion a proveedor) no hay factura de
  // cliente: queda como no facturada.
  const saleId = p.sale_id?.[0] ?? null;
  const facturas = saleId ? (await facturasDeVentas([saleId])).get(saleId) || [] : [];

  return {
    odoo_picking_id: p.id,
    odoo_picking_name: p.name,
    contraparte: p.partner_id?.[1] || "",
    estado: p.state || "",
    // Referencia a la orden de venta de origen (ej. "S-04680"), para que el
    // almacenista pueda ubicar el pedido aunque solo tenga a mano el numero
    // de orden de despacho o viceversa.
    origen: p.origin || null,
    lineas,
    facturas,
  };
}

/**
 * Ordenes de despacho (egresos) que Odoo ya tiene "Listas" (`assigned`) —
 * inventario apartado y listo para cargar el camion —, con factura de
 * cliente vigente (issue #298), y que Almacen aun no proceso.
 *
 * Hacen falta las dos cosas: `assigned` dice que el inventario esta apartado
 * y la factura dice que Caja ya facturo. En Odoo casi todo se factura por
 * cantidad pedida (`invoice_policy = order`), asi que la factura existe
 * antes de despachar: en septiembre de 2026 las ~1.500 salidas de Valencia y
 * Caracas se facturaron todas antes de validar el picking.
 *
 * Ordenadas por fecha de factura, la mas vieja primero: es el orden en que
 * le llegaron a Almacen. `sin_facturar` cuenta las listas que quedaron
 * afuera, para que Almacen sepa que existen aunque todavia no le toquen.
 *
 * El cruce con lo ya procesado se hace en MySQL (`seguridad_mercancia`)
 * porque Odoo no sabe nada de nuestros registros. `cids` acota por sucursal
 * (null = superadmin, sin filtro), mismo criterio que el resto del modulo.
 */
export async function listarPickingsEgresoPendientes(
  cids: number | null,
): Promise<{ ordenes: PickingResumen[]; sin_facturar: number }> {
  const domain: any[] = [
    ["picking_type_id.code", "=", "outgoing"],
    ["state", "=", "assigned"],
  ];
  if (cids !== null) domain.push(["company_id", "=", cids]);

  // Odoo y MySQL fallan de formas distintas y con causas distintas — se
  // etiqueta cada uno para que el error que llega al caller diga cual de
  // los dos fue, en vez de un generico "no se pudo consultar Odoo" que
  // culpa a Odoo aunque el problema sea la base local (ej. la migracion de
  // `cids` en seguridad_mercancia sin correr todavia).
  let pickings: any[] | null;
  let facturas: Map<number, FacturaVenta[]>;
  try {
    pickings = await callOdooRPC<any[]>(
      "stock.picking",
      "search_read",
      [domain],
      {
        fields: ["name", "partner_id", "state", "origin", "scheduled_date", "sale_id"],
        // Las mas viejas primero: si alguna vez hay mas de 200 listas, las
        // que quedan afuera son las recien llegadas, no las que llevan dias.
        order: "scheduled_date asc",
        limit: 200,
      },
    );
    if (!pickings || pickings.length === 0) return { ordenes: [], sin_facturar: 0 };
    facturas = await facturasDeVentas([
      ...new Set(pickings.map((p: any) => p.sale_id?.[0]).filter(Boolean)),
    ] as number[]);
  } catch (e: any) {
    throw new Error(`[odoo] ${e?.message || e}`);
  }

  let usados: { rows: any[] };
  try {
    usados = await query(
      `SELECT odoo_picking_id FROM seguridad_mercancia
        WHERE tipo = 'egreso' AND odoo_picking_id IS NOT NULL
          ${cids !== null ? "AND cids = ?" : ""}`,
      cids !== null ? [cids] : [],
    );
  } catch (e: any) {
    throw new Error(`[mysql] ${e?.message || e}`);
  }
  const idsUsados = new Set(
    (usados.rows as any[]).map((r) => Number(r.odoo_picking_id)),
  );

  const porProcesar = pickings
    .filter((p: any) => !idsUsados.has(p.id))
    .map((p: any) => ({
      odoo_picking_id: p.id,
      odoo_picking_name: p.name,
      contraparte: p.partner_id?.[1] || "",
      estado: p.state || "",
      origen: p.origin || null,
      fecha: p.scheduled_date || null,
      facturas: (p.sale_id && facturas.get(p.sale_id[0])) || [],
    }));

  const ordenes = porProcesar
    .filter((o) => o.facturas.length > 0)
    .sort((a, b) => compararFacturas(a.facturas[0], b.facturas[0]));

  return { ordenes, sin_facturar: porProcesar.length - ordenes.length };
}

/**
 * Compara lo cargado contra lo verificado.
 *
 * Un renglon sin contar (`cantidad_verificada` null) NO cuenta como faltante:
 * "todavia no lo revise" y "conte cero" son cosas distintas, y confundirlas
 * marcaria descuadre en cada acta a medio llenar.
 *
 * `no_salio` (issue #44) es una senal aparte del conteo numerico: un renglon
 * puede salir en cantidad parcial (3 de 4) sin ser "no salio", y al reves, se
 * puede marcar "no salio" sin llegar a contar la cantidad. El checkbox manda
 * sobre la cantidad cuando estan en conflicto — es la razon por la que Seguridad
 * lo marco explicitamente.
 */
export function evaluarDescuadre(
  items: Array<{
    cantidad_cargada: number;
    cantidad_verificada: number | null;
    no_salio?: boolean;
  }>,
): { estado: "pendiente" | "conforme" | "descuadre"; diferencias: number } {
  const marcados = items.filter((i) => i.no_salio).length;

  const contados = items.filter((i) => i.cantidad_verificada !== null);
  const conDiferenciaCantidad = contados.filter(
    (i) => !i.no_salio && Number(i.cantidad_verificada) !== Number(i.cantidad_cargada),
  ).length;

  const diferencias = marcados + conDiferenciaCantidad;
  if (diferencias > 0) return { estado: "descuadre", diferencias };

  if (contados.length === 0) return { estado: "pendiente", diferencias: 0 };

  // Conforme solo si ademas no quedo ningun renglon sin contar: si falta por
  // revisar la mitad del camion, eso no es "todo correcto".
  if (contados.length < items.length) return { estado: "pendiente", diferencias: 0 };

  return { estado: "conforme", diferencias: 0 };
}
