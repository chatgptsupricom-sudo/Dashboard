import { query } from "@/lib/db";
import { callOdooRPC } from "@/lib/odoo";
import { evaluarSeriales } from "@/lib/seguridad/egresoFlujo";

/**
 * Seriales esperados de un egreso, sacados del picking de Odoo (issue #299).
 *
 * Lo que dice Odoo (medido en septiembre de 2026):
 *  - En un picking "Listo" (`assigned`) ninguna linea trae serial: Odoo
 *    aparta la cantidad, no el serial. El serial se carga cuando el
 *    almacenista procesa el picking; en los despachados, el 100% de las
 *    lineas con `tracking = 'serial'` lo tienen.
 *  - No hay productos con lote (`tracking = 'lot'`) en las salidas.
 *
 * Por eso los seriales no se copian al registrar el egreso: se leen despues,
 * con "Actualizar desde Odoo" mientras el egreso esta en Almacen, y a la
 * fuerza al asignar el despacho, que es el paso que lo manda a Seguridad.
 *
 * Una fila por serial en `seguridad_mercancia_seriales`. `verificado_at` /
 * `verificado_por` los llena Seguridad al pistolear en C4 (issue #301).
 * Mientras el egreso esta en Almacen nadie verifico nada, asi que releer
 * reemplaza la lista entera; una vez en Seguridad ya no se relee.
 */

export type SerialEgreso = {
  id: number;
  item_id: number;
  serial: string;
  verificado_at: string | null;
  verificado_por: string | null;
};

const MAX_SERIAL = 100;

/** Seriales guardados de un egreso. Sin la tabla (migracion pendiente): ninguno. */
export async function leerSerialesEgreso(mercanciaId: number): Promise<SerialEgreso[]> {
  try {
    const r = await query(
      `SELECT id, item_id, serial, verificado_at, verificado_por
         FROM seguridad_mercancia_seriales WHERE mercancia_id = ? ORDER BY item_id, id`,
      [mercanciaId],
    );
    return r.rows as SerialEgreso[];
  } catch {
    return [];
  }
}

export function faltaMigracion(e: any): boolean {
  return /doesn't exist|no existe|Unknown column/i.test(e?.message || "");
}

/**
 * Relee de Odoo los seriales del picking y los deja guardados por renglon.
 *
 * - `lleva_serial` de cada renglon sale del `tracking` de la linea de Odoo.
 * - Un serial repetido en dos lineas cuenta una vez.
 * - Un serial de un producto que no esta en el egreso (el picking se cambio
 *   en Odoo despues de registrarlo) no se guarda: se cuenta en `ajenos`.
 *
 * Lanza si Odoo no responde (no es lo mismo que "no hay seriales") o si
 * falta la migracion (`faltaMigracion`), para que el caller decida.
 */
export async function sincronizarSeriales(mercanciaId: number, pickingId: number) {
  const lineas = await callOdooRPC<any[]>(
    "stock.move.line",
    "search_read",
    [[["picking_id", "=", pickingId]]],
    { fields: ["product_id", "lot_id", "lot_name", "tracking", "quantity"], limit: 2000 },
  );
  if (!lineas) throw new Error("no se pudieron leer las lineas del picking en Odoo");

  const itemsRes = await query(
    `SELECT id, odoo_product_id, producto, cantidad_cargada, lleva_serial
       FROM seguridad_mercancia_items WHERE mercancia_id = ? ORDER BY id`,
    [mercanciaId],
  );
  const items = itemsRes.rows as any[];
  const itemPorProducto = new Map<number, any>();
  for (const i of items) if (i.odoo_product_id != null) itemPorProducto.set(Number(i.odoo_product_id), i);

  const conSerial = new Set<number>();
  const vistos = new Set<string>();
  const nuevos: Array<{ item_id: number; serial: string; lot_id: number | null }> = [];
  let ajenos = 0;
  for (const l of lineas) {
    const productoId = l.product_id?.[0];
    if (l.tracking === "serial" && productoId) conSerial.add(productoId);
    const serial = String(l.lot_id?.[1] || l.lot_name || "").trim().slice(0, MAX_SERIAL);
    if (!serial || !productoId) continue;
    const item = itemPorProducto.get(productoId);
    if (!item) {
      ajenos++;
      continue;
    }
    // La tabla compara sin mayusculas (collation _ci): se deduplica igual.
    const clave = serial.toUpperCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    nuevos.push({ item_id: Number(item.id), serial, lot_id: l.lot_id?.[0] ?? null });
  }

  // Un renglon sin id de Odoo (egresos viejos) no se puede cruzar: queda 0.
  for (const i of items) {
    const valor = i.odoo_product_id != null && conSerial.has(Number(i.odoo_product_id)) ? 1 : 0;
    i.lleva_serial = valor;
    await query("UPDATE seguridad_mercancia_items SET lleva_serial = ? WHERE id = ?", [valor, i.id]);
  }

  // Solo lo que nadie verifico: lo que ya pistoleo Seguridad no se toca.
  await query(
    "DELETE FROM seguridad_mercancia_seriales WHERE mercancia_id = ? AND verificado_at IS NULL",
    [mercanciaId],
  );
  if (nuevos.length > 0) {
    const valores: unknown[] = [];
    const marcadores = nuevos
      .map((n) => {
        valores.push(mercanciaId, n.item_id, n.serial, n.lot_id);
        return "(?, ?, ?, ?)";
      })
      .join(", ");
    await query(
      `INSERT IGNORE INTO seguridad_mercancia_seriales
        (mercancia_id, item_id, serial, odoo_lot_id)
       VALUES ${marcadores}`,
      valores,
    );
  }
  await query("UPDATE seguridad_mercancia SET seriales_leidos_at = NOW() WHERE id = ?", [mercanciaId]);

  const seriales = await leerSerialesEgreso(mercanciaId);
  return { ...evaluarSeriales(items, seriales), ajenos };
}
