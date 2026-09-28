import { query } from "@/lib/db";
import {
  espejarEnProductoUnico,
  leerProductos,
  sincronizarEnvio,
  type EstadoProducto,
  type ProductoEnvio,
} from "@/lib/rma/items";
import { enviarCorreoActualizacion } from "@/lib/rma/emailActualizacion";
import { urlWebhookRma } from "@/lib/rma/webhook";

/**
 * Nota de crédito de RMA con aprobación del Super Admin
 * (sql/rma_nota_credito_aprobacion.sql).
 *
 *  1. RMA la solicita desde su sección Nota de Crédito: caso, producto y por
 *     qué. El producto (o el caso, si trae uno solo) pasa a "nc_revision" y
 *     al Super Admin le llega el aviso (panel + correo por n8n).
 *  2. El Super Admin la aprueba → "nota_credito", o la rechaza con un motivo
 *     → vuelve a "recibido", para que RMA lo resuelva de otra forma.
 *
 * Mientras está en revisión, el estado no se cambia a mano (lo impiden los
 * PUT del caso y del producto): solo lo mueve la decisión.
 */

export type EstadoNota = "pendiente" | "aprobada" | "rechazada";

/** Estados desde los que se puede pedir una nota de crédito: el equipo sigue en el taller. */
const SOLICITABLE: EstadoProducto[] = ["recibido", "reingresado"];

export function sePuedeSolicitar(estado: string): boolean {
  return SOLICITABLE.includes(estado as EstadoProducto);
}

/**
 * Para los PUT del caso y del producto: por qué no se puede pasar de
 * `actual` a `nuevo` a mano, o null si se puede.
 */
export function errorEstadoNotaCredito(actual: string, nuevo: string | undefined | null): string | null {
  if (!nuevo || nuevo === actual) return null;
  if (nuevo === "nota_credito" || nuevo === "nc_revision") {
    return "La nota de crédito se solicita en la sección Nota de Crédito y la aprueba el Super Admin.";
  }
  if (actual === "nc_revision") {
    return "Tiene una nota de crédito esperando al Super Admin: el estado cambia cuando la decida.";
  }
  return null;
}

export class ErrorNota extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

let hayAprobacion = false;
let hayItem = false;

/** Si ya se corrió sql/rma_nota_credito_aprobacion.sql. Se cachea solo el "sí". */
export async function hayColumnasAprobacion(): Promise<boolean> {
  if (hayAprobacion) return true;
  try {
    const r = await query("SHOW COLUMNS FROM rma_notas_credito LIKE 'estado'");
    hayAprobacion = (r.rows as any[]).length > 0;
  } catch {
    hayAprobacion = false;
  }
  return hayAprobacion;
}

/** Si ya se corrió sql/rma_notas_credito_item.sql (nota por producto, issue #331). */
export async function hayColumnaItemNota(): Promise<boolean> {
  if (hayItem) return true;
  try {
    const r = await query("SHOW COLUMNS FROM rma_notas_credito LIKE 'item_id'");
    hayItem = (r.rows as any[]).length > 0;
  } catch {
    hayItem = false;
  }
  return hayItem;
}

const FALTA_MIGRACION = "Falta correr la migración sql/rma_nota_credito_aprobacion.sql";

type Opciones = { autor: string; origenPeticion: string };

/**
 * Cambia el estado del producto (envío con varios) o del caso (con uno solo,
 * que se copia a su producto), con su historial, y recalcula el envío.
 */
