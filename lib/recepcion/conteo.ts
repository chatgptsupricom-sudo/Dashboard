import { query } from "@/lib/db";

/**
 * Conteo por contenedor de la recepcion por packing list.
 *
 * Almacen descarga varios contenedores a la vez, con varios telefonos (el
 * mismo usuario en todos). Cada telefono elige el contenedor que esta
 * descargando y cuenta solo ahi: cada lectura y cada cantidad escrita queda
 * en la fila (renglon, contenedor) de `recepcion_packing_conteo`, y nadie
 * escribe en la fila de otro.
 *
 * `recepcion_packing_items.cantidad_recibida` sigue siendo el total del
 * renglon (lo que mira el cierre y lo que se carga en Odoo): es la suma de
 * sus filas y se recalcula con cada cambio (`actualizarTotal`).
 *
 * `cantidad_esperada` de la fila es lo que el packing list dice para ese
 * contenedor, cuando lo dice (Compras lo carga del PDF). Sin eso, solo se
 * compara el total.
 *
 * `contenedor_id = 0` es "sin contenedor": la recepcion por factura (no tiene
 * contenedores) y lo contado antes de que existiera esto.
 *
 * La tabla y la columna `contenedor_id` de los seriales se crean solas; DDL de
 * referencia en sql/recepcion_conteo_contenedor.sql.
 */

export type FilaConteo = {
  item_id: number;
  contenedor_id: number;
  cantidad_esperada: number | null;
  cantidad_recibida: number | null;
  actualizado_por: string | null;
};

const DDL_CONTEO = `
  CREATE TABLE IF NOT EXISTS recepcion_packing_conteo (
    id INT AUTO_INCREMENT PRIMARY KEY,
    recepcion_id INT NOT NULL,
    item_id INT NOT NULL,
    contenedor_id INT NOT NULL DEFAULT 0,
    cantidad_esperada DECIMAL(14,3) DEFAULT NULL,
    cantidad_recibida DECIMAL(14,3) DEFAULT NULL,
    actualizado_por VARCHAR(200) DEFAULT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_conteo_item_contenedor (item_id, contenedor_id),
    KEY idx_conteo_recepcion (recepcion_id)%FK%
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`;

// Al borrar un renglon (Compras edita el packing list) o la recepcion entera,
// se van sus filas.
const FK_ITEM = `,
    CONSTRAINT fk_conteo_item FOREIGN KEY (item_id)
      REFERENCES recepcion_packing_items(id) ON DELETE CASCADE`;

let lista: Promise<void> | null = null;

