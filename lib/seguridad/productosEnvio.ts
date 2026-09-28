import { query } from "@/lib/db";
import { hayTablaProductos, leerProductos, productoPendiente } from "@/lib/rma/items";

/**
 * Productos de un envío de servicio técnico en Seguridad (issue #331, paso 4).
 *
 * Seguridad hace UN ingreso por envío, con la lista de sus productos para
 * marcar cuáles llegaron y con qué serial (`seguridad_ingreso_items`), y lo
 * devuelve en uno o varios despachos: cada despacho dice qué productos salieron
 * (`seguridad_despacho_items`) y los marca como despachados en RMA.
 *
 * Todo degrada si no se corrió sql/seguridad_productos_envio.sql: sin las
 * tablas, el ingreso y el despacho funcionan como antes (el envío entero).
 */

export type ProductoIngreso = {
  rma_item_id: number | null;
  producto: string;
  serial: string | null;
  recibido: boolean;
  observacion: string | null;
};

export type ProductoDespacho = {
  rma_item_id: number | null;
  producto: string;
  serial: string | null;
};

let hayTablas = false;

/** Si ya se corrió sql/seguridad_productos_envio.sql. Se cachea solo el "sí". */
export async function hayTablasSeguridad(): Promise<boolean> {
  if (hayTablas) return true;
  try {
    const a = await query("SHOW TABLES LIKE 'seguridad_ingreso_items'");
    const b = await query("SHOW TABLES LIKE 'seguridad_despacho_items'");
    hayTablas = (a.rows as any[]).length > 0 && (b.rows as any[]).length > 0;
  } catch {
    hayTablas = false;
  }
  return hayTablas;
}

const nombre = (p: { model: string | null; hardware: string | null }) => p.model || p.hardware || "";

/**
 * Valida lo que Seguridad marcó contra los productos del envío. Devuelve el
 * error para el usuario, o las filas a guardar. Tiene que venir cada producto
 * del envío exactamente una vez (el acta dice qué pasó con todos), y al menos
 * uno recibido.
 */
export async function validarProductosIngreso(
  caseId: number,
  crudo: unknown,
): Promise<{ error: string } | { filas: ProductoIngreso[] }> {
  if (!Array.isArray(crudo)) return { error: "productos debe ser una lista" };
  const productos = await leerProductos(caseId);
  const porId = new Map(productos.map((p) => [p.id, p]));
  const vistos = new Set<number>();
  const filas: ProductoIngreso[] = [];

  for (const x of crudo as any[]) {
    const id = parseInt(String(x?.rma_item_id ?? ""), 10);
    const prod = porId.get(id);
    if (!prod) return { error: "Hay un producto que no es de este envío" };
    if (vistos.has(id)) return { error: "Hay un producto repetido" };
    if (typeof x?.recibido !== "boolean") return { error: `Indica si llegó ${nombre(prod)}` };
    vistos.add(id);
    const serial = String(x?.serial ?? "").trim().slice(0, 200);
    const observacion = String(x?.observacion ?? "").trim().slice(0, 500);
    filas.push({
      rma_item_id: id,
      producto: nombre(prod).slice(0, 500),
      serial: serial || null,
      recibido: x.recibido,
      observacion: observacion || null,
    });
  }

  if (vistos.size !== productos.length) return { error: "Falta indicar qué pasó con algún producto del envío" };
  if (!filas.some((f) => f.recibido)) return { error: "No se marcó ningún producto como recibido" };
  return { filas };
}

