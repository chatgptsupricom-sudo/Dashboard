import { callOdooRPC, callOdooRPCEstricto } from "@/lib/odoo";
import { SIN_MARCA, type BorradorNC, type CandidataNC, type LineaBorrador, type ProductoFactura } from "@/lib/notas-credito/tipos";

/**
 * La nota de crédito en Odoo. El panel la hace igual que Victor a mano: con
 * el asistente "Revertir" de la factura (account.move.reversal → refund_moves),
 * que deja la NC en borrador en el diario de la factura con
 * ref "Reversión de: <factura>, <motivo>" y enlazada por reversed_entry_id.
 * Así da lo mismo hacerla en el panel o en Odoo: el panel encuentra la de
 * Odoo por la factura y la sigue (borrador → publicada / anulada).
 *
 * Todo lo que se escribe va con callOdooRPCEstricto (el error de Odoo llega
 * al usuario). En Odoo queda a nombre del usuario de ODOO_API_KEY; por eso se
 * deja una nota en el chatter con quién lo hizo en el panel.
 */

export type FacturaOdoo = {
  id: number;
  nombre: string;
  fecha: string | null;
  partner_id: number | null;
  cliente: string;
  moneda: string;
  total: number;
  journal_id: number | null;
  /** Lo que ya se acreditó con NC publicadas. */
  acreditado: number;
  lineas: { id: number; product_id: number | null; producto: string; cantidad: number; precio: number; total: number }[];
};

const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100;
const m2o = (v: any): [number, string] | null => (Array.isArray(v) && v.length ? [Number(v[0]), String(v[1] ?? "")] : null);

export function urlOdoo(moveId: number): string {
  const base = (process.env.NEXT_PUBLIC_ODOO_URL || "").replace(/\/+$/, "");
  return `${base}/web#id=${moveId}&model=account.move&view_type=form`;
}

const CAMPOS_FACTURA = ["name", "invoice_date", "partner_id", "currency_id", "amount_total", "journal_id"];

async function completarFactura(f: any): Promise<FacturaOdoo> {
  const [lineas, previas] = await Promise.all([
    callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [[["move_id", "=", f.id], ["display_type", "=", "product"]]],
      { fields: ["product_id", "name", "quantity", "price_unit", "price_total"], order: "sequence, id" },
    ),
    callOdooRPC<any[]>(
      "account.move",
      "search_read",
      [[["move_type", "=", "out_refund"], ["state", "=", "posted"], ["reversed_entry_id", "=", f.id]]],
      { fields: ["amount_total"] },
    ),
  ]);
  return {
    id: f.id,
    nombre: f.name,
    fecha: f.invoice_date || null,
    partner_id: m2o(f.partner_id)?.[0] ?? null,
    cliente: m2o(f.partner_id)?.[1] ?? "",
    moneda: m2o(f.currency_id)?.[1] ?? "USD",
    total: r2(f.amount_total),
    journal_id: m2o(f.journal_id)?.[0] ?? null,
    acreditado: r2((previas ?? []).reduce((s, p) => s + Number(p.amount_total || 0), 0)),
    lineas: (lineas ?? []).map((l) => ({
      id: l.id,
      product_id: m2o(l.product_id)?.[0] ?? null,
      producto: m2o(l.product_id)?.[1] ?? l.name ?? "",
      cantidad: Number(l.quantity) || 0,
      precio: Number(l.price_unit) || 0,
      total: r2(l.price_total),
    })),
  };
}

/** Factura de cliente publicada de la sede, por número exacto o por id. */
export async function leerFactura(companyId: number, ref: { id?: number | null; numero?: string | null }): Promise<FacturaOdoo | null> {
  const dominio: any[] = [["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["company_id", "=", companyId]];
  if (ref.id) dominio.push(["id", "=", ref.id]);
  else if (ref.numero?.trim()) dominio.push(["name", "=", ref.numero.trim()]);
  else return null;
  const r = await callOdooRPC<any[]>("account.move", "search_read", [dominio], { fields: CAMPOS_FACTURA, limit: 1 });
  if (r?.[0]) return completarFactura(r[0]);
  // RMA escribe el número a mano ("Fact. 5036649", "N° 5036649"): se busca el
  // número dentro, y solo se acepta si hay una sola factura que coincida.
  const digitos = !ref.id ? ref.numero?.match(/\d{5,}/)?.[0] : undefined;
  if (!digitos) return null;
  const parecidas = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[...dominio.slice(0, 3), ["name", "ilike", digitos]]],
    { fields: CAMPOS_FACTURA, limit: 2 },
  );
  return parecidas?.length === 1 ? completarFactura(parecidas[0]) : null;
}

