import { query } from "@/lib/db";

/**
 * Productos de un envío de servicio técnico (tabla `rma_case_items`, issue
 * #331). Un caso de `rma_cases` es el envío del cliente; cada producto que
 * trae tiene su falla, su estado y su diagnóstico, porque RMA los repara de a
 * uno.
 *
 * Mientras el panel se adapta, los campos de producto de `rma_cases` siguen
 * siendo los del primer producto. Por eso, cuando un caso tiene UN solo
 * producto, lo que se edite en el caso se copia a ese producto
 * (`espejarEnProductoUnico`); con varios, cada producto se edita aparte.
 *
 * Todo degrada si todavía no se corrió sql/rma_case_items.sql: sin la tabla
 * no se lee ni se escribe nada, y el caso funciona como hasta ahora. La
 * conversión de esa migración crea después el producto de los casos que se
 * hayan abierto mientras tanto.
 */

export type EstadoProducto = "recibido" | "reparado" | "nota_credito" | "no_procesado" | "reingresado";

export type ProductoEnvio = {
  id: number;
  case_id: number;
  orden: number;
  product_code: string | null;
  hardware: string | null;
  brand: string | null;
  model: string | null;
  serial: string | null;
  odoo_product_id: number | null;
  reported_fault: string | null;
  status: EstadoProducto;
  diagnosis: string | null;
  notes: string | null;
  garantia_estado: string | null;
  garantia_meses: number | null;
  garantia_vence: string | null;
  garantia_marca: string | null;
  despachado_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ProductoNuevo = {
  orden?: number;
  product_code?: string | null;
  hardware?: string | null;
  brand?: string | null;
  model?: string | null;
  serial?: string | null;
  odoo_product_id?: number | null;
  reported_fault?: string | null;
  garantia_estado?: string | null;
  garantia_meses?: number | null;
  garantia_vence?: string | null;
  garantia_marca?: string | null;
};

/**
 * Para escribir dentro de la conexión de quien llama (el portal crea el caso
 * en una conexión dedicada). Sin ella, el pool normal.
 */
type Ejecutor = { execute: (sql: string, params?: any[]) => Promise<any> };

async function ejecutar(conn: Ejecutor | undefined, sql: string, params: any[]): Promise<any> {
  if (conn) {
    const [r] = await conn.execute(sql, params);
    return r;
  }
  return (await query(sql, params)).rows;
}

let hayTabla = false;

/**
 * Si ya se corrió sql/rma_case_items.sql. Se cachea solo el "sí": si falta, se
 * vuelve a mirar en la próxima llamada, así no hay que reiniciar el servidor
 * después de correr la migración.
 */
export async function hayTablaProductos(): Promise<boolean> {
  if (hayTabla) return true;
  try {
    const r = await query("SHOW TABLES LIKE 'rma_case_items'");
    hayTabla = (r.rows as any[]).length > 0;
  } catch {
    hayTabla = false;
  }
  return hayTabla;
}

/** Los productos del envío, en el orden en que se cargaron. [] sin la tabla. */
export async function leerProductos(caseId: number): Promise<ProductoEnvio[]> {
  if (!(await hayTablaProductos())) return [];
  const r = await query(
    `SELECT * FROM rma_case_items WHERE case_id = ? ORDER BY orden ASC, id ASC`,
    [caseId],
  );
  return r.rows as ProductoEnvio[];
}

/**
 * Da de alta los productos de un envío recién creado y devuelve sus ids, en el
 * mismo orden. No hace nada sin la tabla ([]). Si falla, se loguea y se sigue
 * con los que se hayan creado: el caso ya quedó creado con los datos del
 * primer producto, y la conversión de la migración lo puede rehacer.
 */
export async function crearProductos(
  caseId: number,
  productos: ProductoNuevo[],
  conn?: Ejecutor,
): Promise<number[]> {
  const ids: number[] = [];
  if (!productos.length || !(await hayTablaProductos())) return ids;
  try {
    for (const [i, p] of productos.entries()) {
      const r = await ejecutar(
        conn,
        `INSERT INTO rma_case_items (
           case_id, orden, product_code, hardware, brand, model, serial,
           odoo_product_id, reported_fault, status,
           garantia_estado, garantia_meses, garantia_vence, garantia_marca
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'recibido', ?, ?, ?, ?)`,
        [
          caseId,
          p.orden ?? i + 1,
          p.product_code ?? null,
          p.hardware ?? null,
          p.brand ?? null,
          p.model ?? null,
          p.serial ?? null,
          p.odoo_product_id ?? null,
          p.reported_fault ?? null,
          p.garantia_estado ?? null,
          p.garantia_meses ?? null,
          p.garantia_vence ?? null,
          p.garantia_marca ?? null,
        ],
      );
      if (r?.insertId) ids.push(r.insertId);
    }
  } catch (e: any) {
    console.error(`[rma_case_items] no se pudieron crear los productos del caso ${caseId}:`, e?.message);
  }
  return ids;
}

/**
 * Lo que el cliente puede ver de cada producto en la consulta pública: sin
 * diagnóstico ni notas, que son internos. [] sin la tabla o si falla.
 */
export async function productosPublicos(
  caseId: number,
): Promise<{ nombre: string; serial: string | null; status: EstadoProducto }[]> {
  try {
    return (await leerProductos(caseId)).map((p) => ({
      nombre: p.model || p.hardware || "",
      serial: p.serial || null,
      status: p.status,
    }));
  } catch (e: any) {
    console.error(`[rma_case_items] no se pudieron leer los productos del caso ${caseId}:`, e?.message);
    return [];
  }
}

/** Campos del caso que son en realidad del producto, con su columna en items. */
const CAMPOS_ESPEJO: Record<string, string> = {
  product_code: "product_code",
  hardware: "hardware",
  brand: "brand",
  model: "model",
  serial_quantity: "serial",
  reported_fault: "reported_fault",
  status: "status",
  diagnosis: "diagnosis",
  notes: "notes",
};

/**
 * Copia al producto lo que se editó en el caso, SOLO si el envío tiene un
 * único producto (con varios, el caso no dice a cuál le toca). `cambios` usa
 * los nombres de las columnas de rma_cases; lo que no sea de producto se
 * ignora. Nunca rompe la edición del caso: si falla, se loguea.
 */
export async function espejarEnProductoUnico(
  caseId: number,
  cambios: Record<string, unknown>,
): Promise<void> {
  const sets: string[] = [];
  const valores: unknown[] = [];
  for (const [campo, valor] of Object.entries(cambios)) {
    const columna = CAMPOS_ESPEJO[campo];
    if (!columna || valor === undefined) continue;
    sets.push(`${columna} = ?`);
    valores.push(valor);
  }
  if (!sets.length || !(await hayTablaProductos())) return;
  try {
    // Contar aparte y no con un subquery en el mismo UPDATE: MySQL no deja
    // leer la tabla que se está actualizando (#1093).
    const r = await query(`SELECT COUNT(*) AS n FROM rma_case_items WHERE case_id = ?`, [caseId]);
    if (Number((r.rows as any[])[0]?.n) !== 1) return;
    await query(`UPDATE rma_case_items SET ${sets.join(", ")} WHERE case_id = ?`, [...valores, caseId]);
  } catch (e: any) {
    console.error(`[rma_case_items] no se pudo copiar la edición del caso ${caseId}:`, e?.message);
  }
}

/**
 * El envío salió entero (Seguridad lo despachó, o RMA subió la guía / lo
 * marcó entregado): todos sus productos que no habían salido salen con esa
 * fecha. Mismo criterio `IS NULL` que en rma_cases, para no mover la fecha de
 * una entrega anterior.
 */
export async function marcarProductosDespachados(caseId: number, fecha?: string | Date): Promise<void> {
  if (!(await hayTablaProductos())) return;
  try {
    await query(
      `UPDATE rma_case_items SET despachado_at = ${fecha ? "?" : "CURDATE()"}
        WHERE case_id = ? AND despachado_at IS NULL`,
      fecha ? [fecha, caseId] : [caseId],
    );
  } catch (e: any) {
    console.error(`[rma_case_items] no se pudo marcar el despacho del caso ${caseId}:`, e?.message);
  }
}

/** Deshace el despacho de todos los productos (el `reset_entrega` del caso). */
export async function limpiarDespachoProductos(caseId: number): Promise<void> {
  if (!(await hayTablaProductos())) return;
  try {
    await query(`UPDATE rma_case_items SET despachado_at = NULL WHERE case_id = ?`, [caseId]);
  } catch (e: any) {
    console.error(`[rma_case_items] no se pudo deshacer el despacho del caso ${caseId}:`, e?.message);
  }
}