export async function guardarProductosIngreso(ingresoId: number, filas: ProductoIngreso[]): Promise<void> {
  for (const f of filas) {
    await query(
      `INSERT INTO seguridad_ingreso_items (ingreso_id, rma_item_id, producto, serial, recibido, observacion)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [ingresoId, f.rma_item_id, f.producto, f.serial, f.recibido ? 1 : 0, f.observacion],
    );
  }
}

/**
 * Productos de un ingreso con su situación actual: lo que se firmó al recibir
 * y si ya salió (de rma_case_items). [] sin tablas o si el ingreso no los
 * registró (ingresos de antes, o de un solo producto).
 */
export async function leerProductosIngreso(
  ingresoId: number,
): Promise<(ProductoIngreso & { despachado_at: string | null; status: string | null })[]> {
  if (!(await hayTablasSeguridad())) return [];
  const r = await query(
    `SELECT ii.rma_item_id, ii.producto, ii.serial, ii.recibido, ii.observacion,
            ci.despachado_at, ci.status
       FROM seguridad_ingreso_items ii
       LEFT JOIN rma_case_items ci ON ci.id = ii.rma_item_id
      WHERE ii.ingreso_id = ?
      ORDER BY ii.id`,
    [ingresoId],
  );
  return (r.rows as any[]).map((x) => ({
    rma_item_id: x.rma_item_id ?? null,
    producto: x.producto,
    serial: x.serial ?? null,
    recibido: !!x.recibido,
    observacion: x.observacion ?? null,
    despachado_at: x.despachado_at ?? null,
    status: x.status ?? null,
  }));
}

/**
 * Qué productos salen en un despacho. Sin `itemIds`, todos los del envío que
 * sigan en el taller (y que hayan llegado, si el ingreso lo registró). Con
 * ellos, esos: tienen que ser del envío y no haber salido ya.
 */
export async function productosParaDespacho(
  caseId: number,
  itemIds: number[] | null,
  ingresoId: number | null,
): Promise<{ error: string } | { filas: ProductoDespacho[]; ids: number[] }> {
  if (!(await hayTablaProductos())) return { filas: [], ids: [] };
  const productos = (await leerProductos(caseId)).filter((p) => !p.despachado_at);

  // Los que el ingreso marcó como no recibidos no pueden salir: nunca entraron.
  let noLlegaron = new Set<number>();
  if (ingresoId && (await hayTablasSeguridad())) {
    const r = await query(
      `SELECT rma_item_id FROM seguridad_ingreso_items WHERE ingreso_id = ? AND recibido = 0`,
      [ingresoId],
    );
    noLlegaron = new Set((r.rows as any[]).map((x) => Number(x.rma_item_id)));
  }
  const disponibles = productos.filter((p) => !noLlegaron.has(p.id));
  // Solo sale lo que RMA ya terminó (reparado, nota de crédito, no
  // procesado): lo que sigue en revisión o esperando una nota de crédito se
  // queda en el taller.
  const terminados = disponibles.filter((p) => !productoPendiente(p.status));

  let elegidos = terminados;
  if (itemIds) {
    const porId = new Map(disponibles.map((p) => [p.id, p]));
    if (!itemIds.length) return { error: "Elige qué productos salen" };
    const noVino = productos.find((p) => itemIds.includes(p.id) && noLlegaron.has(p.id));
    if (noVino) return { error: `${nombre(noVino)} no llegó en el ingreso: no puede salir` };
    if (itemIds.some((id) => !porId.has(id))) {
      return { error: "Hay un producto que no es de este envío o ya salió" };
    }
    const enTaller = itemIds.map((id) => porId.get(id)!).find((p) => productoPendiente(p.status));
    if (enTaller) return { error: `${nombre(enTaller)} sigue en revisión en RMA: todavía no puede salir` };
    elegidos = itemIds.map((id) => porId.get(id)!);
  } else if (disponibles.length && !terminados.length) {
    return { error: "RMA todavía no terminó ningún producto de este envío" };
  }

  return {
    ids: elegidos.map((p) => p.id),
    filas: elegidos.map((p) => ({ rma_item_id: p.id, producto: nombre(p).slice(0, 500), serial: p.serial })),
  };
}

export async function guardarProductosDespacho(despachoId: number, filas: ProductoDespacho[]): Promise<void> {
  if (!filas.length || !(await hayTablasSeguridad())) return;
  for (const f of filas) {
    await query(
      `INSERT INTO seguridad_despacho_items (despacho_id, rma_item_id, producto, serial) VALUES (?, ?, ?, ?)`,
      [despachoId, f.rma_item_id, f.producto, f.serial],
    );
  }
}

export async function leerProductosDespacho(despachoId: number): Promise<ProductoDespacho[]> {
  if (!(await hayTablasSeguridad())) return [];
  const r = await query(
    `SELECT rma_item_id, producto, serial FROM seguridad_despacho_items WHERE despacho_id = ? ORDER BY id`,
    [despachoId],
  );
  return r.rows as ProductoDespacho[];
}

/** Tabla HTML de productos para las actas impresas (ingreso y despacho). */
export function tablaProductosHtml(
  filas: { producto: string; serial: string | null; recibido?: boolean; observacion?: string | null }[],
  esc: (v: any) => string,
  conRecibido: boolean,
): string {
  if (!filas.length) return "";
  const cab = conRecibido
    ? "<tr><th>#</th><th>Producto</th><th>Serial</th><th>Lleg&oacute;</th><th>Observaci&oacute;n</th></tr>"
    : "<tr><th>#</th><th>Producto</th><th>Serial</th></tr>";
  const cuerpo = filas
    .map((f, i) =>
      conRecibido
        ? `<tr><td>${i + 1}</td><td>${esc(f.producto)}</td><td>${esc(f.serial) || "&mdash;"}</td><td>${f.recibido ? "S&iacute;" : "<strong>No</strong>"}</td><td>${esc(f.observacion) || "&mdash;"}</td></tr>`
        : `<tr><td>${i + 1}</td><td>${esc(f.producto)}</td><td>${esc(f.serial) || "&mdash;"}</td></tr>`,
    )
    .join("");
  return `<table class="productos" style="margin-top:12px">${cab}${cuerpo}</table>`;
}