/** Para el buscador de "Nueva nota de crédito": facturas cuyo número o cliente coincide. */
export async function buscarFacturas(companyId: number, q: string): Promise<FacturaOdoo[]> {
  const texto = q.trim();
  if (texto.length < 3) return [];
  const r = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[
      ["move_type", "=", "out_invoice"], ["state", "=", "posted"], ["company_id", "=", companyId],
      "|", ["name", "ilike", texto], ["partner_id.name", "ilike", texto],
    ]],
    { fields: CAMPOS_FACTURA, limit: 8, order: "invoice_date desc, id desc" },
  );
  return Promise.all((r ?? []).map(completarFactura));
}

/**
 * Los productos de la factura para "Nueva nota de crédito": marca
 * (spiff_brand_id), lo que queda por acreditar de cada línea y los seriales
 * despachados con ella.
 *   - Seriales: los move lines hechos hacia el cliente de las líneas de venta
 *     de la factura (sale_line_ids), menos los que el cliente devolvió.
 *   - Disponible: lo facturado menos lo de NC publicadas de la factura (por
 *     producto, se descuenta de las líneas en orden) y menos lo que ya pidieron
 *     otras solicitudes abiertas (`reservado`, por línea de factura).
 * `serialEn` dice qué solicitud ya tiene cada serial (en mayúsculas).
 */
export async function productosDeFactura(
  f: FacturaOdoo,
  reservado: Map<number, number>,
  serialEn: Map<string, number>,
): Promise<ProductoFactura[]> {
  const lineas = await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [[["move_id", "=", f.id], ["display_type", "=", "product"]]],
    { fields: ["product_id", "name", "quantity", "price_total", "sale_line_ids"], order: "sequence, id" },
  );
  const productIds = [...new Set((lineas ?? []).map((l) => m2o(l.product_id)?.[0]).filter(Boolean) as number[])];
  const ventaIds = [...new Set((lineas ?? []).flatMap((l) => l.sale_line_ids || []))] as number[];
  const conVenta = (extra: any[]) => [["move_id.sale_line_id", "in", ventaIds], ["state", "=", "done"], ["lot_id", "!=", false], extra];

  const [productos, salidas, devueltos, refunds] = await Promise.all([
    productIds.length
      ? callOdooRPC<any[]>("product.product", "read", [productIds], { fields: ["name", "default_code", "spiff_brand_id", "tracking"] })
      : Promise.resolve([]),
    ventaIds.length
      ? callOdooRPC<any[]>("stock.move.line", "search_read", [conVenta(["location_dest_id.usage", "=", "customer"])], {
          fields: ["lot_id", "move_id"],
          limit: 5000,
        })
      : Promise.resolve([]),
    ventaIds.length
      ? callOdooRPC<any[]>("stock.move.line", "search_read", [conVenta(["location_id.usage", "=", "customer"])], {
          fields: ["lot_id"],
          limit: 5000,
        })
      : Promise.resolve([]),
    callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [[
        ["move_id.move_type", "=", "out_refund"], ["move_id.state", "=", "posted"],
        ["move_id.reversed_entry_id", "=", f.id], ["display_type", "=", "product"],
      ]],
      { fields: ["product_id", "quantity"] },
    ),
  ]);

  const prod = new Map((productos ?? []).map((p) => [p.id, p]));
  // Línea de venta → seriales despachados (sin los que volvieron del cliente).
  const volvieron = new Set((devueltos ?? []).map((m) => m2o(m.lot_id)?.[1]).filter(Boolean));
  const moveIds = [...new Set((salidas ?? []).map((m) => m2o(m.move_id)?.[0]).filter(Boolean) as number[])];
  const ventaDeMove = new Map<number, number>();
  if (moveIds.length) {
    const moves = await callOdooRPC<any[]>("stock.move", "read", [moveIds], { fields: ["sale_line_id"] });
    for (const mv of moves ?? []) {
      const v = m2o(mv.sale_line_id)?.[0];
      if (v) ventaDeMove.set(mv.id, v);
    }
  }
  const serialesVenta = new Map<number, string[]>();
  for (const m of salidas ?? []) {
    const lote = m2o(m.lot_id)?.[1];
    const venta = ventaDeMove.get(m2o(m.move_id)?.[0] ?? 0);
    if (!lote || !venta || volvieron.has(lote)) continue;
    const lista = serialesVenta.get(venta) ?? [];
    if (!lista.includes(lote)) lista.push(lote);
    serialesVenta.set(venta, lista);
  }
  // Ya acreditado en NC publicadas, por producto.
  const acreditado = new Map<number, number>();
  for (const l of refunds ?? []) {
    const p = m2o(l.product_id)?.[0];
    if (p) acreditado.set(p, (acreditado.get(p) || 0) + (Number(l.quantity) || 0));
  }

  const out: ProductoFactura[] = [];
  for (const l of lineas ?? []) {
    const pid = m2o(l.product_id)?.[0] ?? null;
    const p = pid ? prod.get(pid) : null;
    const cantidad = Number(l.quantity) || 0;
    if (cantidad <= 0) continue;
    let libre = cantidad;
    const yaAcreditado = pid ? acreditado.get(pid) || 0 : 0;
    if (pid && yaAcreditado) {
      const usa = Math.min(libre, yaAcreditado);
      libre -= usa;
      acreditado.set(pid, yaAcreditado - usa);
    }
    libre = Math.max(0, libre - (reservado.get(l.id) || 0));
    const seriales: string[] = (l.sale_line_ids || []).flatMap((v: number) => serialesVenta.get(v) ?? []);
    out.push({
      linea_id: l.id,
      product_id: pid,
      producto: p?.name || m2o(l.product_id)?.[1] || l.name || "",
      codigo: p?.default_code || "",
      marca: m2o(p?.spiff_brand_id)?.[1]?.trim() || SIN_MARCA,
      cantidad,
      disponible: Math.round(libre * 10000) / 10000,
      precio_unidad: Math.round((Number(l.price_total) / cantidad) * 10000) / 10000,
      con_serial: p?.tracking === "serial",
      seriales: seriales.map((x) => ({ serial: x, nc: serialEn.get(x.toUpperCase()) ?? null })),
    });
  }
  return out;
}