async function moverEstado(
  caseId: number,
  estadoCaso: string,
  productos: ProductoEnvio[],
  producto: ProductoEnvio | null,
  nuevo: EstadoProducto,
  nota: string,
  opciones: Opciones,
): Promise<{ anterior: string; terminoReparado: boolean }> {
  if (productos.length > 1 && producto) {
    await query(`UPDATE rma_case_items SET status = ? WHERE id = ?`, [nuevo, producto.id]);
    await query(
      `INSERT INTO rma_history (case_id, item_id, from_status, to_status, changed_by, notes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [caseId, producto.id, producto.status, nuevo, opciones.autor, nota],
    );
    const envio = await sincronizarEnvio(caseId, { changedBy: opciones.autor, origenPeticion: opciones.origenPeticion });
    return {
      anterior: producto.status,
      terminoReparado: !!envio && envio.despues === "reparado" && envio.antes !== "reparado",
    };
  }

  await query(`UPDATE rma_cases SET status = ? WHERE id = ?`, [nuevo, caseId]);
  await query(
    `INSERT INTO rma_history (case_id, from_status, to_status, changed_by, notes)
     VALUES (?, ?, ?, ?, ?)`,
    [caseId, estadoCaso, nuevo, opciones.autor, nota],
  );
  await espejarEnProductoUnico(caseId, { status: nuevo });
  return { anterior: estadoCaso, terminoReparado: false };
}

function nombreProducto(p: { model?: string | null; hardware?: string | null } | null | undefined): string {
  return p?.model || p?.hardware || "";
}

export async function solicitarNotaCredito(datos: {
  caseId: number;
  itemId: number | null;
  motivo: string;
  observations: string | null;
  images: unknown;
  opciones: Opciones;
}): Promise<{ id: number }> {
  if (!(await hayColumnasAprobacion())) throw new ErrorNota(FALTA_MIGRACION, 409);
  const motivo = datos.motivo.trim();
  if (motivo.length < 10) {
    throw new ErrorNota("Explica por qué se pide la nota de crédito (al menos 10 caracteres).");
  }

  const r = await query(`SELECT * FROM rma_cases WHERE id = ?`, [datos.caseId]);
  const caso = (r.rows as any[])[0];
  if (!caso) throw new ErrorNota("Caso no encontrado", 404);
  if (Number(caso.producto_externo) === 1) {
    throw new ErrorNota("Es un equipo que Supricom no vendió: no lleva nota de crédito.");
  }

  const productos = await leerProductos(caso.id);
  const conItem = await hayColumnaItemNota();
  let producto: ProductoEnvio | null = null;
  if (productos.length > 1) {
    if (!datos.itemId) throw new ErrorNota("Elige el producto de la nota de crédito.");
    if (!conItem) throw new ErrorNota("Falta correr la migración sql/rma_notas_credito_item.sql", 409);
    producto = productos.find((p) => p.id === datos.itemId) ?? null;
    if (!producto) throw new ErrorNota("Producto no encontrado en este caso", 404);
  } else if (productos.length === 1) {
    producto = productos[0];
  }

  const estado = producto && productos.length > 1 ? producto.status : caso.status;
  if (estado === "nc_revision") {
    throw new ErrorNota("Ese producto ya tiene una nota de crédito esperando al Super Admin.", 409);
  }
  if (!sePuedeSolicitar(estado)) {
    throw new ErrorNota("Solo se pide nota de crédito de un equipo que sigue en revisión (recibido o reingresado).");
  }

  const itemId = conItem && producto ? producto.id : null;
  const images = datos.images ? JSON.stringify(datos.images) : null;
  const ins = await query(
    conItem
      ? `INSERT INTO rma_notas_credito (case_id, item_id, detail, motivo, observations, images, created_by, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pendiente')`
      : `INSERT INTO rma_notas_credito (case_id, detail, motivo, observations, images, created_by, estado)
         VALUES (?, ?, ?, ?, ?, ?, 'pendiente')`,
    [
      caso.id,
      ...(conItem ? [itemId] : []),
      (producto?.reported_fault ?? caso.reported_fault) || null,
      motivo.slice(0, 5000),
      datos.observations?.trim().slice(0, 5000) || null,
      images,
      datos.opciones.autor,
    ],
  );
  const id = Number((ins.rows as any).insertId);

  await moverEstado(caso.id, caso.status, productos, producto, "nc_revision", `Nota de crédito solicitada: ${motivo}`.slice(0, 1000), datos.opciones);

  avisarSuperAdmins(id, datos.opciones.origenPeticion);
  return { id };
}

export async function decidirNotaCredito(datos: {
  id: number;
  aprobar: boolean;
  motivoRechazo: string | null;
  opciones: Opciones;
}): Promise<void> {
  if (!(await hayColumnasAprobacion())) throw new ErrorNota(FALTA_MIGRACION, 409);
  const motivoRechazo = datos.motivoRechazo?.trim() || "";
  if (!datos.aprobar && motivoRechazo.length < 5) {
    throw new ErrorNota("Escribe por qué se rechaza, para que RMA sepa qué hacer.");
  }

  const r = await query(`SELECT * FROM rma_notas_credito WHERE id = ?`, [datos.id]);
  const nota = (r.rows as any[])[0];
  if (!nota) throw new ErrorNota("Solicitud no encontrada", 404);

  // `AND estado = 'pendiente'`: si dos personas deciden a la vez, gana la
  // primera y la otra recibe el aviso de abajo.
  const upd = await query(
    `UPDATE rma_notas_credito
        SET estado = ?, decidido_por = ?, decidido_at = NOW(), motivo_rechazo = ?
      WHERE id = ? AND estado = 'pendiente'`,
    [datos.aprobar ? "aprobada" : "rechazada", datos.opciones.autor, datos.aprobar ? null : motivoRechazo.slice(0, 5000), nota.id],
  );
  if (!Number((upd.rows as any).affectedRows)) {
    throw new ErrorNota("Esta solicitud ya fue decidida.", 409);
  }

  const c = await query(`SELECT id, status, model, hardware FROM rma_cases WHERE id = ?`, [nota.case_id]);
  const caso = (c.rows as any[])[0];
  if (!caso) return;
  const productos = await leerProductos(caso.id);
  const producto =
    (nota.item_id ? productos.find((p) => p.id === Number(nota.item_id)) : null) ??
    (productos.length === 1 ? productos[0] : null);

  // Solo se mueve si sigue esperando la decisión (no se tocó por otro lado).
  const estado = producto && productos.length > 1 ? producto.status : caso.status;
  if (estado !== "nc_revision") return;

  const nuevo: EstadoProducto = datos.aprobar ? "nota_credito" : "recibido";
  const { anterior, terminoReparado } = await moverEstado(
    caso.id,
    caso.status,
    productos,
    producto,
    nuevo,
    datos.aprobar ? "Nota de crédito aprobada por el Super Admin" : `Nota de crédito rechazada: ${motivoRechazo}`.slice(0, 1000),
    datos.opciones,
  );

  // Al cliente solo le llega la aprobación: el rechazo es interno, su equipo
  // sigue en revisión como antes.
  if (datos.aprobar && !terminoReparado) {
    enviarCorreoActualizacion(
      caso.id,
      {
        producto: nombreProducto(producto ?? caso),
        estado_anterior: anterior,
        estado_nuevo: nuevo,
        tipo: "estado",
      },
      datos.opciones.origenPeticion,
    );
  }
}

/** Una solicitud con su caso y producto, o null. */
export async function obtenerNota(id: number): Promise<any | null> {
  return (await listarNotas(null, 1, id))[0] ?? null;
}

/** Solicitudes con los datos del caso y del producto, las más nuevas primero. */
export async function listarNotas(estado: EstadoNota | null, limite = 200, id?: number): Promise<any[]> {
  if (!(await hayColumnasAprobacion())) return [];
  const conItem = await hayColumnaItemNota();
  const r = await query(
    `SELECT nc.id, nc.case_id, ${conItem ? "nc.item_id" : "NULL AS item_id"}, nc.estado, nc.motivo, nc.detail,
            nc.observations, nc.images, nc.created_by, nc.created_at, nc.decidido_por, nc.decidido_at,
            nc.motivo_rechazo,
            c.case_number, c.client_name, c.invoice_number, c.company_id,
            ${
              conItem
                ? `COALESCE(i.hardware, c.hardware) AS hardware, COALESCE(i.brand, c.brand) AS brand,
                   COALESCE(i.model, c.model) AS model, COALESCE(i.serial, c.serial_quantity) AS serial,
                   COALESCE(i.reported_fault, c.reported_fault) AS reported_fault,
                   COALESCE(i.diagnosis, c.diagnosis) AS diagnosis`
                : `c.hardware, c.brand, c.model, c.serial_quantity AS serial, c.reported_fault, c.diagnosis`
            }
       FROM rma_notas_credito nc
       JOIN rma_cases c ON c.id = nc.case_id
       ${conItem ? "LEFT JOIN rma_case_items i ON i.id = nc.item_id" : ""}
      WHERE 1=1${estado ? " AND nc.estado = ?" : ""}${id ? " AND nc.id = ?" : ""}
      ORDER BY nc.created_at DESC, nc.id DESC
      LIMIT ${Math.max(1, Math.min(500, limite))}`,
    [...(estado ? [estado] : []), ...(id ? [id] : [])],
  );
  return (r.rows as any[]).map((n) => ({
    ...n,
    images: typeof n.images === "string" ? safeJson(n.images) : n.images || [],
  }));
}

export async function contarPendientes(): Promise<number> {
  if (!(await hayColumnasAprobacion())) return 0;
  const r = await query(`SELECT COUNT(*) AS n FROM rma_notas_credito WHERE estado = 'pendiente'`);
  return Number((r.rows as any[])[0]?.n) || 0;
}

function safeJson(s: string): any[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/**
 * Correo a cada Super Admin activo: "RMA pide una nota de crédito". Mismo
 * webhook de n8n que los correos al cliente (`evento` propio,
 * `rma_nc_solicitada`), fire-and-forget: si falla, la solicitud igual queda
 * en el panel.
 */
function avisarSuperAdmins(notaId: number, origenPeticion: string): void {
  procesarAviso(notaId, origenPeticion).catch((e) => {
    console.error(`[rma/notaCredito] aviso de la solicitud ${notaId}:`, e?.message);
  });
}

async function procesarAviso(notaId: number, origenPeticion: string): Promise<void> {
  const url = urlWebhookRma();
  if (!url) return;
  const nota = await obtenerNota(notaId);
  if (!nota) return;

  const admins = await query(
    `SELECT uc.email, uc.name
       FROM users_config uc
       JOIN roles r ON uc.role_id = r.id
      WHERE LOWER(TRIM(r.name)) = 'superadmin' AND COALESCE(uc.is_active, 1) = 1`,
  );
  const destinatarios = (admins.rows as any[]).filter((a) => a.email);
  if (!destinatarios.length) {
    console.warn("[rma/notaCredito] no hay Super Admin activo con correo: la solicitud solo queda en el panel");
    return;
  }

  const link = `${origenPeticion.replace(/\/+$/, "")}/es/superadmin/rma-notas-credito`;
  for (const admin of destinatarios) {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        evento: "rma_nc_solicitada",
        correo: {
          destinatario: admin.email,
          nombre_cliente: admin.name || "",
          case_number: nota.case_number,
          cliente: nota.client_name || "",
          factura: nota.invoice_number || "",
          producto: nombreProducto(nota),
          serial: nota.serial || null,
          motivo: nota.motivo || "",
          solicitado_por: nota.created_by || "",
          link_aprobacion: link,
        },
      }),
    });
  }
}
