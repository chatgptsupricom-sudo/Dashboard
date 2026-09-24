import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { normalizarCodigo } from "@/lib/recepcion/flujo";

/**
 * Seriales y codigos de la pistola en la recepcion por packing list.
 *
 * Que producto lleva serial lo dice Odoo (product.tracking = "serial" o
 * "lot"): el renglon guarda la respuesta en `lleva_serial` la primera vez que
 * se carga el packing list, asi no se le pregunta a Odoo cada vez.
 */

export type SerialLeido = {
  id: number;
  item_id: number;
  serial: string;
  escaneado_por: string | null;
  created_at: string;
};

/**
 * Llena `lleva_serial` de los renglones que todavia no lo tienen, con una sola
 * consulta a Odoo. Si Odoo no responde, quedan como estan (NULL = sin serial)
 * y se vuelve a intentar en la proxima carga. Devuelve los renglones con el
 * valor puesto.
 */
export async function completarLlevaSerial<T extends { id: number; codigo: string | null; lleva_serial?: any }>(
  items: T[],
): Promise<T[]> {
  const pendientes = items.filter((i) => i.lleva_serial === null || i.lleva_serial === undefined);
  if (pendientes.length === 0) return items;

  const codigos = [...new Set(pendientes.map((i) => (i.codigo || "").trim()).filter(Boolean))];
  let conSerial = new Set<string>();
  if (codigos.length > 0) {
    try {
      const productos = await callOdooRPC<any[]>(
        "product.product",
        "search_read",
        [[["default_code", "in", codigos]]],
        { fields: ["default_code", "tracking"], limit: 0, context: { active_test: false } },
      );
      conSerial = new Set(
        (productos || [])
          .filter((p) => p.tracking && p.tracking !== "none")
          .map((p) => normalizarCodigo(p.default_code)),
      );
    } catch (e: any) {
      console.error("[recepcion] no se pudo consultar en Odoo que productos llevan serial:", e?.message);
      return items;
    }
  }

  for (const i of pendientes) {
    const valor = i.codigo && conSerial.has(normalizarCodigo(i.codigo)) ? 1 : 0;
    (i as any).lleva_serial = valor;
    try {
      await query("UPDATE recepcion_packing_items SET lleva_serial = ? WHERE id = ? AND lleva_serial IS NULL", [
        valor,
        i.id,
      ]);
    } catch {
      // Sin la columna (migracion pendiente) se usa igual en memoria.
    }
  }
  return items;
}

/** Seriales de un packing list, en el orden en que se pistolearon. */
export async function leerSeriales(recepcionId: number): Promise<SerialLeido[]> {
  try {
    const r = await query(
      `SELECT id, item_id, serial, escaneado_por, created_at
         FROM recepcion_packing_seriales WHERE recepcion_id = ? ORDER BY id`,
      [recepcionId],
    );
    return r.rows as SerialLeido[];
  } catch {
    // Sin la tabla (migracion pendiente): sin seriales.
    return [];
  }
}

/** Codigo de producto al que apunta un codigo de caja aprendido, o null. */
export async function buscarAlias(codigoNormalizado: string): Promise<string | null> {
  try {
    const r = await query("SELECT producto_codigo FROM recepcion_codigos_alias WHERE codigo = ?", [
      codigoNormalizado,
    ]);
    return (r.rows as any[])[0]?.producto_codigo ?? null;
  } catch {
    return null;
  }
}

/** Cuenta los seriales de un renglon y la deja como su cantidad recibida. */
export async function recontarSeriales(itemId: number): Promise<number> {
  const r = await query("SELECT COUNT(*) AS n FROM recepcion_packing_seriales WHERE item_id = ?", [itemId]);
  const n = Number((r.rows as any[])[0]?.n || 0);
  await query("UPDATE recepcion_packing_items SET cantidad_recibida = ? WHERE id = ?", [n, itemId]);
  return n;
}