/** Total con impuestos de UNA unidad del producto en la factura (NC de un equipo de RMA). */
export function montoDeUnaUnidad(f: FacturaOdoo, productId: number | null): number | null {
  if (!productId) return null;
  const linea = f.lineas.find((l) => l.product_id === productId && l.cantidad > 0);
  return linea ? r2(linea.total / linea.cantidad) : null;
}

async function nombresImpuestos(ids: number[]): Promise<Map<number, string>> {
  if (!ids.length) return new Map();
  const r = await callOdooRPC<any[]>("account.tax", "read", [ids], { fields: ["name"] });
  return new Map((r ?? []).map((t) => [t.id, t.name]));
}

/** La NC de Odoo con sus líneas, o null si ya no existe. */
export async function leerNotaOdoo(moveId: number): Promise<BorradorNC | null> {
  const r = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[["id", "=", moveId], ["move_type", "=", "out_refund"]]],
    { fields: ["name", "state", "ref", "nro_ctrl", "invoice_date", "currency_id", "amount_total", "amount_untaxed"], limit: 1 },
  );
  const m = r?.[0];
  if (!m) return null;
  const lineas = await callOdooRPC<any[]>(
    "account.move.line",
    "search_read",
    [[["move_id", "=", moveId], ["display_type", "=", "product"]]],
    { fields: ["product_id", "name", "quantity", "price_unit", "price_subtotal", "price_total", "tax_ids"], order: "sequence, id" },
  );
  const impuestos = await nombresImpuestos([...new Set((lineas ?? []).flatMap((l) => l.tax_ids || []))]);
  return {
    id: moveId,
    nombre: m.name && m.name !== "/" ? m.name : "Borrador",
    estado: m.state,
    ref: m.ref || "",
    nro_ctrl: m.nro_ctrl || "",
    fecha: m.invoice_date || null,
    moneda: m2o(m.currency_id)?.[1] ?? "USD",
    total: r2(m.amount_total),
    base: r2(m.amount_untaxed),
    url: urlOdoo(moveId),
    lineas: (lineas ?? []).map(
      (l): LineaBorrador => ({
        id: l.id,
        producto: m2o(l.product_id)?.[1] ?? "",
        descripcion: l.name || "",
        cantidad: Number(l.quantity) || 0,
        precio: Number(l.price_unit) || 0,
        subtotal: r2(l.price_subtotal),
        total: r2(l.price_total),
        impuestos: (l.tax_ids || []).map((id: number) => impuestos.get(id) || "").filter(Boolean).join(", "),
      }),
    ),
  };
}

