import { query } from "@/lib/db";
import { enviarCorreoReparado } from "@/lib/rma/emailReparado";

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

export type EstadoProducto =
  | "recibido"
  | "reparado"
  | "nota_credito"
  | "no_procesado"
  | "reingresado"
  // Nota de crédito solicitada, esperando al Super Admin (sql/rma_nota_credito_aprobacion.sql).
  | "nc_revision";

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
 * Productos que salen del taller. Sin `itemIds`, el envío entero (Seguridad lo
 * despachó completo, o RMA subió la guía / lo marcó entregado); con ellos,
 * una devolución parcial. Mismo criterio `IS NULL` que en rma_cases, para no
 * mover la fecha de una entrega anterior.
 */
export async function marcarProductosDespachados(
  caseId: number,
  fecha?: string | Date,
  itemIds?: number[],
): Promise<void> {
  if (!(await hayTablaProductos())) return;
  if (itemIds && !itemIds.length) return;
  try {
    const filtro = itemIds ? ` AND id IN (${itemIds.map(() => "?").join(",")})` : "";
    await query(
      `UPDATE rma_case_items SET despachado_at = ${fecha ? "?" : "CURDATE()"}
        WHERE case_id = ? AND despachado_at IS NULL${filtro}`,
      [...(fecha ? [fecha] : []), caseId, ...(itemIds ?? [])],
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

/**
 * Estados en los que el producto sigue en el taller sin resolver: esperando a
 * RMA, o a que el Super Admin decida la nota de crédito.
 */
const PENDIENTES: EstadoProducto[] = ["recibido", "reingresado", "nc_revision"];

export function productoPendiente(estado: EstadoProducto): boolean {
  return PENDIENTES.includes(estado);
}

/**
 * Estado general del envío a partir de sus productos, para la lista, los
 * filtros y la consulta del cliente:
 *  - mientras quede alguno por atender, "reingresado" si alguno volvió,
 *    "recibido" si queda alguno por revisar, y "nc_revision" si lo único que
 *    falta es la decisión de notas de crédito;
 *  - cuando todos terminaron, "reparado" si se reparó al menos uno (hay algo
 *    que devolverle al cliente arreglado), si no "nota_credito" si hubo
 *    alguna, y si no "no_procesado".
 */
export function estadoDelEnvio(estados: EstadoProducto[]): EstadoProducto {
  if (!estados.length) return "recibido";
  if (estados.some(productoPendiente)) {
    if (estados.includes("reingresado")) return "reingresado";
    return estados.includes("recibido") ? "recibido" : "nc_revision";
  }
  if (estados.includes("reparado")) return "reparado";
  if (estados.includes("nota_credito")) return "nota_credito";
  return "no_procesado";
}

/**
 * Recalcula el caso a partir de sus productos después de tocar uno:
 *  - `status` = estadoDelEnvio(...). Si cambia, queda en el historial del
 *    caso (sin item_id) y, si el envío terminó reparado, sale el correo al
 *    cliente con el resultado de cada producto (uno solo, al terminar).
 *  - `despachado_at` del caso = cuando salió el último producto; mientras
 *    quede alguno en el taller, vacío.
 * Con un solo producto el caso ya lo actualiza su propio PUT: esto no hace
 * nada nuevo, pero tampoco molesta.
 */
export async function sincronizarEnvio(
  caseId: number,
  opciones: { changedBy: string; origenPeticion: string },
): Promise<{ antes: EstadoProducto; despues: EstadoProducto } | null> {
  const productos = await leerProductos(caseId);
  if (!productos.length) return null;

  const r = await query(
    `SELECT id, case_number, status, origen, company_id, odoo_partner_id, tracking_token,
            model, hardware, client_name, despachado_at
       FROM rma_cases WHERE id = ?`,
    [caseId],
  );
  const caso = (r.rows as any[])[0];
  if (!caso) return null;

  const antes = caso.status as EstadoProducto;
  const despues = estadoDelEnvio(productos.map((p) => p.status));

  if (despues !== antes) {
    await query(`UPDATE rma_cases SET status = ? WHERE id = ?`, [despues, caseId]);
    await query(
      `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [
        caseId,
        antes,
        despues,
        opciones.changedBy,
        productoPendiente(despues) ? "Estado del envío" : "Envío terminado: todos sus productos fueron atendidos",
      ],
    );
    if (despues === "reparado" && productoPendiente(antes)) {
      enviarCorreoReparado(
        {
          id: caso.id,
          case_number: caso.case_number,
          origen: caso.origen,
          company_id: caso.company_id,
          odoo_partner_id: caso.odoo_partner_id,
          tracking_token: caso.tracking_token,
          model: caso.model,
          hardware: caso.hardware,
          client_name: caso.client_name,
          productos: productos.map((p) => ({
            producto: p.model || p.hardware || "",
            serial: p.serial,
            estado: p.status,
          })),
        },
        opciones.origenPeticion,
      );
    }
  }

  // Fecha de entrega del envío: la del último producto que salió.
  const salieron = productos.filter((p) => p.despachado_at);
  if (salieron.length === productos.length) {
    if (!caso.despachado_at) {
      const ultima = salieron
        .map((p) => fechaSQL(p.despachado_at))
        .sort()
        .pop();
      await query(`UPDATE rma_cases SET despachado_at = ? WHERE id = ? AND despachado_at IS NULL`, [ultima, caseId]);
    }
  } else if (caso.despachado_at) {
    await query(`UPDATE rma_cases SET despachado_at = NULL WHERE id = ?`, [caseId]);
  }

  return { antes, despues };
}

/** YYYY-MM-DD de una columna DATE (mysql2 la devuelve como Date en UTC). */
function fechaSQL(valor: unknown): string {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  return String(valor).slice(0, 10);
}

/**
 * Los campos de producto del caso son los del primer producto del envío
 * (paso 1 de #331): la lista, la búsqueda, Seguridad y los correos de siempre
 * los leen de ahí. Se vuelven a copiar después de editar o quitar productos.
 * La falla solo con un producto: con varios, la del caso junta la de todos.
 */
export async function espejarPrimeroEnCaso(caseId: number): Promise<void> {
  const productos = await leerProductos(caseId);
  const primero = productos[0];
  if (!primero) return;
  const conFalla = productos.length === 1;
  await query(
    `UPDATE rma_cases SET product_code = ?, hardware = ?, brand = ?, model = ?,
            serial_quantity = ?, diagnosis = ?, notes = ?${conFalla ? ", reported_fault = COALESCE(?, reported_fault)" : ""}
      WHERE id = ?`,
    [
      primero.product_code,
      primero.hardware,
      primero.brand,
      primero.model,
      primero.serial,
      primero.diagnosis,
      primero.notes,
      ...(conFalla ? [primero.reported_fault] : []),
      caseId,
    ],
  );
}

/**
 * Nombre del envío para mostrarle al cliente o en un aviso: con varios
 * productos, todos ("Laptop X, Impresora Y"); con uno, el de siempre
 * (`fallback`, los campos del caso). No falla: ante un error, `fallback`.
 */
export async function nombreDelEnvio(caseId: number, fallback: string): Promise<string> {
  try {
    const productos = await leerProductos(caseId);
    if (productos.length > 1) return productos.map((p) => p.model || p.hardware || "").join(", ");
  } catch (e: any) {
    console.error(`[rma_case_items] no se pudo leer el envío ${caseId}:`, e?.message);
  }
  return fallback;
}
