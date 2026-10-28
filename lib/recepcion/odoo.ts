import { query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { normalizarCodigo } from "@/lib/escaneo/codigos";
import { SUCURSALES, type EstadoOdoo } from "@/lib/recepcion/flujo";
import { cargarRecepcion } from "@/lib/recepcion/servidor";
import { asegurarColumnasOdoo } from "@/lib/recepcion/columnasOdoo";

export { asegurarColumnasOdoo };

/**
 * La recepcion del panel contra Odoo: de que OC sale lo esperado y, al
 * cerrar, cargar lo contado en Odoo de una vez.
 *
 * Lo que hay en Odoo (medido en octubre de 2026, Odoo 17):
 *  - Valencia le vende a Caracas: factura de cliente en Valencia (cids 9, ej.
 *    "5038581") y, en Caracas (cids 10), una OC hacia "OFFICE SOLUTIONS
 *    CENTER 2004, C.A" (ej. P-00144) con su recepcion pendiente. No hay
 *    reglas intercompania: la OC la hace Caracas a mano y la factura de
 *    proveedor que registra despues lleva en `ref` el numero de la de
 *    Valencia.
 *  - Los almacenes principales reciben en 2 pasos: la recepcion (IN,
 *    Proveedor -> Entrada, con los seriales) y un traslado (INT, Entrada ->
 *    Existencias) encadenado a ella. Hoy los validan a mano uno detras del
 *    otro; aca se validan los dos ("la recepcion y la carga").
 *  - En una recepcion "Lista" cada unidad con serial ya tiene su linea con
 *    cantidad 1 y sin serial. Se reemplazan las lineas por las de lo contado:
 *    una por serial pistoleado (`lot_name`, Odoo crea el lote de la sede) o
 *    una con la cantidad.
 *
 * Reglas (las eligio el usuario):
 *  - Llego menos: Odoo deja pendiente lo que falta (backorder), como hoy.
 *  - Llego mas: se carga todo lo que llego, aunque pase lo de la OC. Un
 *    producto que no esta en la OC entra como linea nueva de la recepcion.
 *  - Cajas abiertas, humedas o danadas: entran a Existencias como las demas;
 *    el dano queda reportado en el panel.
 *
 * Las escrituras en Odoo quedan a nombre del usuario de ODOO_API_KEY: por eso
 * cada recepcion validada lleva una nota en su chatter con quien cerro.
 *
 * NUNCA se carga dos veces lo mismo. Lo cuidan:
 *  - `odoo_estado = 'cargado'`: una recepcion cargada no se vuelve a cargar.
 *  - El candado `cargando` (uno a la vez por recepcion).
 *  - `odoo_resultado.cargado`: lo ya cargado por producto; un reintento solo
 *    carga lo que falta.
 *  - `odoo_resultado.intento`: antes de validar un picking se anota cual es y
 *    que lleva. Si se corta despues de que Odoo valido (red, caida, error al
 *    guardar), el siguiente intento ve el picking Hecho y lo da por cargado en
 *    vez de volver a cargarlo.
 *  - Recepciones hechas a mano en Odoo: si la OC recibio algo que el panel no
 *    hizo desde que empezo esta recepcion (`odoo_recepciones_previas`), se
 *    frena: puede ser esta misma mercancia.
 *  - La misma factura no se recibe dos veces, ni el mismo packing list
 *    (referencia) en la misma sede.
 * Los dos ultimos frenos los puede saltar solo el SuperAdmin, despues de
 * revisar en Odoo que no es la misma mercancia.
 */

const SEDES = SUCURSALES.map((s) => s.cids);
const nombreSede = (cids: number) => SUCURSALES.find((s) => s.cids === Number(cids))?.nombre ?? `Sede ${cids}`;

/** Lectura o escritura en Odoo que, si falla, lanza con el motivo de Odoo. */
async function odoo<T = any>(model: string, method: string, args: any[], kwargs: Record<string, any> = {}): Promise<T> {
  const r = await callOdooRPCEstricto<T>(model, method, args, kwargs);
  return r as T;
}

const m2o = (v: any): number => (Array.isArray(v) ? Number(v[0]) : Number(v) || 0);
const sinCodigo = (s: string) => String(s || "").replace(/^\[[^\]]*\]\s*/, "").trim();
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export class ErrorRecepcion extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// OC de Odoo con recepcion pendiente
// ---------------------------------------------------------------------------

export type OcPendiente = {
  id: number;
  nombre: string;
  proveedor: string;
  fecha: string | null;
  total: number;
  /** Recibida a medias (ya hubo una recepcion antes). */
  parcial: boolean;
};

/** OC confirmadas de la sede que todavia esperan mercancia. */
export async function ocsPendientes(cids: number): Promise<OcPendiente[]> {
  const pos = await odoo<any[]>(
    "purchase.order",
    "search_read",
    [[["company_id", "=", cids], ["state", "=", "purchase"], ["receipt_status", "in", ["pending", "partial"]]]],
    { fields: ["name", "partner_id", "date_approve", "amount_total", "receipt_status"], order: "date_approve desc, id desc", limit: 300 },
  );
  return (pos || []).map((p) => ({
    id: p.id,
    nombre: String(p.name),
    proveedor: Array.isArray(p.partner_id) ? String(p.partner_id[1]) : "—",
    fecha: p.date_approve || null,
    total: Number(p.amount_total) || 0,
    parcial: p.receipt_status === "partial",
  }));
}

/** La OC, si es de la sede y espera mercancia. */
export async function ocPendiente(cids: number, poId: number): Promise<OcPendiente | null> {
  const [p] = await odoo<any[]>(
    "purchase.order",
    "search_read",
    [[["id", "=", poId], ["company_id", "=", cids], ["state", "=", "purchase"]]],
    { fields: ["name", "partner_id", "date_approve", "amount_total", "receipt_status"], limit: 1 },
  );
  if (!p || p.receipt_status === "full") return null;
  return {
    id: p.id,
    nombre: String(p.name),
    proveedor: Array.isArray(p.partner_id) ? String(p.partner_id[1]) : "—",
    fecha: p.date_approve || null,
    total: Number(p.amount_total) || 0,
    parcial: p.receipt_status === "partial",
  };
}

/**
 * La OC de Odoo que Compras eligio para un packing list: tiene que ser de la
 * sede y esperar mercancia. null si no eligio ninguna.
 */
export async function validarOcElegida(cids: number, valor: unknown): Promise<OcPendiente | null> {
  const poId = Number(valor);
  if (valor === null || valor === undefined || valor === "" || !poId) return null;
  const oc = await ocPendiente(cids, poId);
  if (!oc) throw new ErrorRecepcion("La OC de Odoo elegida no es de esa sucursal o ya no espera mercancia");
  return oc;
}

/** Recepciones (IN) ya validadas de la OC, con su nombre. */
async function recepcionesHechas(poId: number): Promise<Array<{ id: number; nombre: string }>> {
  const r = await odoo<any[]>(
    "stock.picking",
    "search_read",
    [[["purchase_id", "=", poId], ["picking_type_code", "=", "incoming"], ["state", "=", "done"]]],
    { fields: ["name"], limit: 2000 },
  );
  return (r || []).map((p) => ({ id: p.id, nombre: String(p.name) }));
}

/**
 * Guarda la OC elegida (o la quita) y la foto de lo que esa OC ya tenia
 * recibido en Odoo: lo que se reciba a mano despues no se vuelve a cargar.
 */
export async function guardarOcElegida(id: number, oc: OcPendiente | null): Promise<void> {
  await asegurarColumnasOdoo();
  const previas = oc ? (await recepcionesHechas(oc.id)).map((p) => p.id) : null;
  await query(
    "UPDATE recepcion_packing SET odoo_purchase_order_id = ?, odoo_oc_nombre = ?, odoo_recepciones_previas = ? WHERE id = ?",
    [oc?.id ?? null, oc?.nombre ?? null, previas ? JSON.stringify(previas) : null, id],
  );
}

const normalizarReferencia = (v: unknown) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");

/**
 * Otro packing list de la sede con la misma referencia: cargarlo dos veces
 * cargaria la misma mercancia dos veces en Odoo.
 */
export async function packingListRepetido(cids: number, referencia: string, excluirId?: number): Promise<number | null> {
  await asegurarColumnasOdoo();
  const r = await query(
    `SELECT id FROM recepcion_packing
      WHERE cids = ? AND origen = 'packing_list' AND UPPER(TRIM(referencia)) = ? AND id <> ?
      ORDER BY id LIMIT 1`,
    [cids, normalizarReferencia(referencia), excluirId ?? 0],
  );
  return (r.rows as any[])[0]?.id ?? null;
}

// ---------------------------------------------------------------------------
// Factura de otra sede (Valencia -> Caracas)
// ---------------------------------------------------------------------------

export type LineaFactura = { product_id: number; codigo: string | null; producto: string; cantidad: number };

export type OcCandidata = OcPendiente & {
  /** La factura de proveedor de esa OC lleva el numero de la factura. */
  por_factura_proveedor: boolean;
  /** Mismo total que la factura. */
  mismo_total: boolean;
  /** Productos de la factura que la OC espera (0 a 1). */
  cobertura: number;
};