/** Estado, número y total de varias NC de Odoo a la vez (las que ya no existen no vienen). */
export async function estadosNotasOdoo(ids: number[]): Promise<Map<number, { nombre: string; estado: string; total: number; por: string }>> {
  if (!ids.length) return new Map();
  const r = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[["id", "in", ids]]],
    { fields: ["name", "state", "amount_total", "write_uid"] },
  );
  return new Map(
    (r ?? []).map((m) => [m.id, { nombre: m.name && m.name !== "/" ? m.name : "Borrador", estado: m.state, total: r2(m.amount_total), por: m2o(m.write_uid)?.[1] ?? "" }]),
  );
}

/**
 * NC de la factura hechas desde `desdeUtc` (sin anular) que no son de otra
 * solicitud: las que Victor pudo haber hecho directo en Odoo.
 */
export async function candidatasOdoo(facturaId: number, desdeUtc: string, excluir: number[]): Promise<CandidataNC[]> {
  const r = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[
      ["move_type", "=", "out_refund"], ["reversed_entry_id", "=", facturaId], ["state", "in", ["draft", "posted"]],
      ["create_date", ">=", desdeUtc], ...(excluir.length ? [["id", "not in", excluir]] : []),
    ]],
    { fields: ["name", "state", "amount_total", "invoice_date", "create_uid"], order: "id" },
  );
  return (r ?? []).map((m) => ({
    id: m.id,
    nombre: m.name && m.name !== "/" ? m.name : "Borrador",
    estado: m.state,
    total: r2(m.amount_total),
    fecha: m.invoice_date || null,
    creado_por: m2o(m.create_uid)?.[1] ?? "",
  }));
}

function hoyCaracas(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(new Date());
}

/**
 * Crea la NC en borrador con el asistente de reversión. Con `soloProducto`
 * (equipo de RMA) deja solo la línea de ese producto, con 1 unidad; si la
 * factura no lo tiene, quedan todas para que se ajusten a mano. Con `lineas`
 * (NC directa con productos elegidos) deja solo esas líneas de la factura, con
 * la cantidad pedida y los seriales en la descripción.
 */
export async function crearBorradorOdoo(datos: {
  facturaId: number;
  journalId: number | null;
  companyId: number;
  motivo: string;
  soloProducto: number | null;
  lineas?: LineaElegida[];
}): Promise<{ moveId: number; aviso: string | null }> {
  const contexto = { active_model: "account.move", active_ids: [datos.facturaId], active_id: datos.facturaId };
  const valores: Record<string, any> = {
    move_ids: [[6, 0, [datos.facturaId]]],
    reason: datos.motivo.slice(0, 250),
    date: hoyCaracas(),
    company_id: datos.companyId,
  };
  if (datos.journalId) valores.journal_id = datos.journalId;
  const asistente = await callOdooRPCEstricto<number>("account.move.reversal", "create", [valores], { context: contexto });
  if (!asistente) throw new Error("Odoo no creó el asistente de reversión.");
  const accion = await callOdooRPCEstricto<any>("account.move.reversal", "refund_moves", [[asistente]], { context: contexto });

  let moveId = Number(accion?.res_id) || 0;
  if (!moveId) {
    const nuevas = await callOdooRPCEstricto<any[]>("account.move.reversal", "read", [[asistente]], { fields: ["new_move_ids"] });
    moveId = Number(nuevas?.[0]?.new_move_ids?.[0]) || 0;
  }
  if (!moveId) throw new Error("Odoo no devolvió la nota de crédito creada.");

  let aviso: string | null = null;
  if (datos.lineas?.length) {
    aviso = await dejarLineasElegidas(moveId, datos.facturaId, datos.lineas);
  } else if (datos.soloProducto) {
    const lineas = await callOdooRPC<any[]>(
      "account.move.line",
      "search_read",
      [[["move_id", "=", moveId], ["display_type", "=", "product"]]],
      { fields: ["product_id"] },
    );
    const delProducto = (lineas ?? []).filter((l) => m2o(l.product_id)?.[0] === datos.soloProducto);
    if (delProducto.length) {
      const [queda, ...sobran] = delProducto;
      const otras = (lineas ?? []).filter((l) => m2o(l.product_id)?.[0] !== datos.soloProducto);
      await callOdooRPCEstricto("account.move", "write", [
        [moveId],
        { invoice_line_ids: [[1, queda.id, { quantity: 1 }], ...[...sobran, ...otras].map((l) => [2, l.id])] },
      ]);
    } else {
      aviso = "La factura no tiene una línea de ese producto: la nota quedó con todas las líneas, ajústala antes de publicarla.";
    }
  }
  return { moveId, aviso };
}