export function asegurarTablaConteo(): Promise<void> {
  if (!lista) {
    lista = (async () => {
      try {
        await query(DDL_CONTEO.replace("%FK%", FK_ITEM));
      } catch (e: any) {
        // Sin permiso para la llave foranea, la tabla igual sirve: las filas
        // de un renglon borrado quedan sueltas y no se leen.
        console.error("[recepcion] conteo sin llave foranea:", e?.message);
        await query(DDL_CONTEO.replace("%FK%", ""));
      }
      const r = await query("SHOW COLUMNS FROM recepcion_packing_seriales LIKE 'contenedor_id'");
      if ((r.rows as any[]).length === 0) {
        await query("ALTER TABLE recepcion_packing_seriales ADD COLUMN contenedor_id INT NOT NULL DEFAULT 0");
      }
    })().catch((e) => {
      lista = null;
      throw e;
    });
  }
  return lista;
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function leerConteo(recepcionId: number): Promise<FilaConteo[]> {
  const r = await query(
    `SELECT item_id, contenedor_id, cantidad_esperada, cantidad_recibida, actualizado_por
       FROM recepcion_packing_conteo WHERE recepcion_id = ? ORDER BY contenedor_id, item_id`,
    [recepcionId],
  );
  return (r.rows as any[]).map((f) => ({
    item_id: Number(f.item_id),
    contenedor_id: Number(f.contenedor_id),
    cantidad_esperada: num(f.cantidad_esperada),
    cantidad_recibida: num(f.cantidad_recibida),
    actualizado_por: f.actualizado_por ?? null,
  }));
}

/**
 * Recepciones que se estaban contando antes de esto: lo que ya tenia el
 * renglon pasa a la fila "sin contenedor", para que el total (la suma de las
 * filas) no lo pierda. Los seriales de antes ya quedan con contenedor 0.
 */
export async function pasarConteoAnterior(
  recepcionId: number,
  items: Array<{ id: number; cantidad_recibida: unknown; lleva_serial?: unknown }>,
  filas: FilaConteo[],
): Promise<boolean> {
  const conFila = new Set(filas.filter((f) => f.cantidad_recibida !== null).map((f) => f.item_id));
  const sueltos = items.filter(
    (i) => i.cantidad_recibida !== null && i.cantidad_recibida !== undefined && !conFila.has(Number(i.id)),
  );
  for (const i of sueltos) {
    await query(
      `INSERT INTO recepcion_packing_conteo (recepcion_id, item_id, contenedor_id, cantidad_recibida, actualizado_por)
       VALUES (?, ?, 0, ?, NULL)
       ON DUPLICATE KEY UPDATE cantidad_recibida = COALESCE(cantidad_recibida, VALUES(cantidad_recibida))`,
      [recepcionId, i.id, Number(i.cantidad_recibida)],
    );
  }
  return sueltos.length > 0;
}

/** El total del renglon = la suma de sus contenedores (NULL si ninguno se conto). */
export async function actualizarTotal(itemId: number): Promise<number | null> {
  await query(
    `UPDATE recepcion_packing_items
        SET cantidad_recibida = (
          SELECT SUM(c.cantidad_recibida) FROM recepcion_packing_conteo c WHERE c.item_id = ?
        )
      WHERE id = ?`,
    [itemId, itemId],
  );
  const r = await query("SELECT cantidad_recibida FROM recepcion_packing_items WHERE id = ?", [itemId]);
  return num((r.rows as any[])[0]?.cantidad_recibida);
}

async function filaRecibida(itemId: number, contenedorId: number): Promise<number | null> {
  const r = await query(
    "SELECT cantidad_recibida FROM recepcion_packing_conteo WHERE item_id = ? AND contenedor_id = ?",
    [itemId, contenedorId],
  );
  return num((r.rows as any[])[0]?.cantidad_recibida);
}

export type ResultadoConteo = { contenedor: number | null; total: number | null };

/**
 * En que contenedor se cuenta: el que eligio el telefono. Una recepcion sin
 * contenedores (por factura) cuenta en el 0. Se puede contar en uno que ya
 * llego, aunque se haya terminado: asi se corrige un error sin trabar el
 * cierre del packing list.
 */
export function contenedorDeConteo(
  contenedores: Array<{ id: number; numero: string; etapa: string }>,
  valor: unknown,
): { id: number } | { error: string; status: number } {
  if (contenedores.length === 0) return { id: 0 };
  const c = contenedores.find((x) => Number(x.id) === Number(valor));
  if (!c) {
    return {
      error: "Elige el contenedor que estas descargando (si la pantalla es de antes, recargala)",
      status: 400,
    };
  }
  if (c.etapa === "por_llegar") {
    return { error: `El contenedor ${c.numero} todavia no tiene la llegada registrada`, status: 409 };
  }
  return { id: Number(c.id) };
}

/** Una lectura de la pistola: +1 en ese contenedor. Atomico: dos telefonos no se pisan. */
export async function sumarUno(
  recepcionId: number,
  itemId: number,
  contenedorId: number,
  quien: string,
): Promise<ResultadoConteo> {
  await query(
    `INSERT INTO recepcion_packing_conteo (recepcion_id, item_id, contenedor_id, cantidad_recibida, actualizado_por)
     VALUES (?, ?, ?, 1, ?)
     ON DUPLICATE KEY UPDATE cantidad_recibida = COALESCE(cantidad_recibida, 0) + 1,
                             actualizado_por = VALUES(actualizado_por)`,
    [recepcionId, itemId, contenedorId, quien],
  );
  return { contenedor: await filaRecibida(itemId, contenedorId), total: await actualizarTotal(itemId) };
}

/** Cantidad escrita a mano para ese contenedor (null = todavia no se conto). */
export async function ponerCantidad(
  recepcionId: number,
  itemId: number,
  contenedorId: number,
  cantidad: number | null,
  quien: string,
): Promise<ResultadoConteo> {
  await query(
    `INSERT INTO recepcion_packing_conteo (recepcion_id, item_id, contenedor_id, cantidad_recibida, actualizado_por)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE cantidad_recibida = VALUES(cantidad_recibida),
                             actualizado_por = VALUES(actualizado_por)`,
    [recepcionId, itemId, contenedorId, cantidad, quien],
  );
  return { contenedor: cantidad, total: await actualizarTotal(itemId) };
}

/**
 * Un renglon con serial vale los seriales pistoleados: la fila del contenedor
 * es cuantos hay ahi (sin ninguno, "sin contar", salvo un 0 escrito a mano).
 */
export async function recontarSeriales(
  recepcionId: number,
  itemId: number,
  contenedorId: number,
  quien: string | null,
): Promise<ResultadoConteo> {
  const r = await query(
    "SELECT COUNT(*) AS n FROM recepcion_packing_seriales WHERE item_id = ? AND contenedor_id = ?",
    [itemId, contenedorId],
  );
  const n = Number((r.rows as any[])[0]?.n || 0);
  await query(
    `INSERT INTO recepcion_packing_conteo (recepcion_id, item_id, contenedor_id, cantidad_recibida, actualizado_por)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE cantidad_recibida = VALUES(cantidad_recibida),
                             actualizado_por = COALESCE(VALUES(actualizado_por), actualizado_por)`,
    [recepcionId, itemId, contenedorId, n > 0 ? n : null, quien],
  );
  return { contenedor: n > 0 ? n : null, total: await actualizarTotal(itemId) };
}

/** Todos los totales de la recepcion, antes de cerrarla (por si algo quedo a medias). */
export async function recalcularTotales(recepcionId: number): Promise<void> {
  await query(
    `UPDATE recepcion_packing_items i
        SET i.cantidad_recibida = (
          SELECT SUM(c.cantidad_recibida) FROM recepcion_packing_conteo c WHERE c.item_id = i.id
        )
      WHERE i.recepcion_id = ?`,
    [recepcionId],
  );
}

/**
 * Lo que el packing list dice que trae cada contenedor (cuando lo dice).
 * `reparto` va por indice del renglon y por numero de contenedor, tal como lo
 * manda Compras; los ids se buscan aca, despues de insertar.
 */
export async function guardarReparto(
  recepcionId: number,
  repartos: Array<Array<{ contenedor: string; cantidad: number }> | null>,
): Promise<void> {
  if (!repartos.some((r) => r && r.length)) return;
  await asegurarTablaConteo();
  const [items, conts] = await Promise.all([
    query("SELECT id FROM recepcion_packing_items WHERE recepcion_id = ? ORDER BY id", [recepcionId]),
    query("SELECT id, numero FROM recepcion_packing_contenedores WHERE recepcion_id = ?", [recepcionId]),
  ]);
  const ids = (items.rows as any[]).map((r) => Number(r.id));
  if (ids.length !== repartos.length) return;
  const porNumero = new Map((conts.rows as any[]).map((c) => [String(c.numero).toUpperCase(), Number(c.id)]));
  const valores: unknown[] = [];
  const marcas: string[] = [];
  repartos.forEach((reparto, n) => {
    for (const r of reparto || []) {
      const contenedorId = porNumero.get(r.contenedor.toUpperCase());
      if (!contenedorId) continue;
      valores.push(recepcionId, ids[n], contenedorId, r.cantidad);
      marcas.push("(?, ?, ?, ?)");
    }
  });
  if (!marcas.length) return;
  await query(
    `INSERT INTO recepcion_packing_conteo (recepcion_id, item_id, contenedor_id, cantidad_esperada)
     VALUES ${marcas.join(", ")}
     ON DUPLICATE KEY UPDATE cantidad_esperada = VALUES(cantidad_esperada)`,
    valores,
  );
}