export type FacturaParaRecibir = {
  factura: { id: number; nombre: string; cids_origen: number; sede_origen: string; fecha: string | null; total: number };
  lineas: LineaFactura[];
  candidatas: OcCandidata[];
};

export async function leerFactura(numero: string, cidsDestino: number): Promise<FacturaParaRecibir> {
  const nro = String(numero || "").trim();
  if (!nro) throw new ErrorRecepcion("Escribe el numero de la factura");
  const origenes = SEDES.filter((c) => c !== cidsDestino);

  const facturas = await odoo<any[]>(
    "account.move",
    "search_read",
    [[["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["name", "=", nro], ["company_id", "in", origenes]]],
    { fields: ["name", "company_id", "invoice_date", "amount_total"], limit: 5 },
  );
  if (!facturas?.length) {
    throw new ErrorRecepcion(
      `No se encontro la factura ${nro} en ${origenes.map(nombreSede).join(" ni en ")} (tiene que estar publicada)`,
      404,
    );
  }
  if (facturas.length > 1) {
    throw new ErrorRecepcion(`La factura ${nro} esta en mas de una sede: avisale a sistemas`, 409);
  }
  const f = facturas[0];

  // Toda suma de cantidades en account.move.line necesita display_type =
  // 'product' (las de un almacenable traen ademas 2 lineas de costo).
  const lineasOdoo = await odoo<any[]>(
    "account.move.line",
    "search_read",
    [[["move_id", "=", f.id], ["display_type", "=", "product"], ["product_id", "!=", false]]],
    { fields: ["product_id", "quantity"], limit: 2000 },
  );
  const porProducto = new Map<number, number>();
  for (const l of lineasOdoo || []) {
    const pid = m2o(l.product_id);
    porProducto.set(pid, r3((porProducto.get(pid) || 0) + Number(l.quantity || 0)));
  }
  const productos = porProducto.size
    ? await odoo<any[]>("product.product", "read", [[...porProducto.keys()], ["default_code", "display_name", "type"]], {
        context: { active_test: false },
      })
    : [];
  // Los servicios (fletes, etc.) no se reciben.
  const lineas: LineaFactura[] = (productos || [])
    .filter((p) => p.type !== "service" && (porProducto.get(p.id) || 0) > 0)
    .map((p) => ({
      product_id: p.id,
      codigo: p.default_code ? String(p.default_code).trim() : null,
      producto: sinCodigo(p.display_name),
      cantidad: porProducto.get(p.id) || 0,
    }));
  if (lineas.length === 0) throw new ErrorRecepcion(`La factura ${nro} no tiene productos para recibir`);

  return {
    factura: {
      id: f.id,
      nombre: String(f.name),
      cids_origen: m2o(f.company_id),
      sede_origen: nombreSede(m2o(f.company_id)),
      fecha: f.invoice_date || null,
      total: Number(f.amount_total) || 0,
    },
    lineas,
    candidatas: await candidatasParaFactura(cidsDestino, nro, Number(f.amount_total) || 0, lineas),
  };
}

/**
 * Las OC de la sede que pueden ser las de esta factura, la mas probable
 * primero. No hay un enlace en Odoo entre la factura de Valencia y la OC de
 * Caracas, asi que se mira: la factura de proveedor con ese numero en `ref`
 * (cuando ya la registraron), el mismo total y que la OC espere esos
 * productos.
 */
async function candidatasParaFactura(
  cids: number,
  numero: string,
  total: number,
  lineas: LineaFactura[],
): Promise<OcCandidata[]> {
  const pendientes = await ocsPendientes(cids);
  if (pendientes.length === 0) return [];
  const ids = pendientes.map((p) => p.id);

  const [facturasProv, pickings] = await Promise.all([
    odoo<any[]>(
      "account.move",
      "search_read",
      [[["move_type", "=", "in_invoice"], ["company_id", "=", cids], ["ref", "=", numero], ["state", "!=", "cancel"]]],
      { fields: ["invoice_origin"], limit: 20 },
    ),
    odoo<any[]>(
      "stock.picking",
      "search_read",
      [[["purchase_id", "in", ids], ["picking_type_code", "=", "incoming"], ["state", "not in", ["done", "cancel"]]]],
      { fields: ["purchase_id"], limit: 2000 },
    ),
  ]);
  const ocDeFacturaProv = new Set(
    (facturasProv || []).flatMap((x) => String(x.invoice_origin || "").split(",").map((s) => s.trim())).filter(Boolean),
  );
  const ocDePicking = new Map<number, number>((pickings || []).map((p) => [p.id, m2o(p.purchase_id)]));
  const moves = ocDePicking.size
    ? await odoo<any[]>(
        "stock.move",
        "search_read",
        [[["picking_id", "in", [...ocDePicking.keys()]], ["state", "not in", ["done", "cancel"]]]],
        { fields: ["picking_id", "product_id"], limit: 20000 },
      )
    : [];
  const productosDeOc = new Map<number, Set<number>>();
  for (const m of moves || []) {
    const oc = ocDePicking.get(m2o(m.picking_id));
    if (!oc) continue;
    if (!productosDeOc.has(oc)) productosDeOc.set(oc, new Set());
    productosDeOc.get(oc)!.add(m2o(m.product_id));
  }

  return pendientes
    .map((p) => {
      const espera = productosDeOc.get(p.id) || new Set<number>();
      const cubiertos = lineas.filter((l) => espera.has(l.product_id)).length;
      return {
        ...p,
        por_factura_proveedor: ocDeFacturaProv.has(p.nombre),
        mismo_total: Math.abs(p.total - total) < 0.01,
        cobertura: lineas.length ? cubiertos / lineas.length : 0,
      };
    })
    .filter((c) => c.por_factura_proveedor || c.cobertura > 0)
    .sort(
      (a, b) =>
        Number(b.por_factura_proveedor) - Number(a.por_factura_proveedor) ||
        Number(b.mismo_total) - Number(a.mismo_total) ||
        b.cobertura - a.cobertura,
    )
    .slice(0, 10);
}

/**
 * Lo que la OC todavia espera de cada producto (pedido - recibido). Un
 * producto que no esta en la OC no aparece.
 */
async function pendientePorProducto(poId: number): Promise<Map<number, number>> {
  const lineas = await odoo<any[]>(
    "purchase.order.line",
    "search_read",
    [[["order_id", "=", poId], ["product_id", "!=", false], ["display_type", "=", false]]],
    { fields: ["product_id", "product_qty", "qty_received"], limit: 2000 },
  );
  const out = new Map<number, number>();
  for (const l of lineas || []) {
    const pid = m2o(l.product_id);
    out.set(pid, r3((out.get(pid) || 0) + Number(l.product_qty || 0) - Number(l.qty_received || 0)));
  }
  return out;
}

/**
 * Almacen arranca la recepcion con la factura: renglones = productos de la
 * factura, OC = la elegida (tiene que ser una de las candidatas). Nace
 * descargando: no hay contenedores que esperar.
 *
 * Lo que la OC ya recibio en Odoo no se vuelve a esperar: mientras se pasa a
 * este flujo hay OC recibidas a mano en parte (P-00144 tenia recibido todo
 * menos un producto), y esperar la factura entera haria cargar dos veces lo
 * que ya entro. Un producto de la factura que la OC no tiene se espera
 * completo (llega igual y se carga como linea nueva).
 */
export async function crearRecepcionFactura(opts: {
  numero: string;
  cids: number;
  purchaseOrderId: number;
  quien: string;
}): Promise<number> {
  await asegurarColumnasOdoo();
  const datos = await leerFactura(opts.numero, opts.cids);
  const oc = datos.candidatas.find((c) => c.id === Number(opts.purchaseOrderId));
  if (!oc) throw new ErrorRecepcion("Esa OC no corresponde a la factura o ya no espera mercancia");

  const ya = await query(
    "SELECT id FROM recepcion_packing WHERE origen = 'factura' AND factura_odoo_id = ? AND cids = ? LIMIT 1",
    [datos.factura.id, opts.cids],
  );
  if ((ya.rows as any[]).length) {
    const e = new ErrorRecepcion(`La factura ${datos.factura.nombre} ya se esta recibiendo`, 409);
    (e as any).id = Number((ya.rows as any[])[0].id);
    throw e;
  }

  const pendiente = await pendientePorProducto(oc.id);
  const yaRecibidos: string[] = [];
  const lineas = datos.lineas
    .map((l) => {
      if (!pendiente.has(l.product_id)) return l;
      const espera = Math.min(l.cantidad, Math.max(0, pendiente.get(l.product_id) || 0));
      if (espera < l.cantidad) {
        yaRecibidos.push(`${l.codigo || l.producto} (${r3(l.cantidad - espera)} de ${l.cantidad})`);
      }
      return { ...l, cantidad: espera };
    })
    .filter((l) => l.cantidad > 0);
  if (lineas.length === 0) {
    throw new ErrorRecepcion(`La OC ${oc.nombre} ya recibio en Odoo todo lo de la factura ${datos.factura.nombre}`, 409);
  }
  const observaciones = [
    `Factura ${datos.factura.nombre} de ${datos.factura.sede_origen}`,
    yaRecibidos.length ? `Ya recibido en Odoo antes (no se cuenta): ${yaRecibidos.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await query(
    `INSERT INTO recepcion_packing
       (cids, proveedor, referencia, oc_referencia, observaciones, creado_por, etapa, llegada_at, llegada_por,
        origen, factura_odoo_id, odoo_purchase_order_id, odoo_oc_nombre)
     VALUES (?, ?, ?, ?, ?, ?, 'descargando', NOW(), ?, 'factura', ?, ?, ?)`,
    [
      opts.cids,
      oc.proveedor.slice(0, 200),
      datos.factura.nombre.slice(0, 100),
      oc.nombre.slice(0, 50),
      observaciones,
      opts.quien,
      opts.quien,
      datos.factura.id,
      oc.id,
      oc.nombre.slice(0, 50),
    ],
  );
  const id = Number((res.rows as any)?.insertId);
  // Dos personas con la misma factura a la vez: se queda la primera.
  const primera = await query(
    "SELECT MIN(id) AS id FROM recepcion_packing WHERE origen = 'factura' AND factura_odoo_id = ? AND cids = ?",
    [datos.factura.id, opts.cids],
  );
  const primeraId = Number((primera.rows as any[])[0]?.id);
  if (primeraId && primeraId !== id) {
    await query("DELETE FROM recepcion_packing WHERE id = ?", [id]);
    const e = new ErrorRecepcion(`La factura ${datos.factura.nombre} ya se esta recibiendo`, 409);
    (e as any).id = primeraId;
    throw e;
  }
  await query("UPDATE recepcion_packing SET odoo_recepciones_previas = ? WHERE id = ?", [
    JSON.stringify((await recepcionesHechas(oc.id)).map((p) => p.id)),
    id,
  ]);
  const valores: any[] = [];
  const marcas = lineas
    .map((l) => {
      valores.push(id, l.codigo ? l.codigo.slice(0, 100) : null, l.producto.slice(0, 300) || "—", l.cantidad, l.product_id);
      return "(?, ?, ?, ?, ?)";
    })
    .join(", ");
  await query(
    `INSERT INTO recepcion_packing_items (recepcion_id, codigo, producto, cantidad_esperada, odoo_product_id)
     VALUES ${marcas}`,
    valores,
  );
  return id;
}

/** Producto de Odoo por su codigo exacto (normalizado); null si no hay uno solo. */
export async function productoPorCodigo(
  codigo: string,
): Promise<{ id: number; codigo: string; nombre: string; conSerial: boolean } | null> {
  const encontrados = await odoo<any[]>(
    "product.product",
    "search_read",
    [[["default_code", "ilike", codigo.trim()]]],
    { fields: ["default_code", "display_name", "tracking"], limit: 20, context: { active_test: false } },
  );
  const exactos = (encontrados || []).filter((p) => normalizarCodigo(p.default_code) === normalizarCodigo(codigo));
  if (exactos.length !== 1) return null;
  const p = exactos[0];
  return { id: p.id, codigo: String(p.default_code), nombre: sinCodigo(p.display_name), conSerial: p.tracking !== "none" };
}

// ---------------------------------------------------------------------------
// Carga en Odoo al cerrar
// ---------------------------------------------------------------------------

export type ResultadoOdoo = {
  /** Recepciones (IN) validadas y el pendiente que dejo cada una. */
  recepciones: Array<{ id: number; nombre: string; pendiente: string | null }>;
  /** Traslados a Existencias (INT) validados. */
  traslados: Array<{ id: number; nombre: string; pendiente: string | null }>;
  /** Lo ya cargado por producto: si un reintento empieza a medias, no se carga dos veces. */
  cargado: Record<string, { cantidad: number; seriales: string[] }>;
  /** Renglones que no se encontraron en Odoo y no se cargaron. */
  sin_producto: string[];
  /**
   * Renglones de otra factura del embarque (ej. INV1062 de Caracas): se
   * contaron aca pero se reciben en la otra sede, asi que no se cargan.
   */
  apartados?: string[];
  /** Productos que quedaron en Entrada (no habia traslado a donde sumarlos). */
  en_entrada: string[];
  /**
   * El picking que se esta por validar y lo que lleva, anotado ANTES de
   * validar. Si quedo aca, el intento anterior se corto: se mira en Odoo si
   * llego a validarse.
   */
  intento?: { tipo: "in" | "int"; picking_id: number; asignado: Record<string, { cantidad: number; seriales: string[] }> } | null;
  /** Por que se freno la carga (para que el SuperAdmin decida). */
  bloqueo?: { tipo: "recibido_en_odoo" | "packing_list_repetido"; detalle: string[] } | null;
  /**
   * Una recepcion por OC: lo de este packing list escrito en la recepcion
   * pendiente de la OC, sin validar (ver `acumularEnRecepcion`).
   */
  acumulado?: {
    picking_ids: number[];
    pickings: string[];
    /** Lineas (stock.move.line) que escribio este packing list. */
    lineas: number[];
    asignado: Record<string, { cantidad: number; seriales: string[] }>;
    /** Lo que la OC todavia espera, contando los otros packing list. */
    faltan: string[];
    /** Otros packing list de la misma OC que todavia no se cerraron. */
    otras_abiertas: string[];
  } | null;
};

const resultadoVacio = (): ResultadoOdoo => ({
  recepciones: [],
  traslados: [],
  cargado: {},
  sin_producto: [],
  en_entrada: [],
  intento: null,
  bloqueo: null,
});

function leerResultado(json: unknown): ResultadoOdoo {
  try {
    const v = typeof json === "string" && json ? JSON.parse(json) : null;
    return v && typeof v === "object" ? { ...resultadoVacio(), ...v } : resultadoVacio();
  } catch {
    return resultadoVacio();
  }
}

async function guardarResultado(id: number, r: ResultadoOdoo) {
  await query("UPDATE recepcion_packing SET odoo_resultado = ? WHERE id = ?", [JSON.stringify(r), id]);
}

/** Valida un picking; Odoo crea el pendiente con lo no marcado (skip_backorder sin excluir). */
async function validar(pickingId: number): Promise<{ nombre: string; pendiente: string | null }> {
  const respuesta = await odoo<any>("stock.picking", "button_validate", [[pickingId]], {
    context: { skip_backorder: true },
  });
  const [p] = await odoo<any[]>("stock.picking", "read", [[pickingId], ["name", "state"]]);
  if (respuesta && typeof respuesta === "object" && (respuesta.res_model || respuesta.type) && p?.state !== "done") {
    throw new Error(`Odoo pide completar "${respuesta.name || respuesta.res_model}" para validar ${p?.name}: resuelvelo en Odoo y reintenta`);
  }
  if (p?.state !== "done") throw new Error(`Odoo no dejo ${p?.name ?? pickingId} en Hecho (quedo en "${p?.state}")`);
  const [pend] = await odoo<any[]>("stock.picking", "search_read", [[["backorder_id", "=", pickingId]]], {
    fields: ["name"],
    limit: 1,
  });
  return { nombre: String(p.name), pendiente: pend?.name ?? null };
}

async function notaChatter(pickingId: number, texto: string) {
  try {
    await callOdooRPCEstricto("stock.picking", "message_post", [[pickingId]], { body: texto });
  } catch (e: any) {
    console.error(`[recepcion/odoo] no se pudo dejar la nota en el picking ${pickingId}:`, e?.message);
  }
}

/** El picking anotado en `intento` quedo validado: pasa a lo cargado. */
function confirmarIntento(resultado: ResultadoOdoo, picking: { id: number; nombre: string; pendiente: string | null }) {
  const intento = resultado.intento;
  if (!intento || intento.picking_id !== picking.id) return;
  if (intento.tipo === "in") {
    if (!resultado.recepciones.some((r) => r.id === picking.id)) resultado.recepciones.push(picking);
    for (const [k, a] of Object.entries(intento.asignado)) {
      const ya = resultado.cargado[k] || { cantidad: 0, seriales: [] };
      resultado.cargado[k] = { cantidad: r3(ya.cantidad + a.cantidad), seriales: [...ya.seriales, ...a.seriales] };
    }
  } else if (!resultado.traslados.some((r) => r.id === picking.id)) {
    resultado.traslados.push(picking);
  }
  resultado.intento = null;
}

/**
 * Un intento anterior se corto con un picking anotado: si Odoo lo llego a
 * validar, cuenta como cargado; si no, se descarta (sus lineas se vuelven a
 * escribir).
 */
async function resolverIntento(id: number, resultado: ResultadoOdoo): Promise<void> {
  const intento = resultado.intento;
  if (!intento) return;
  const [p] = await odoo<any[]>("stock.picking", "read", [[intento.picking_id], ["name", "state"]]);
  if (p?.state === "done") {
    const [pend] = await odoo<any[]>("stock.picking", "search_read", [[["backorder_id", "=", intento.picking_id]]], {
      fields: ["name"],
      limit: 1,
    });
    confirmarIntento(resultado, { id: intento.picking_id, nombre: String(p.name), pendiente: pend?.name ?? null });
  } else {
    resultado.intento = null;
  }
  await guardarResultado(id, resultado);
}

/**
 * Frenos antes de cargar: la OC recibio en Odoo algo que no hizo el panel
 * desde que empezo esta recepcion (puede ser esta misma mercancia recibida a
 * mano), o el mismo packing list ya se cargo en otra recepcion. Devuelve el
 * motivo, o null si se puede cargar.
 */
async function frenos(rec: any, poId: number, resultado: ResultadoOdoo): Promise<ResultadoOdoo["bloqueo"]> {
  if (rec.origen !== "factura") {
    const otro = await query(
      `SELECT id FROM recepcion_packing
        WHERE cids = ? AND origen = 'packing_list' AND UPPER(TRIM(referencia)) = ? AND id <> ?
          AND (odoo_estado IN ('cargado', 'cargando', 'acumulado') OR odoo_resultado LIKE '%"recepciones":[{%')
        LIMIT 1`,
      [rec.cids, normalizarReferencia(rec.referencia), rec.id],
    );
    const otroId = (otro.rows as any[])[0]?.id;
    if (otroId) return { tipo: "packing_list_repetido", detalle: [`#${otroId}`] };
  }

  // Lo que hizo el panel con esta OC (esta recepcion y las demas).
  const delPanel = new Set<number>(resultado.recepciones.map((r) => r.id));
  const otras = await query(
    "SELECT odoo_resultado FROM recepcion_packing WHERE odoo_purchase_order_id = ? AND id <> ? AND odoo_resultado IS NOT NULL",
    [poId, rec.id],
  );
  for (const o of otras.rows as any[]) {
    const r = leerResultado(o.odoo_resultado);
    r.recepciones.forEach((x) => delPanel.add(x.id));
    if (r.intento?.tipo === "in") delPanel.add(r.intento.picking_id);
  }

  let previas: number[] | null = null;
  try {
    const v = rec.odoo_recepciones_previas ? JSON.parse(rec.odoo_recepciones_previas) : null;
    previas = Array.isArray(v) ? v.map(Number) : null;
  } catch {
    previas = null;
  }
  const hechas = await recepcionesHechas(poId);
  // Sin foto (recepciones de antes de esto, o la OC se eligio despues de
  // cerrar): cualquier recepcion hecha que no sea del panel frena; el
  // SuperAdmin revisa y decide.
  const ajenas = hechas.filter((p) => !delPanel.has(p.id) && !(previas || []).includes(p.id));
  if (ajenas.length) return { tipo: "recibido_en_odoo", detalle: ajenas.map((p) => p.nombre) };
  return null;
}

type Recibido = { productId: number; nombre: string; cantidad: number; seriales: string[] };

/**
 * Producto de Odoo de cada renglon: su `odoo_product_id` (factura, o el que
 * se le asigno con el cruce de lib/recepcion/cruceIa.ts) o su codigo (packing
 * list), contra los productos de la OC o, si no estan, un `default_code`
 * identico en el catalogo. Los que no aparecen no van en el mapa.
 */
export async function productoPorRenglon(items: any[], productosOc: Map<string, number>): Promise<Map<number, number>> {
  const porCodigo = new Map(productosOc);
  // Contra la OC tambien vale el codigo sin signos ni prefijo de marca: el
  // packing list trae "P-EL10-US-GY-ID-10", "NSW2-MKWBUNDLE" o "DELL:CP3724"
  // y Odoo "PEL10USGYID10", "NSW2MKWBUNDLE", "CP3724". Solo si es uno.
  const suelto = (c: string) => normalizarCodigo(c).replace(/^[A-Z]+:/, "").replace(/[^A-Z0-9]/g, "");
  const ocSuelta = new Map<string, number | null>();
  for (const [c, pid] of productosOc) {
    const k = suelto(c);
    if (k) ocSuelta.set(k, ocSuelta.has(k) && ocSuelta.get(k) !== pid ? null : pid);
  }
  for (const i of items) {
    const c = i.codigo ? normalizarCodigo(i.codigo) : "";
    const pid = c && !porCodigo.has(c) ? ocSuelta.get(suelto(c)) : null;
    if (pid) porCodigo.set(c, pid);
  }
  const buscar = items.filter((i) => !i.odoo_product_id && i.codigo && !porCodigo.has(normalizarCodigo(i.codigo)));
  for (const i of buscar) {
    const codigo = normalizarCodigo(i.codigo);
    const encontrados = await odoo<any[]>(
      "product.product",
      "search_read",
      [[["default_code", "ilike", String(i.codigo).trim()]]],
      { fields: ["default_code"], limit: 20, context: { active_test: false } },
    );
    const exactos = (encontrados || []).filter((p) => normalizarCodigo(p.default_code) === codigo);
    if (exactos.length === 1) porCodigo.set(codigo, exactos[0].id);
  }
  const mapa = new Map<number, number>();
  for (const i of items) {
    const pid = Number(i.odoo_product_id) || (i.codigo ? porCodigo.get(normalizarCodigo(i.codigo)) : 0) || 0;
    if (pid) mapa.set(Number(i.id), pid);
  }
  return mapa;
}

/** Productos que espera la OC, por codigo normalizado. */
export async function productosDeLaOc(poId: number): Promise<Map<string, number>> {
  const moves = await odoo<any[]>(
    "stock.move",
    "search_read",
    [[["purchase_line_id.order_id", "=", poId]]],
    { fields: ["product_id"], limit: 5000 },
  );
  const pids = [...new Set(moves.map((m) => m2o(m.product_id)))];
  const codigos = pids.length
    ? await odoo<any[]>("product.product", "read", [pids, ["default_code"]], { context: { active_test: false } })
    : [];
  return new Map<string, number>(codigos.filter((p) => p.default_code).map((p) => [normalizarCodigo(p.default_code), p.id]));
}

/** Lo contado en el panel, por producto de Odoo (ver `productoPorRenglon`). */
async function recibidosPorProducto(
  items: any[],
  productosOc: Map<string, number>,
): Promise<{ recibidos: Recibido[]; sinProducto: string[]; apartados: string[] }> {
  // Lo de otra factura no se carga aca: ni se busca su producto.
  const apartados = items
    .filter((i) => i.factura_aparte && Number(i.cantidad_recibida || 0) > 0)
    .map((i) => `${i.factura_aparte} · ${i.codigo || "sin codigo"} · ${i.producto} (${Number(i.cantidad_recibida)})`);
  const propios = items.filter((i) => !i.factura_aparte);
  const productoDe = await productoPorRenglon(propios, productosOc);
  const mapa = new Map<number, Recibido>();
  const sinProducto: string[] = [];
  for (const i of propios) {
    const cantidad = Number(i.cantidad_recibida || 0);
    if (cantidad <= 0) continue;
    const pid = productoDe.get(Number(i.id)) || 0;
    if (!pid) {
      sinProducto.push(`${i.codigo || "sin codigo"} · ${i.producto} (${cantidad})`);
      continue;
    }
    const r: Recibido = mapa.get(pid) || { productId: pid, nombre: i.producto, cantidad: 0, seriales: [] };
    r.cantidad = r3(r.cantidad + cantidad);
    r.seriales.push(...(i.seriales || []).map((s: any) => String(s.serial).trim()).filter(Boolean));
    mapa.set(pid, r);
  }
  return { recibidos: [...mapa.values()], sinProducto, apartados };
}

/**
 * Paso 1: la recepcion (IN) de la OC con lo contado. Si la OC tiene varias
 * recepciones pendientes (backorders), se llenan de la mas vieja a la mas
 * nueva. Devuelve las validadas.
 */
async function cargarRecepciones(
  rec: any,
  poId: number,
  recibidos: Recibido[],
  resultado: ResultadoOdoo,
  quien: string,
): Promise<void> {
  const pickings = await odoo<any[]>(
    "stock.picking",
    "search_read",
    [[["purchase_id", "=", poId], ["picking_type_code", "=", "incoming"], ["state", "not in", ["done", "cancel"]]]],
    { fields: ["name", "location_id", "location_dest_id", "state"], order: "id asc", limit: 50 },
  );
  if (!pickings?.length) throw new Error(`La OC ${rec.odoo_oc_nombre || poId} no tiene recepciones pendientes en Odoo`);

  const moves = await odoo<any[]>(
    "stock.move",
    "search_read",
    [[["picking_id", "in", pickings.map((p) => p.id)], ["state", "not in", ["done", "cancel"]]]],
    { fields: ["picking_id", "product_id", "product_uom_qty", "product_uom", "location_id", "location_dest_id", "move_line_ids"], order: "id asc", limit: 5000 },
  );
  const orden = new Map(pickings.map((p, n) => [p.id, n]));
  moves.sort((a, b) => orden.get(m2o(a.picking_id))! - orden.get(m2o(b.picking_id))! || a.id - b.id);

  const pids = [...new Set([...recibidos.map((r) => r.productId), ...moves.map((m) => m2o(m.product_id))])];
  const productos = await odoo<any[]>("product.product", "read", [pids, ["tracking", "uom_id", "display_name"]], {
    context: { active_test: false },
  });
  const prod = new Map(productos.map((p) => [p.id, p]));

  // Lo que falta cargar (un reintento a medias ya cargo una parte).
  type Asignacion = { cantidad: number; seriales: string[] };
  const porMove = new Map<number, Asignacion>();
  const nuevos: Array<{ productId: number; cantidad: number; seriales: string[] }> = [];
  const errores: string[] = [];
  for (const r of recibidos) {
    const ya = resultado.cargado[String(r.productId)] || { cantidad: 0, seriales: [] };
    const tracking = prod.get(r.productId)?.tracking || "none";
    const conSerial = tracking !== "none";
    const yaSeriales = new Set(ya.seriales.map(normalizarCodigo));
    const seriales = conSerial ? r.seriales.filter((s) => !yaSeriales.has(normalizarCodigo(s))) : [];
    const cantidad = conSerial ? seriales.length : r3(r.cantidad - ya.cantidad);
    if (conSerial && r.seriales.length !== r.cantidad) {
      errores.push(`${r.nombre}: en Odoo lleva serial y se contaron ${r.cantidad} con ${r.seriales.length} serial(es) pistoleado(s)`);
      continue;
    }
    if (cantidad <= 0) continue;

    const suyos = moves.filter((m) => m2o(m.product_id) === r.productId);
    if (suyos.length === 0) {
      nuevos.push({ productId: r.productId, cantidad, seriales });
      continue;
    }
    let resto = cantidad;
    let n = 0;
    suyos.forEach((m, idx) => {
      // Lo que sobra de lo pedido va al ultimo: se carga todo lo que llego.
      const toma = idx === suyos.length - 1 ? resto : Math.min(resto, Number(m.product_uom_qty) || 0);
      if (toma <= 0) return;
      porMove.set(m.id, { cantidad: r3(toma), seriales: conSerial ? seriales.slice(n, n + toma) : [] });
      n += toma;
      resto = r3(resto - toma);
    });
  }
  if (errores.length) throw new Error(errores.join(" · "));
  if (porMove.size === 0 && nuevos.length === 0) return;

  const lineaDe = (m: { id: number; picking: number; productId: number; uom: number; origen: number; destino: number }) =>
    (extra: Record<string, unknown>) => ({
      move_id: m.id,
      picking_id: m.picking,
      product_id: m.productId,
      product_uom_id: m.uom,
      location_id: m.origen,
      location_dest_id: m.destino,
      picked: true,
      ...extra,
    });

  for (const p of pickings) {
    const propios = moves.filter((m) => m2o(m.picking_id) === p.id);
    const nuevosAca = p.id === pickings[0].id ? nuevos : [];
    const conAlgo = propios.some((m) => porMove.has(m.id)) || nuevosAca.length > 0;
    if (!conAlgo) continue;

    // Las lineas de la reserva se reemplazan por las de lo contado. Un
    // reintento las vuelve a escribir igual: no quedan duplicadas.
    const viejas = propios.flatMap((m) => m.move_line_ids || []);
    if (viejas.length) await odoo("stock.move.line", "unlink", [viejas]);

    const lineas: any[] = [];
    const marcados: number[] = [];
    const sinMarcar: number[] = [];
    for (const m of propios) {
      const a = porMove.get(m.id);
      if (!a) {
        sinMarcar.push(m.id);
        continue;
      }
      const linea = lineaDe({
        id: m.id,
        picking: p.id,
        productId: m2o(m.product_id),
        uom: m2o(m.product_uom),
        origen: m2o(m.location_id),
        destino: m2o(m.location_dest_id),
      });
      if (a.seriales.length) a.seriales.forEach((s) => lineas.push(linea({ lot_name: s, quantity: 1 })));
      else lineas.push(linea({ quantity: a.cantidad }));
      marcados.push(m.id);
    }
    // Productos que no estan en la OC: una linea nueva de la recepcion.
    for (const nv of nuevosAca) {
      const pr = prod.get(nv.productId);
      const moveId = await odoo<number>("stock.move", "create", [
        {
          name: sinCodigo(pr?.display_name || "Producto"),
          product_id: nv.productId,
          product_uom_qty: nv.cantidad,
          product_uom: m2o(pr?.uom_id),
          location_id: m2o(p.location_id),
          location_dest_id: m2o(p.location_dest_id),
          picking_id: p.id,
          company_id: Number(rec.cids),
        },
      ]);
      const linea = lineaDe({
        id: moveId,
        picking: p.id,
        productId: nv.productId,
        uom: m2o(pr?.uom_id),
        origen: m2o(p.location_id),
        destino: m2o(p.location_dest_id),
      });
      if (nv.seriales.length) nv.seriales.forEach((s) => lineas.push(linea({ lot_name: s, quantity: 1 })));
      else lineas.push(linea({ quantity: nv.cantidad }));
      marcados.push(moveId);
    }
    if (lineas.length) await odoo("stock.move.line", "create", [lineas]);
    // Solo lo marcado se valida; lo demas queda en el pendiente.
    if (marcados.length) await odoo("stock.move", "write", [marcados, { picked: true }]);
    if (sinMarcar.length) await odoo("stock.move", "write", [sinMarcar, { picked: false }]);

    // Lo que lleva este picking, anotado ANTES de validar: si algo se corta
    // despues de que Odoo valido, el reintento lo da por cargado.
    const asignado: Record<string, { cantidad: number; seriales: string[] }> = {};
    const sumar = (pid: number, cantidad: number, seriales: string[]) => {
      const k = String(pid);
      const ya = asignado[k] || { cantidad: 0, seriales: [] };
      asignado[k] = { cantidad: r3(ya.cantidad + cantidad), seriales: [...ya.seriales, ...seriales] };
    };
    for (const m of propios) {
      const a = porMove.get(m.id);
      if (a) sumar(m2o(m.product_id), a.cantidad, a.seriales);
    }
    for (const nv of nuevosAca) sumar(nv.productId, nv.cantidad, nv.seriales);
    resultado.intento = { tipo: "in", picking_id: p.id, asignado };
    await guardarResultado(Number(rec.id), resultado);

    const v = await validar(p.id);
    confirmarIntento(resultado, { id: p.id, nombre: v.nombre, pendiente: v.pendiente });
    await guardarResultado(Number(rec.id), resultado);
    await notaChatter(p.id, `Recibido desde el panel (recepcion #${rec.id}, ${rec.referencia}). Cerro: ${quien}.`);
  }
}

/**
 * Paso 2: el traslado de Entrada a Existencias encadenado a las recepciones
 * validadas, con lo mismo que entro (mismos seriales y cantidades).
 */
async function cargarTraslados(rec: any, resultado: ResultadoOdoo, quien: string): Promise<void> {
  const inIds = resultado.recepciones.map((r) => r.id);
  if (inIds.length === 0) return;
  const hechos = await odoo<any[]>(
    "stock.move",
    "search_read",
    [[["picking_id", "in", inIds], ["state", "=", "done"]]],
    { fields: ["product_id", "move_dest_ids"], limit: 5000 },
  );
  const destIds = [...new Set(hechos.flatMap((m) => m.move_dest_ids || []))];
  const todosDest = destIds.length
    ? await odoo<any[]>("stock.move", "read", [
        destIds,
        ["picking_id", "product_id", "product_uom", "location_id", "location_dest_id", "move_line_ids", "state"],
      ])
    : [];
  const destinos = todosDest.filter((m) => m.picking_id && !["done", "cancel"].includes(m.state));
  // Recepcion en un paso (lo recibido ya esta en Existencias), o el
  // traslado ya lo validaron en Odoo: no hay nada que trasladar.
  if (destinos.length === 0) return;

  // Solo lo que todavia esta en Entrada: lo de recepciones cuyo traslado ya
  // se valido (un reintento) no se traslada dos veces.
  const pendientesDest = new Set(destinos.map((d) => d.id));
  const movesPorTrasladar = hechos
    .filter((m) => !(m.move_dest_ids || []).length || (m.move_dest_ids || []).some((d: number) => pendientesDest.has(d)))
    .map((m) => m.id);
  const lineasRecibidas = movesPorTrasladar.length
    ? await odoo<any[]>(
        "stock.move.line",
        "search_read",
        [[["move_id", "in", movesPorTrasladar], ["state", "=", "done"]]],
        { fields: ["product_id", "lot_id", "quantity", "location_dest_id", "product_uom_id"], limit: 20000 },
      )
    : [];

  // Lo que ya salio de Entrada por un traslado hecho (del panel o a mano en
  // Odoo) no se traslada otra vez. Odoo deja el pendiente de un traslado
  // colgando de la recepcion original aunque esa parte ya se haya movido
  // (CENT1/INT/00254 con el UPS que ya paso en CENT1/INT/00251): sin esto se
  // volvia a trasladar y Odoo lo frenaba por stock negativo en Entrada.
  const entradas = new Set(lineasRecibidas.map((l) => m2o(l.location_dest_id)));
  const destHechos = todosDest.filter((m) => m.state === "done").map((m) => m.id);
  const salidas = destHechos.length
    ? await odoo<any[]>(
        "stock.move.line",
        "search_read",
        [[["move_id", "in", destHechos], ["state", "=", "done"]]],
        { fields: ["product_id", "lot_id", "quantity", "location_id"], limit: 20000 },
      )
    : [];
  const llave = (l: any) => `${m2o(l.product_id)}|${l.lot_id ? m2o(l.lot_id) : 0}`;
  const yaMovido = new Map<string, number>();
  for (const l of salidas) {
    if (!entradas.has(m2o(l.location_id))) continue;
    yaMovido.set(llave(l), r3((yaMovido.get(llave(l)) || 0) + Number(l.quantity || 0)));
  }
  const lineasIn: any[] = [];
  for (const l of lineasRecibidas) {
    const cantidad = Number(l.quantity || 0);
    const ya = Math.min(yaMovido.get(llave(l)) || 0, cantidad);
    if (ya > 0) yaMovido.set(llave(l), r3((yaMovido.get(llave(l)) || 0) - ya));
    const queda = r3(cantidad - ya);
    if (queda > 0) lineasIn.push({ ...l, quantity: queda });
  }

  const porPicking = new Map<number, any[]>();
  for (const d of destinos) {
    const pk = m2o(d.picking_id);
    if (!porPicking.has(pk)) porPicking.set(pk, []);
    porPicking.get(pk)!.push(d);
  }
  const primerTraslado = [...porPicking.keys()][0];

  const asignados = new Set<number>();
  const productosIn = [...new Set(lineasIn.map((l) => m2o(l.product_id)))];
  for (const [pickingId, propios] of porPicking) {
    const lineas: any[] = [];
    const marcados: number[] = [];
    const viejas = propios.flatMap((m) => m.move_line_ids || []);
    if (viejas.length) await odoo("stock.move.line", "unlink", [viejas]);

    for (const pid of productosIn) {
      if (asignados.has(pid)) continue;
      let destino = propios.find((m) => m2o(m.product_id) === pid);
      const deEste = lineasIn.filter((l) => m2o(l.product_id) === pid);
      if (!destino) {
        // Producto que entro sin traslado encadenado (no estaba en la OC o
        // vino de mas): se suma al primer traslado.
        if (pickingId !== primerTraslado) continue;
        const [pk] = await odoo<any[]>("stock.picking", "read", [[pickingId], ["location_id", "location_dest_id"]]);
        const total = r3(deEste.reduce((s, l) => s + Number(l.quantity || 0), 0));
        const moveId = await odoo<number>("stock.move", "create", [
          {
            name: `Recepcion #${rec.id}`,
            product_id: pid,
            product_uom_qty: total,
            product_uom: m2o(deEste[0].product_uom_id),
            location_id: m2o(pk.location_id),
            location_dest_id: m2o(pk.location_dest_id),
            picking_id: pickingId,
            company_id: Number(rec.cids),
          },
        ]);
        destino = { id: moveId, location_dest_id: pk.location_dest_id, product_uom: deEste[0].product_uom_id };
      }
      for (const l of deEste) {
        lineas.push({
          move_id: destino.id,
          picking_id: pickingId,
          product_id: pid,
          product_uom_id: m2o(destino.product_uom) || m2o(l.product_uom_id),
          location_id: m2o(l.location_dest_id),
          location_dest_id: m2o(destino.location_dest_id),
          lot_id: l.lot_id ? m2o(l.lot_id) : false,
          quantity: Number(l.quantity || 0),
          picked: true,
        });
      }
      marcados.push(destino.id);
      asignados.add(pid);
    }
    if (lineas.length === 0) continue;
    await odoo("stock.move.line", "create", [lineas]);
    await odoo("stock.move", "write", [marcados, { picked: true }]);
    const otros = propios.filter((m) => !marcados.includes(m.id)).map((m) => m.id);
    if (otros.length) await odoo("stock.move", "write", [otros, { picked: false }]);

    resultado.intento = { tipo: "int", picking_id: pickingId, asignado: {} };
    await guardarResultado(Number(rec.id), resultado);
    const v = await validar(pickingId);
    confirmarIntento(resultado, { id: pickingId, nombre: v.nombre, pendiente: v.pendiente });
    await guardarResultado(Number(rec.id), resultado);
    await notaChatter(pickingId, `Cargado a Existencias desde el panel (recepcion #${rec.id}, ${rec.referencia}). Cerro: ${quien}.`);
  }

  const sinTraslado = productosIn.filter((p) => !asignados.has(p));
  if (sinTraslado.length) {
    resultado.en_entrada = lineasIn
      .filter((l) => sinTraslado.includes(m2o(l.product_id)))
      .map((l) => (Array.isArray(l.product_id) ? sinCodigo(l.product_id[1]) : String(l.product_id)))
      .filter((v, i, a) => a.indexOf(v) === i);
  }
}

// ---------------------------------------------------------------------------
// Una recepcion por OC
// ---------------------------------------------------------------------------

/**
 * Los costos de aduana (costos en destino) se aplican por recepcion de Odoo:
 * si cada contenedor valida la suya, una OC que llega en varios packing list
 * termina en varias recepciones (P-00116: IN/00309, IN/00327 e IN/00328) y
 * hay que repartir el costo entre todas. Por eso, en las OC que todavia no
 * tienen ninguna recepcion hecha en Odoo, lo contado en cada packing list se
 * ESCRIBE en la recepcion pendiente de la OC sin validarla (`odoo_estado =
 * 'acumulado'`) y la recepcion se valida una sola vez: cuando lo escrito
 * cubre todo lo pedido, o cuando alguien marca que ya llego todo
 * (`validarOc`). Las OC que ya tienen recepciones hechas siguen como antes.
 *
 * Cada recepcion del panel guarda sus lineas (`odoo_resultado.acumulado`): un
 * reintento reescribe solo las suyas y respeta las de los otros packing list
 * de la misma OC. Las de la misma OC se escriben de a una (`conCandadoOc`).
 */

const candadosOc = new Map<number, Promise<unknown>>();

/** Corre `fn` sin que otra carga de la misma OC escriba a la vez en su recepcion. */
async function conCandadoOc<T>(poId: number, fn: () => Promise<T>): Promise<T> {
  const previo = candadosOc.get(poId) || Promise.resolve();
  const actual = previo.catch(() => undefined).then(fn);
  candadosOc.set(poId, actual);
  try {
    return await actual;
  } finally {
    if (candadosOc.get(poId) === actual) candadosOc.delete(poId);
  }
}

/** Esta recepcion va en una sola recepcion de Odoo por OC (ver arriba). */
async function unaPorOc(rec: any, poId: number, resultado: ResultadoOdoo): Promise<boolean> {
  if (resultado.acumulado) return true;
  if (rec.origen === "factura" || resultado.recepciones.length > 0) return false;
  return (await recepcionesHechas(poId)).length === 0;
}

/** Las otras recepciones del panel con lineas escritas en la recepcion de esta OC. */
async function otrasAcumuladas(poId: number, recId: number): Promise<Array<{ id: number; resultado: ResultadoOdoo }>> {
  const r = await query(
    "SELECT id, odoo_resultado FROM recepcion_packing WHERE odoo_purchase_order_id = ? AND id <> ? AND odoo_estado = 'acumulado'",
    [poId, recId],
  );
  return (r.rows as any[])
    .map((o) => ({ id: Number(o.id), resultado: leerResultado(o.odoo_resultado) }))
    .filter((o) => o.resultado.acumulado);
}

/**
 * Escribe lo contado en la recepcion pendiente de la OC, sin validar.
 * Devuelve si con esto (y lo de los otros packing list) ya esta todo lo pedido.
 */
async function acumularEnRecepcion(rec: any, poId: number, recibidos: Recibido[], resultado: ResultadoOdoo): Promise<boolean> {
  const pickings = await odoo<any[]>(
    "stock.picking",
    "search_read",
    [[["purchase_id", "=", poId], ["picking_type_code", "=", "incoming"], ["state", "not in", ["done", "cancel"]]]],
    { fields: ["name", "location_id", "location_dest_id"], order: "id asc", limit: 50 },
  );
  if (!pickings?.length) throw new Error(`La OC ${rec.odoo_oc_nombre || poId} no tiene recepciones pendientes en Odoo`);
  const moves = await odoo<any[]>(
    "stock.move",
    "search_read",
    [[["picking_id", "in", pickings.map((p) => p.id)], ["state", "not in", ["done", "cancel"]]]],
    { fields: ["picking_id", "product_id", "product_uom_qty", "product_uom", "location_id", "location_dest_id", "move_line_ids"], order: "id asc", limit: 5000 },
  );
  const orden = new Map(pickings.map((p, n) => [p.id, n]));
  moves.sort((a, b) => orden.get(m2o(a.picking_id))! - orden.get(m2o(b.picking_id))! || a.id - b.id);

  // Lo que ya escribieron los otros packing list de esta OC: no se toca.
  const otras = await otrasAcumuladas(poId, Number(rec.id));
  const idsOtras = [...new Set(otras.flatMap((o) => o.resultado.acumulado!.lineas))];
  const lineasOtras = idsOtras.length
    ? await odoo<any[]>("stock.move.line", "search_read", [[["id", "in", idsOtras]]], { fields: ["move_id", "quantity"], limit: 20000 })
    : [];
  const deOtras = new Set(lineasOtras.map((l) => Number(l.id)));
  const otrasPorMove = new Map<number, number>();
  for (const l of lineasOtras) otrasPorMove.set(m2o(l.move_id), r3((otrasPorMove.get(m2o(l.move_id)) || 0) + Number(l.quantity || 0)));

  const pids = [...new Set([...recibidos.map((r) => r.productId), ...moves.map((m) => m2o(m.product_id))])];
  const productos = await odoo<any[]>("product.product", "read", [pids, ["tracking", "uom_id", "display_name"]], {
    context: { active_test: false },
  });
  const prod = new Map(productos.map((p) => [p.id, p]));

  type Asignacion = { cantidad: number; seriales: string[] };
  const porMove = new Map<number, Asignacion>();
  const nuevos: Array<{ productId: number; cantidad: number; seriales: string[] }> = [];
  const asignado: Record<string, Asignacion> = {};
  const errores: string[] = [];
  for (const r of recibidos) {
    const conSerial = (prod.get(r.productId)?.tracking || "none") !== "none";
    if (conSerial && r.seriales.length !== r.cantidad) {
      errores.push(`${r.nombre}: en Odoo lleva serial y se contaron ${r.cantidad} con ${r.seriales.length} serial(es) pistoleado(s)`);
      continue;
    }
    const seriales = conSerial ? r.seriales : [];
    if (r.cantidad <= 0) continue;
    asignado[String(r.productId)] = { cantidad: r.cantidad, seriales };
    const suyos = moves.filter((m) => m2o(m.product_id) === r.productId);
    if (suyos.length === 0) {
      nuevos.push({ productId: r.productId, cantidad: r.cantidad, seriales });
      continue;
    }
    let resto = r.cantidad;
    let n = 0;
    suyos.forEach((m, idx) => {
      // Lo que cabe en la linea de la OC despues de lo de los otros packing
      // list; lo que sobra va a la ultima (se carga todo lo que llego).
      const libre = Math.max(0, r3((Number(m.product_uom_qty) || 0) - (otrasPorMove.get(m.id) || 0)));
      const toma = idx === suyos.length - 1 ? resto : Math.min(resto, libre);
      if (toma <= 0) return;
      porMove.set(m.id, { cantidad: r3(toma), seriales: conSerial ? seriales.slice(n, n + toma) : [] });
      n += toma;
      resto = r3(resto - toma);
    });
  }
  if (errores.length) throw new Error(errores.join(" · "));

  // Fuera las lineas que puso Odoo al reservar y las que este packing list
  // escribio antes (se vuelven a escribir con lo de ahora).
  const sobran = moves.flatMap((m) => (m.move_line_ids || []).filter((l: number) => !deOtras.has(Number(l))));
  if (sobran.length) await odoo("stock.move.line", "unlink", [sobran]);

  const linea = (m: { id: number; picking: number; productId: number; uom: number; origen: number; destino: number }, extra: Record<string, unknown>) => ({
    move_id: m.id,
    picking_id: m.picking,
    product_id: m.productId,
    product_uom_id: m.uom,
    location_id: m.origen,
    location_dest_id: m.destino,
    picked: true,
    ...extra,
  });
  const lineas: any[] = [];
  const conLineas = new Set<number>(otrasPorMove.keys());
  for (const m of moves) {
    const a = porMove.get(m.id);
    if (!a) continue;
    const base = {
      id: m.id,
      picking: m2o(m.picking_id),
      productId: m2o(m.product_id),
      uom: m2o(m.product_uom),
      origen: m2o(m.location_id),
      destino: m2o(m.location_dest_id),
    };
    if (a.seriales.length) a.seriales.forEach((s) => lineas.push(linea(base, { lot_name: s, quantity: 1 })));
    else lineas.push(linea(base, { quantity: a.cantidad }));
    conLineas.add(m.id);
  }
  // Productos que no estan en la OC: una linea nueva en la primera recepcion.
  const p0 = pickings[0];
  for (const nv of nuevos) {
    const pr = prod.get(nv.productId);
    const moveId = await odoo<number>("stock.move", "create", [
      {
        name: sinCodigo(pr?.display_name || "Producto"),
        product_id: nv.productId,
        product_uom_qty: nv.cantidad,
        product_uom: m2o(pr?.uom_id),
        location_id: m2o(p0.location_id),
        location_dest_id: m2o(p0.location_dest_id),
        picking_id: p0.id,
        company_id: Number(rec.cids),
      },
    ]);
    const base = {
      id: moveId,
      picking: p0.id,
      productId: nv.productId,
      uom: m2o(pr?.uom_id),
      origen: m2o(p0.location_id),
      destino: m2o(p0.location_dest_id),
    };
    if (nv.seriales.length) nv.seriales.forEach((s) => lineas.push(linea(base, { lot_name: s, quantity: 1 })));
    else lineas.push(linea(base, { quantity: nv.cantidad }));
    conLineas.add(moveId);
  }
  const creadas = lineas.length ? await odoo<number[] | number>("stock.move.line", "create", [lineas]) : [];
  const ids = (Array.isArray(creadas) ? creadas : [creadas]).map(Number).filter(Boolean);

  const marcados = [...conLineas];
  const sinMarcar = moves.map((m) => m.id).filter((x) => !conLineas.has(x));
  if (marcados.length) await odoo("stock.move", "write", [marcados, { picked: true }]);
  if (sinMarcar.length) await odoo("stock.move", "write", [sinMarcar, { picked: false }]);

  // Lo que todavia no llego de la OC (contando los otros packing list).
  const nuestroPorMove = new Map<number, number>();
  for (const [mid, a] of porMove) nuestroPorMove.set(mid, a.cantidad);
  const faltan: string[] = [];
  for (const m of moves) {
    const tiene = r3((otrasPorMove.get(m.id) || 0) + (nuestroPorMove.get(m.id) || 0));
    const pide = Number(m.product_uom_qty) || 0;
    if (tiene < pide) {
      const nombre = Array.isArray(m.product_id) ? String(m.product_id[1]) : String(m.product_id);
      faltan.push(`${nombre} (${r3(pide - tiene)} de ${pide})`);
    }
  }
  const abiertas = await query(
    "SELECT referencia FROM recepcion_packing WHERE odoo_purchase_order_id = ? AND id <> ? AND etapa <> 'cerrado'",
    [poId, rec.id],
  ).catch(() => ({ rows: [] }));

  resultado.acumulado = {
    picking_ids: pickings.map((p) => Number(p.id)),
    pickings: pickings.map((p) => String(p.name)),
    lineas: ids,
    asignado,
    faltan,
    otras_abiertas: (abiertas.rows as any[]).map((a) => String(a.referencia || "")).filter(Boolean),
  };
  return faltan.length === 0;
}

/**
 * La recepcion de la OC donde se fue escribiendo ya esta hecha (la valido el
 * panel desde otro packing list, o alguien en Odoo): esta recepcion queda
 * cargada con lo suyo.
 */
async function acumuladoHecho(resultado: ResultadoOdoo): Promise<boolean> {
  const ac = resultado.acumulado;
  if (!ac?.picking_ids.length) return false;
  const pk = await odoo<any[]>("stock.picking", "read", [ac.picking_ids, ["name", "state"]]);
  const hechos = (pk || []).filter((p) => p.state === "done");
  if (hechos.length === 0) return false;
  for (const p of hechos) {
    if (!resultado.recepciones.some((r) => r.id === Number(p.id))) {
      const [pend] = await odoo<any[]>("stock.picking", "search_read", [[["backorder_id", "=", p.id]]], { fields: ["name"], limit: 1 });
      resultado.recepciones.push({ id: Number(p.id), nombre: String(p.name), pendiente: pend?.name ?? null });
    }
  }
  for (const [k, a] of Object.entries(ac.asignado)) {
    const ya = resultado.cargado[k] || { cantidad: 0, seriales: [] };
    resultado.cargado[k] = { cantidad: r3(ya.cantidad + a.cantidad), seriales: [...ya.seriales, ...a.seriales] };
  }
  resultado.acumulado = null;
  return true;
}

/** Valida la recepcion de la OC con lo de todos los packing list escritos. */
async function validarAcumulado(rec: any, poId: number, resultado: ResultadoOdoo, quien: string): Promise<void> {
  const ac = resultado.acumulado!;
  const otras = await otrasAcumuladas(poId, Number(rec.id));
  const referencias = [rec.referencia, ...otras.map((o) => `#${o.id}`)].filter(Boolean).join(", ");
  // Solo entra lo que escribio el panel: si en Odoo volvieron a reservar
  // ("Comprobar disponibilidad"), esas lineas automaticas se recibirian de mas.
  const delPanel = new Set([...ac.lineas, ...otras.flatMap((o) => o.resultado.acumulado!.lineas)].map(Number));
  const moves = await odoo<any[]>(
    "stock.move",
    "search_read",
    [[["picking_id", "in", ac.picking_ids], ["state", "not in", ["done", "cancel"]]]],
    { fields: ["move_line_ids"], limit: 5000 },
  );
  const ajenas = moves.flatMap((m) => (m.move_line_ids || []).map(Number).filter((l: number) => !delPanel.has(l)));
  if (ajenas.length) await odoo("stock.move.line", "unlink", [ajenas]);
  const conPanel = moves.filter((m) => (m.move_line_ids || []).some((l: number) => delPanel.has(Number(l)))).map((m) => m.id);
  const sinPanel = moves.map((m) => m.id).filter((x) => !conPanel.includes(x));
  if (conPanel.length) await odoo("stock.move", "write", [conPanel, { picked: true }]);
  if (sinPanel.length) await odoo("stock.move", "write", [sinPanel, { picked: false }]);

  for (const pickingId of ac.picking_ids) {
    const [p] = await odoo<any[]>("stock.picking", "read", [[pickingId], ["state", "move_ids"]]);
    if (!p || ["done", "cancel"].includes(p.state)) continue;
    const conAlgo = await odoo<number>("stock.move.line", "search_count", [[["picking_id", "=", pickingId]]]);
    if (!conAlgo) continue;
    resultado.intento = { tipo: "in", picking_id: pickingId, asignado: ac.asignado };
    await guardarResultado(Number(rec.id), resultado);
    const v = await validar(pickingId);
    confirmarIntento(resultado, { id: pickingId, nombre: v.nombre, pendiente: v.pendiente });
    await guardarResultado(Number(rec.id), resultado);
    await notaChatter(pickingId, `Recibido desde el panel en una sola recepcion de la OC (recepciones ${referencias}). Valido: ${quien}.`);
  }
  resultado.acumulado = null;
  // Las otras recepciones del panel de esta OC quedan cargadas con lo suyo.
  for (const o of otras) {
    if (await acumuladoHecho(o.resultado)) {
      await query(
        `UPDATE recepcion_packing SET odoo_estado = 'cargado', odoo_cargado_at = NOW(), odoo_error = NULL, odoo_resultado = ?
          WHERE id = ? AND odoo_estado = 'acumulado'`,
        [JSON.stringify(o.resultado), o.id],
      );
    }
  }
}

/**
 * Carga en Odoo lo contado en una recepcion cerrada: recepcion de la OC y
 * traslado a Existencias. No lanza: lo que pase queda en la recepcion
 * (`odoo_estado`, `odoo_error`, `odoo_resultado`) y se ve en el detalle.
 */
export async function cargarEnOdoo(
  id: number,
  quien: string,
  opts: { saltarFrenos?: boolean; completarFaltantes?: boolean; validarOc?: boolean } = {},
): Promise<{ estado: EstadoOdoo; error?: string }> {
  await asegurarColumnasOdoo();
  const datos = await cargarRecepcion(id);
  if (!datos) return { estado: "error", error: "No encontrada" };
  const rec = datos.recepcion;
  if (rec.etapa !== "cerrado") return { estado: "error", error: "La recepcion no esta cerrada" };
  // Una recepcion cargada solo se vuelve a abrir para los renglones que se
  // quedaron sin producto de Odoo y ya lo tienen: lo cargado no se repite
  // (`odoo_resultado.cargado`), asi que solo entra lo que faltaba.
  const completar =
    rec.odoo_estado === "cargado" &&
    !!opts.completarFaltantes &&
    leerResultado(rec.odoo_resultado).sin_producto.length > 0;
  if (rec.odoo_estado === "cargado" && !completar) return { estado: "cargado" };

  // OC: la de Odoo, o la de la orden del panel de la que salio el packing list.
  let poId = Number(rec.odoo_purchase_order_id) || 0;
  if (!poId && rec.purchase_order_id) {
    try {
      const r = await query("SELECT odoo_purchase_order_id FROM purchase_orders WHERE id = ?", [rec.purchase_order_id]);
      poId = Number((r.rows as any[])[0]?.odoo_purchase_order_id) || 0;
    } catch {
      // Sin modulo de ordenes del panel: sin OC.
    }
  }
  if (!poId) {
    await query("UPDATE recepcion_packing SET odoo_estado = 'sin_oc', odoo_error = NULL WHERE id = ?", [id]);
    return { estado: "sin_oc" };
  }

  // Uno a la vez: si dos personas reintentan juntas, la segunda no carga.
  const lock = await query(
    `UPDATE recepcion_packing
        SET odoo_estado = 'cargando', odoo_intento_at = NOW(), odoo_error = NULL, odoo_purchase_order_id = ?
      WHERE id = ? AND etapa = 'cerrado'
        AND (odoo_estado IS NULL OR odoo_estado IN ('error', 'sin_oc', 'acumulado')
             OR (odoo_estado = 'cargado' AND ? = 1)
             OR (odoo_estado = 'cargando' AND odoo_intento_at < NOW() - INTERVAL 60 MINUTE))`,
    [poId, id, completar ? 1 : 0],
  );
  if (Number((lock.rows as any)?.affectedRows || 0) !== 1) {
    return { estado: (rec.odoo_estado as EstadoOdoo) || "cargando" };
  }

  const resultado = leerResultado(rec.odoo_resultado);
  try {
    // Primero, si un intento anterior se corto a mitad de una validacion.
    await resolverIntento(id, resultado);
    // Una recepcion por OC: si la recepcion donde se fue escribiendo ya se
    // valido (desde otro packing list o en Odoo), esta queda cargada.
    if (await acumuladoHecho(resultado)) {
      await cargarTraslados(rec, resultado, quien);
      await query(
        `UPDATE recepcion_packing SET odoo_estado = 'cargado', odoo_cargado_at = NOW(), odoo_error = NULL, odoo_resultado = ?
          WHERE id = ?`,
        [JSON.stringify(resultado), id],
      );
      return { estado: "cargado" };
    }

    const freno = await frenos(rec, poId, resultado);
    if (freno && !opts.saltarFrenos) {
      resultado.bloqueo = freno;
      throw new Error(
        freno.tipo === "packing_list_repetido"
          ? `Este packing list ya se cargo en Odoo en la recepcion ${freno.detalle.join(", ")}: no se carga dos veces.`
          : `La OC recibio en Odoo mercancia que no cargo el panel desde que empezo esta recepcion (${freno.detalle.join(", ")}). ` +
              "Si es esta misma mercancia, ya esta cargada y no se debe cargar otra vez. Revisalo en Odoo; si es otra, el SuperAdmin puede cargar igual.",
      );
    }
    if (freno && opts.saltarFrenos) {
      // El SuperAdmin reviso: esas recepciones no son de esta mercancia.
      if (freno.tipo === "recibido_en_odoo") {
        const hechas = await recepcionesHechas(poId);
        let previas: number[] = [];
        try {
          previas = JSON.parse(rec.odoo_recepciones_previas || "[]").map(Number);
        } catch {
          previas = [];
        }
        const nuevas = hechas.filter((p) => freno.detalle.includes(p.nombre)).map((p) => p.id);
        await query("UPDATE recepcion_packing SET odoo_recepciones_previas = ? WHERE id = ?", [
          JSON.stringify([...new Set([...previas, ...nuevas])]),
          id,
        ]);
      }
      console.warn(`[recepcion/odoo] recepcion ${id}: ${quien} salto el freno ${freno.tipo} (${freno.detalle.join(", ")})`);
    }
    resultado.bloqueo = null;

    if (!rec.odoo_oc_nombre) {
      const [po] = await odoo<any[]>("purchase.order", "read", [[poId], ["name"]]);
      rec.odoo_oc_nombre = po?.name ?? null;
      if (po?.name) await query("UPDATE recepcion_packing SET odoo_oc_nombre = ? WHERE id = ?", [po.name, id]);
    }

    // Productos que espera la OC, por codigo (para los renglones del packing list).
    const productosOc = await productosDeLaOc(poId);

    const { recibidos, sinProducto, apartados } = await recibidosPorProducto(datos.items, productosOc);
    resultado.sin_producto = sinProducto;
    resultado.apartados = apartados;

    if (await unaPorOc(rec, poId, resultado)) {
      const cerrar = await conCandadoOc(poId, async () => {
        const completa = await acumularEnRecepcion(rec, poId, recibidos, resultado);
        if (!completa && !opts.validarOc) return false;
        await validarAcumulado(rec, poId, resultado, quien);
        return true;
      });
      if (!cerrar) {
        await query(
          `UPDATE recepcion_packing SET odoo_estado = 'acumulado', odoo_error = NULL, odoo_resultado = ? WHERE id = ?`,
          [JSON.stringify(resultado), id],
        );
        return { estado: "acumulado" };
      }
      await cargarTraslados(rec, resultado, quien);
      await query(
        `UPDATE recepcion_packing
            SET odoo_estado = 'cargado', odoo_cargado_at = NOW(), odoo_error = NULL, odoo_resultado = ?
          WHERE id = ?`,
        [JSON.stringify(resultado), id],
      );
      return { estado: "cargado" };
    }

    await cargarRecepciones(rec, poId, recibidos, resultado, quien);
    await cargarTraslados(rec, resultado, quien);

    await query(
      `UPDATE recepcion_packing
          SET odoo_estado = 'cargado', odoo_cargado_at = NOW(), odoo_error = NULL, odoo_resultado = ?
        WHERE id = ?`,
      [JSON.stringify(resultado), id],
    );
    return { estado: "cargado" };
  } catch (e: any) {
    const msg = String(e?.message || e).slice(0, 2000);
    console.error(`[recepcion/odoo] recepcion ${id}:`, msg);
    await query("UPDATE recepcion_packing SET odoo_estado = 'error', odoo_error = ?, odoo_resultado = ? WHERE id = ?", [
      msg,
      JSON.stringify(resultado),
      id,
    ]);
    return { estado: "error", error: msg };
  }
}