type LineaElegida = { linea_factura_id: number; product_id: number | null; cantidad: number; seriales: string[] };

/**
 * Deja en el borrador solo las líneas elegidas. El asistente copia las líneas
 * de la factura en el mismo orden, así que la n-ésima línea de producto de la
 * NC es la n-ésima de la factura; si no cuadran (alguien cambió algo), se
 * empareja por producto.
 */
async function dejarLineasElegidas(moveId: number, facturaId: number, elegidas: LineaElegida[]): Promise<string | null> {
  const campos = { fields: ["product_id", "name"], order: "sequence, id" };
  const [nc, fac] = await Promise.all([
    callOdooRPCEstricto<any[]>("account.move.line", "search_read", [[["move_id", "=", moveId], ["display_type", "=", "product"]]], campos),
    callOdooRPCEstricto<any[]>("account.move.line", "search_read", [[["move_id", "=", facturaId], ["display_type", "=", "product"]]], campos),
  ]);
  const lineasNc = nc ?? [];
  const lineasFac = fac ?? [];
  const mismoOrden =
    lineasNc.length === lineasFac.length && lineasNc.every((l, i) => m2o(l.product_id)?.[0] === m2o(lineasFac[i].product_id)?.[0]);
  const usadas = new Set<number>();
  const comandos: any[] = [];
  let faltan = 0;
  for (const e of elegidas) {
    let linea: any = null;
    if (mismoOrden) {
      const i = lineasFac.findIndex((l) => l.id === e.linea_factura_id);
      if (i >= 0 && !usadas.has(lineasNc[i].id)) linea = lineasNc[i];
    }
    linea ??= lineasNc.find((l) => !usadas.has(l.id) && m2o(l.product_id)?.[0] === e.product_id) ?? null;
    if (!linea) {
      faltan++;
      continue;
    }
    usadas.add(linea.id);
    const nombre = e.seriales.length ? `${linea.name || ""}\nS/N: ${e.seriales.join(", ")}`.trim() : linea.name;
    comandos.push([1, linea.id, { quantity: e.cantidad, name: nombre }]);
  }
  if (!usadas.size) {
    return "No se encontraron en la nota las líneas de los productos elegidos: quedó con todas, ajústala antes de publicarla.";
  }
  for (const l of lineasNc) if (!usadas.has(l.id)) comandos.push([2, l.id]);
  await callOdooRPCEstricto("account.move", "write", [[moveId], { invoice_line_ids: comandos }]);
  return faltan ? `${faltan} de los productos elegidos no se encontró en la nota: revísala antes de publicarla.` : null;
}

/** Cambios al borrador desde el panel: cantidad y precio por línea, quitar líneas, número de control y fecha. */
export async function guardarBorradorOdoo(
  moveId: number,
  cambios: { lineas?: { id: number; cantidad?: number; precio?: number; quitar?: boolean }[]; nro_ctrl?: string; fecha?: string },
): Promise<void> {
  const actual = await leerNotaOdoo(moveId);
  if (!actual) throw new Error("La nota de crédito ya no existe en Odoo.");
  if (actual.estado !== "draft") throw new Error("La nota de crédito ya no está en borrador: se cambia en Odoo.");
  const ids = new Set(actual.lineas.map((l) => l.id));
  const comandos: any[] = [];
  for (const l of cambios.lineas ?? []) {
    if (!ids.has(l.id)) continue;
    if (l.quitar) {
      comandos.push([2, l.id]);
      continue;
    }
    const v: Record<string, number> = {};
    if (l.cantidad != null) {
      if (!(l.cantidad > 0)) throw new Error("La cantidad de cada línea tiene que ser mayor que cero.");
      v.quantity = l.cantidad;
    }
    if (l.precio != null) {
      if (!(l.precio >= 0)) throw new Error("El precio no puede ser negativo.");
      v.price_unit = l.precio;
    }
    if (Object.keys(v).length) comandos.push([1, l.id, v]);
  }
  if (comandos.filter((c) => c[0] === 2).length >= actual.lineas.length) {
    throw new Error("La nota de crédito tiene que quedar con al menos una línea.");
  }
  const valores: Record<string, any> = {};
  if (comandos.length) valores.invoice_line_ids = comandos;
  if (cambios.nro_ctrl !== undefined) valores.nro_ctrl = cambios.nro_ctrl.trim().slice(0, 64) || false;
  if (cambios.fecha !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cambios.fecha)) throw new Error("Fecha inválida.");
    valores.invoice_date = cambios.fecha;
  }
  if (Object.keys(valores).length) await callOdooRPCEstricto("account.move", "write", [[moveId], valores]);
}

export async function publicarOdoo(moveId: number): Promise<void> {
  await callOdooRPCEstricto("account.move", "action_post", [[moveId]]);
}

/** Nota interna en el chatter de la NC. Si falla, no se frena nada. */
export async function notaEnChatter(moveId: number, texto: string): Promise<void> {
  try {
    await callOdooRPCEstricto("account.move", "message_post", [[moveId]], {
      body: texto,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
  } catch (e: any) {
    console.error(`[notas-credito] chatter de la NC ${moveId}:`, e?.message);
  }
}

export type NotaOdooMes = {
  id: number;
  nombre: string;
  company_id: number;
  fecha: string | null;
  cliente: string;
  factura: string;
  moneda: string;
  total: number;
  estado: string;
  ref: string;
  nro_ctrl: string;
  creado_por: string;
  url: string;
};

/**
 * Notas de crédito de cliente de Odoo (out_refund) de las sedes en el rango
 * [desde, hasta), por fecha de la NC (las en borrador sin fecha, por la de
 * creación). La lista del panel es la de Odoo: se ven también las hechas sin
 * pasar por el flujo.
 */
export async function notasOdooDelRango(sedes: number[], desde: string, hasta: string): Promise<NotaOdooMes[]> {
  return leerNotasOdoo(sedes, [
    "|", "&", ["invoice_date", ">=", desde], ["invoice_date", "<", hasta],
    "&", "&", ["invoice_date", "=", false], ["create_date", ">=", `${desde} 00:00:00`], ["create_date", "<", `${hasta} 00:00:00`],
  ]);
}

/** Las NC de cliente en borrador en Odoo, de cualquier fecha: siguen "en curso". */
export async function notasOdooBorrador(sedes: number[]): Promise<NotaOdooMes[]> {
  return leerNotasOdoo(sedes, [["state", "=", "draft"]]);
}

async function leerNotasOdoo(sedes: number[], filtro: any[]): Promise<NotaOdooMes[]> {
  if (!sedes.length) return [];
  const r = await callOdooRPC<any[]>(
    "account.move",
    "search_read",
    [[["move_type", "=", "out_refund"], ["company_id", "in", sedes], ...filtro]],
    {
      fields: ["name", "company_id", "invoice_date", "create_date", "partner_id", "reversed_entry_id", "currency_id", "amount_total", "state", "ref", "nro_ctrl", "create_uid"],
      order: "invoice_date desc, id desc",
      limit: 1000,
    },
  );
  if (!r) throw new Error("Odoo no respondió la consulta de notas de crédito.");
  return r.map((m) => ({
    id: m.id,
    nombre: m.name && m.name !== "/" ? m.name : "Borrador",
    company_id: m2o(m.company_id)?.[0] ?? 0,
    // Un borrador todavía no tiene fecha de NC: se usa el día en que se creó.
    fecha: m.invoice_date || (m.create_date ? String(m.create_date).slice(0, 10) : null),
    cliente: m2o(m.partner_id)?.[1] ?? "",
    factura: m2o(m.reversed_entry_id)?.[1] ?? "",
    moneda: m2o(m.currency_id)?.[1] ?? "USD",
    total: r2(m.amount_total),
    estado: m.state,
    ref: m.ref || "",
    nro_ctrl: m.nro_ctrl || "",
    creado_por: m2o(m.create_uid)?.[1] ?? "",
    url: urlOdoo(m.id),
  }));
}
