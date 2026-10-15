import { query } from "@/lib/db";
import { avisarNC } from "@/lib/notas-credito/aviso";
import { ensureTablas, esSuperadmin, normCorreo, pasosDe, registrarEvento, sedeConFlujo, tienePaso } from "@/lib/notas-credito/datos";
import {
  candidatasOdoo,
  crearBorradorOdoo,
  estadosNotasOdoo,
  guardarBorradorOdoo,
  leerFactura,
  leerNotaOdoo,
  montoDeUnaUnidad,
  notaEnChatter,
  publicarOdoo,
  type FacturaOdoo,
} from "@/lib/notas-credito/odoo";
import { moverEstadoRma } from "@/lib/notas-credito/rma";
import {
  estadoInicial,
  formatoMonto,
  type AccionNC,
  type BorradorNC,
  type CandidataNC,
  type EstadoNC,
  type PasoNC,
  type SolicitudNC,
} from "@/lib/notas-credito/tipos";
import type { EstadoProducto } from "@/lib/rma/items";

/**
 * Solicitudes de nota de crédito y su paso por el flujo (lib/notas-credito/tipos.ts).
 * Cada cambio de estado es un UPDATE con el estado anterior en el WHERE: si
 * dos personas (o un doble clic) deciden a la vez, solo una gana.
 */

export class ErrorNC extends Error {
  constructor(
    message: string,
    public status = 400,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export type Autor = { nombre: string; email: string; rol: string };

export function autorDeSesion(payload: any): Autor {
  return {
    nombre: String(payload?.name || payload?.email || "Usuario"),
    email: normCorreo(payload?.email),
    rol: String(payload?.role || ""),
  };
}

const NUM = ["monto", "total_factura", "odoo_total"] as const;

function fila(f: any): SolicitudNC & { created_ts: number } {
  const s = { ...f };
  for (const k of NUM) s[k] = s[k] == null ? null : Number(s[k]);
  s.created_ts = Number(f.created_ts) || 0;
  return s;
}

async function leer(where: string, params: unknown[], limite = 300): Promise<(SolicitudNC & { created_ts: number })[]> {
  await ensureTablas();
  const r = await query(
    `SELECT s.*, UNIX_TIMESTAMP(s.created_at) AS created_ts FROM nc_solicitudes s
      WHERE ${where} ORDER BY s.id DESC LIMIT ${Math.max(1, Math.min(500, limite))}`,
    params,
  );
  return (r.rows as any[]).map(fila);
}

export async function obtener(id: number) {
  return (await leer("s.id = ?", [id], 1))[0] ?? null;
}

/** Solicitudes de las sedes indicadas (null = todas). */
export async function listar(sedes: number[] | null, estado?: EstadoNC | null) {
  const cond: string[] = ["1=1"];
  const params: unknown[] = [];
  if (sedes) {
    if (!sedes.length) return [];
    cond.push(`s.company_id IN (${sedes.map(() => "?").join(",")})`);
    params.push(...sedes);
  }
  if (estado) {
    cond.push("s.estado = ?");
    params.push(estado);
  }
  return leer(cond.join(" AND "), params);
}

/** Lo que queda por acreditar de la factura, sin contar la solicitud `excluir`. */
async function disponible(f: FacturaOdoo, excluir: number | null): Promise<number> {
  await ensureTablas();
  const r = await query(
    `SELECT COALESCE(SUM(monto), 0) AS n FROM nc_solicitudes
      WHERE factura_id = ? AND estado IN ('por_preaprobar','por_aprobar','aprobada')
        AND (odoo_estado IS NULL OR odoo_estado <> 'posted')${excluir ? " AND id <> ?" : ""}`,
    excluir ? [f.id, excluir] : [f.id],
  );
  const reservado = Number((r.rows as any[])[0]?.n) || 0;
  return Math.round((f.total - f.acreditado - reservado) * 100) / 100;
}

function validarMonto(monto: unknown): number {
  const n = Math.round(Number(monto) * 100) / 100;
  if (!Number.isFinite(n) || n <= 0) throw new ErrorNC("Indica el monto de la nota de crédito (mayor que cero).");
  return n;
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------

/**
 * Solicitud de RMA (equipo que no se puede reparar) de una sede con flujo.
 * La llama solicitarNotaCredito (lib/rma/notaCredito.ts) después de guardar
 * la de rma_notas_credito. Busca la factura del caso en Odoo para tener el
 * monto (1 unidad del producto); si no la encuentra, se asigna después.
 */
export async function crearDesdeRma(datos: {
  rmaNotaId: number;
  companyId: number;
  caseId: number;
  itemId: number | null;
  caseNumber: string;
  producto: string;
  serial: string | null;
  odooProductId: number | null;
  numeroFactura: string | null;
  clienteRma: string | null;
  estadoRma: EstadoProducto;
  motivo: string;
  autor: Autor;
  origenPeticion: string;
}): Promise<number> {
  await ensureTablas();
  let factura: FacturaOdoo | null = null;
  try {
    factura = await leerFactura(datos.companyId, { numero: datos.numeroFactura });
  } catch (e: any) {
    console.error(`[notas-credito] factura ${datos.numeroFactura} del caso ${datos.caseNumber}:`, e?.message);
  }
  const monto = factura ? montoDeUnaUnidad(factura, datos.odooProductId) : null;

  const ins = await query(
    `INSERT INTO nc_solicitudes
       (company_id, origen, rma_nota_id, case_id, item_id, case_number, producto, serial, estado, estado_rma_previo,
        factura_id, factura_nombre, partner_id, cliente, moneda, monto, total_factura, odoo_product_id,
        motivo, creado_por, creado_email)
     VALUES (?, 'rma', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.companyId, datos.rmaNotaId, datos.caseId, datos.itemId, datos.caseNumber, datos.producto.slice(0, 500),
      datos.serial?.slice(0, 200) || null, estadoInicial("rma"), datos.estadoRma,
      factura?.id ?? null, factura?.nombre ?? datos.numeroFactura?.slice(0, 100) ?? null, factura?.partner_id ?? null,
      (factura?.cliente || datos.clienteRma || "").slice(0, 255) || null, factura?.moneda ?? null, monto, factura?.total ?? null,
      datos.odooProductId, datos.motivo.slice(0, 5000), datos.autor.nombre, datos.autor.email || null,
    ],
  );
  const id = Number((ins.rows as any).insertId);
  await registrarEvento(id, "solicitada", datos.autor, datos.motivo);
  if (!factura) {
    await registrarEvento(id, "aviso", { nombre: "Panel" }, `No se encontró en Odoo la factura "${datos.numeroFactura || ""}" del caso: hay que asignarla.`);
  }

  try {
    await moverEstadoRma({
      caseId: datos.caseId,
      itemId: datos.itemId,
      nuevo: "nc_revision",
      por: datos.autor.nombre,
      nota: `Nota de crédito NC-${id} solicitada: pasa a preaprobación. ${datos.motivo}`,
      origenPeticion: datos.origenPeticion,
    });
  } catch (e: any) {
    console.error(`[notas-credito] estado del caso ${datos.caseNumber} (NC-${id}):`, e?.message);
  }

  const sol = await obtener(id);
  if (sol) avisarNC("preaprobar", sol, datos.origenPeticion);
  return id;
}

/**
 * Nota de crédito que no viene de RMA: la crea quien procesa (o el
 * SuperAdmin) y sigue el mismo camino que una de RMA: preaprueba IT, aprueba
 * quien aprueba. Quien preaprueba (IT) solo preaprueba o rechaza: no crea.
 */
export async function crearDirecta(datos: {
  companyId: number;
  facturaId: number;
  monto: unknown;
  motivo: string;
  autor: Autor;
  origenPeticion: string;
}): Promise<number> {
  if (!esSuperadmin(datos.autor.rol) && !(await tienePaso(datos.autor.email, datos.companyId, "procesa"))) {
    throw new ErrorNC("Solo quien hace la nota en esta sede (o el SuperAdmin) crea notas de crédito.", 403);
  }
  if (!(await sedeConFlujo(datos.companyId))) {
    throw new ErrorNC("A esta sede le falta alguien en aprobar o en hacer la nota: el SuperAdmin lo completa en Responsables.", 409);
  }
  const motivo = datos.motivo.trim();
  if (motivo.length < 10) throw new ErrorNC("Explica el motivo de la nota de crédito (al menos 10 caracteres).");
  const monto = validarMonto(datos.monto);
  const factura = await leerFactura(datos.companyId, { id: datos.facturaId });
  if (!factura) throw new ErrorNC("No se encontró la factura publicada en Odoo para esta sede.", 404);
  const libre = await disponible(factura, null);
  if (monto > libre + 0.01) {
    throw new ErrorNC(`El monto supera lo que queda por acreditar de la factura ${factura.nombre} (${formatoMonto(libre, factura.moneda)}).`);
  }

  await ensureTablas();
  const ins = await query(
    `INSERT INTO nc_solicitudes
       (company_id, origen, estado, factura_id, factura_nombre, partner_id, cliente, moneda, monto, total_factura,
        motivo, creado_por, creado_email)
     VALUES (?, 'directa', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.companyId, estadoInicial("directa"), factura.id, factura.nombre, factura.partner_id, factura.cliente.slice(0, 255),
      factura.moneda, monto, factura.total, motivo.slice(0, 5000), datos.autor.nombre, datos.autor.email || null,
    ],
  );
  const id = Number((ins.rows as any).insertId);
  await registrarEvento(id, "creada", datos.autor, motivo);
  const sol = await obtener(id);
  if (sol) avisarNC("preaprobar", sol, datos.origenPeticion);
  return id;
}

// ---------------------------------------------------------------------------
// Pasos
// ---------------------------------------------------------------------------

async function exigirPaso(sol: SolicitudNC, autor: Autor, ...pasos: PasoNC[]): Promise<void> {
  for (const p of pasos) if (await tienePaso(autor.email, sol.company_id, p)) return;
  throw new ErrorNC("Esta nota de crédito no está en tus manos.", 403);
}

/** UPDATE solo si sigue en `desde`. */
async function transicion(id: number, desde: EstadoNC[], sets: string, params: unknown[]): Promise<void> {
  const r = await query(
    `UPDATE nc_solicitudes SET ${sets} WHERE id = ? AND estado IN (${desde.map(() => "?").join(",")})`,
    [...params, id, ...desde],
  );
  if (!Number((r.rows as any).affectedRows)) {
    throw new ErrorNC("Alguien ya movió esta nota de crédito. Recarga la pantalla.", 409);
  }
}

async function decisionRma(sol: SolicitudNC, estado: "aprobada" | "rechazada", autor: Autor, motivoRechazo: string | null) {
  if (!sol.rma_nota_id) return;
  try {
    await query(
      `UPDATE rma_notas_credito SET estado = ?, decidido_por = ?, decidido_at = NOW(), motivo_rechazo = ? WHERE id = ?`,
      [estado, autor.nombre, motivoRechazo, sol.rma_nota_id],
    );
  } catch (e: any) {
    console.error(`[notas-credito] rma_notas_credito ${sol.rma_nota_id}:`, e?.message);
  }
}

async function preaprobar(sol: SolicitudNC, autor: Autor, nota: string, origen: string) {
  await exigirPaso(sol, autor, "preaprueba");
  await transicion(sol.id, ["por_preaprobar"], "estado = 'por_aprobar', preaprobado_por = ?, preaprobado_at = NOW()", [autor.nombre]);
  await registrarEvento(sol.id, "preaprobada", autor, nota || null);
  const nueva = await obtener(sol.id);
  if (nueva) avisarNC("aprobar", nueva, origen);
}

async function aprobar(sol: SolicitudNC, autor: Autor, nota: string, origen: string) {
  await exigirPaso(sol, autor, "aprueba");
  await transicion(sol.id, ["por_aprobar"], "estado = 'aprobada', aprobado_por = ?, aprobado_at = NOW()", [autor.nombre]);
  await registrarEvento(sol.id, "aprobada", autor, nota || null);
  if (sol.origen === "rma" && sol.case_id) {
    await decisionRma(sol, "aprobada", autor, null);
    try {
      await moverEstadoRma({
        caseId: sol.case_id,
        itemId: sol.item_id,
        nuevo: "nota_credito",
        por: autor.nombre,
        nota: `Nota de crédito NC-${sol.id} aprobada${nota ? `: ${nota}` : ""}`,
        origenPeticion: origen,
      });
    } catch (e: any) {
      console.error(`[notas-credito] estado del caso de NC-${sol.id}:`, e?.message);
    }
  }
  const nueva = await obtener(sol.id);
  if (nueva) avisarNC("procesar", nueva, origen);
}

async function rechazar(sol: SolicitudNC, autor: Autor, motivo: string, origen: string) {
  const paso: PasoNC = sol.estado === "por_preaprobar" ? "preaprueba" : "aprueba";
  if (sol.estado !== "por_preaprobar" && sol.estado !== "por_aprobar") {
    throw new ErrorNC("Solo se rechaza mientras espera preaprobación o aprobación.", 409);
  }
  await exigirPaso(sol, autor, paso);
  if (motivo.trim().length < 5) throw new ErrorNC("Explica por qué se rechaza.");
  await transicion(
    sol.id,
    [sol.estado],
    "estado = 'rechazada', rechazado_por = ?, rechazado_at = NOW(), rechazado_paso = ?, motivo_rechazo = ?",
    [autor.nombre, paso, motivo.trim().slice(0, 5000)],
  );
  await registrarEvento(sol.id, "rechazada", autor, motivo);
  if (sol.origen === "rma" && sol.case_id) {
    await decisionRma(sol, "rechazada", autor, motivo.trim().slice(0, 5000));
    try {
      await moverEstadoRma({
        caseId: sol.case_id,
        itemId: sol.item_id,
        nuevo: (sol.estado_rma_previo as EstadoProducto) || "en_diagnostico",
        por: autor.nombre,
        nota: `Nota de crédito NC-${sol.id} rechazada: ${motivo.trim()}`,
        origenPeticion: origen,
      });
    } catch (e: any) {
      console.error(`[notas-credito] estado del caso de NC-${sol.id}:`, e?.message);
    }
  }
  const nueva = await obtener(sol.id);
  if (nueva) avisarNC("rechazada", nueva, origen);
}

/** Asigna (o corrige) la factura de Odoo. En una de RMA el monto sale de la factura; en una directa se manda. */
async function asignarFactura(sol: SolicitudNC, autor: Autor, body: any) {
  // La factura la pone o corrige quien hace la nota; IT solo preaprueba.
  await exigirPaso(sol, autor, "procesa");
  if (!["por_preaprobar", "por_aprobar", "aprobada"].includes(sol.estado) || sol.odoo_move_id) {
    throw new ErrorNC("La factura ya no se cambia: la nota de crédito ya está en Odoo o terminó.", 409);
  }
  const factura = await leerFactura(sol.company_id, { id: Number(body.factura_id) || null, numero: body.numero ?? null });
  if (!factura) throw new ErrorNC("No se encontró esa factura publicada en Odoo para esta sede.", 404);
  let monto = sol.monto;
  if (sol.origen === "rma") {
    monto = montoDeUnaUnidad(factura, sol.odoo_product_id ?? null) ?? (body.monto != null ? validarMonto(body.monto) : null);
  } else if (body.monto != null) {
    monto = validarMonto(body.monto);
  }
  if (monto != null && monto > (await disponible(factura, sol.id)) + 0.01) {
    throw new ErrorNC(`El monto supera lo que queda por acreditar de la factura ${factura.nombre}.`);
  }
  await query(
    `UPDATE nc_solicitudes SET factura_id = ?, factura_nombre = ?, partner_id = ?, cliente = ?, moneda = ?, total_factura = ?, monto = ?
      WHERE id = ?`,
    [factura.id, factura.nombre, factura.partner_id, factura.cliente.slice(0, 255), factura.moneda, factura.total, monto, sol.id],
  );
  await registrarEvento(sol.id, "factura", autor, `Factura ${factura.nombre}${monto != null ? ` · monto ${formatoMonto(monto, factura.moneda)}` : ""}`);
}

// ---------------------------------------------------------------------------
// Odoo (quien hace la NC)
// ---------------------------------------------------------------------------

function desdeUtc(sol: { created_ts: number }): string {
  // 10 min antes, por si los relojes del panel y de Odoo no coinciden.
  return new Date((sol.created_ts - 600) * 1000).toISOString().slice(0, 19).replace("T", " ");
}

async function movesDeOtras(sol: SolicitudNC): Promise<number[]> {
  const r = await query(`SELECT odoo_move_id FROM nc_solicitudes WHERE factura_id = ? AND id <> ? AND odoo_move_id IS NOT NULL`, [
    sol.factura_id,
    sol.id,
  ]);
  return (r.rows as any[]).map((f) => Number(f.odoo_move_id));
}

/** Candado de 2 minutos para que dos clics no creen dos notas en Odoo. */
async function conCandado<T>(id: number, fn: () => Promise<T>): Promise<T> {
  const r = await query(
    `UPDATE nc_solicitudes SET odoo_bloqueo = NOW()
      WHERE id = ? AND (odoo_bloqueo IS NULL OR odoo_bloqueo < NOW() - INTERVAL 2 MINUTE)`,
    [id],
  );
  if (!Number((r.rows as any).affectedRows)) throw new ErrorNC("Ya se está trabajando esta nota en Odoo. Espera un momento.", 409);
  try {
    return await fn();
  } finally {
    await query(`UPDATE nc_solicitudes SET odoo_bloqueo = NULL WHERE id = ?`, [id]).catch(() => {});
  }
}

async function vincularMove(sol: SolicitudNC, moveId: number, autor: Autor | null, como: string) {
  const r = await query(`UPDATE nc_solicitudes SET odoo_move_id = ? WHERE id = ? AND odoo_move_id IS NULL`, [moveId, sol.id]);
  if (!Number((r.rows as any).affectedRows)) throw new ErrorNC("Esta solicitud ya tiene una nota de crédito de Odoo.", 409);
  await registrarEvento(sol.id, "odoo_vinculada", autor ?? { nombre: "Panel" }, como);
}

function resumenParaChatter(sol: SolicitudNC, autor: Autor, accion: string): string {
  const partes = [
    `Nota de crédito NC-${sol.id} del panel${sol.case_number ? ` (caso RMA N.º ${sol.case_number})` : ""}: ${accion} por ${autor.nombre}.`,
    `Motivo: ${sol.motivo}`,
    sol.preaprobado_por ? `Preaprobada por ${sol.preaprobado_por}.` : "",
    sol.aprobado_por ? `Aprobada por ${sol.aprobado_por}.` : "",
  ];
  return partes.filter(Boolean).join(" ");
}

async function crearEnOdoo(sol: SolicitudNC & { created_ts: number }, autor: Autor, body: any) {
  await exigirPaso(sol, autor, "procesa");
  if (sol.estado !== "aprobada") throw new ErrorNC("Solo se hace en Odoo una nota de crédito aprobada.", 409);
  if (sol.odoo_move_id) throw new ErrorNC("Esta solicitud ya tiene su nota de crédito en Odoo.", 409);
  if (!sol.factura_id) throw new ErrorNC("Asigna primero la factura de Odoo.");

  return conCandado(sol.id, async () => {
    const candidatas = await candidatasOdoo(sol.factura_id!, desdeUtc(sol), await movesDeOtras(sol));
    if (candidatas.length && !body.crear_igual) {
      throw new ErrorNC(
        "Esta factura ya tiene una nota de crédito en Odoo hecha después de la solicitud. Si es esta, vincúlala.",
        409,
        { candidatas },
      );
    }
    const factura = await leerFactura(sol.company_id, { id: sol.factura_id });
    if (!factura) throw new ErrorNC("La factura ya no está publicada en Odoo.", 409);
    const { moveId, aviso } = await crearBorradorOdoo({
      facturaId: factura.id,
      journalId: factura.journal_id,
      companyId: sol.company_id,
      motivo: sol.motivo,
      soloProducto: sol.origen === "rma" ? (sol.odoo_product_id ?? null) : null,
    });
    await vincularMove(sol, moveId, autor, "Borrador creado desde el panel");
    if (aviso) await registrarEvento(sol.id, "aviso", { nombre: "Panel" }, aviso);
    await notaEnChatter(moveId, resumenParaChatter(sol, autor, "borrador creado desde el panel"));
    await sincronizar(sol.id);
    return { aviso };
  });
}

async function guardarBorrador(sol: SolicitudNC, autor: Autor, body: any) {
  await exigirPaso(sol, autor, "procesa");
  if (sol.estado !== "aprobada" || !sol.odoo_move_id) throw new ErrorNC("No hay borrador que editar.", 409);
  await guardarBorradorOdoo(sol.odoo_move_id, {
    lineas: Array.isArray(body.lineas)
      ? body.lineas.map((l: any) => ({
          id: Number(l.id),
          cantidad: l.cantidad == null ? undefined : Number(l.cantidad),
          precio: l.precio == null ? undefined : Number(l.precio),
          quitar: !!l.quitar,
        }))
      : undefined,
    nro_ctrl: body.nro_ctrl == null ? undefined : String(body.nro_ctrl),
    fecha: body.fecha == null ? undefined : String(body.fecha),
  });
  await registrarEvento(sol.id, "odoo_editada", autor, "Borrador ajustado desde el panel");
  await sincronizar(sol.id);
}

async function publicar(sol: SolicitudNC, autor: Autor, origen: string) {
  await exigirPaso(sol, autor, "procesa");
  if (sol.estado !== "aprobada" || !sol.odoo_move_id) throw new ErrorNC("No hay borrador que publicar.", 409);
  await conCandado(sol.id, async () => {
    const nota = await leerNotaOdoo(sol.odoo_move_id!);
    if (!nota) throw new ErrorNC("La nota de crédito ya no existe en Odoo.", 409);
    if (nota.estado !== "draft") throw new ErrorNC("La nota de crédito ya no está en borrador.", 409);
    if (sol.monto != null && nota.total > sol.monto + 0.01) {
      throw new ErrorNC(
        `El borrador (${formatoMonto(nota.total, nota.moneda)}) supera lo aprobado (${formatoMonto(sol.monto, sol.moneda)}). Ajústalo antes de publicar.`,
      );
    }
    if ([9, 10].includes(sol.company_id) && !nota.nro_ctrl.trim()) {
      throw new ErrorNC("Falta el número de control de la nota de crédito.");
    }
    await publicarOdoo(sol.odoo_move_id!);
    await notaEnChatter(sol.odoo_move_id!, resumenParaChatter(sol, autor, "publicada desde el panel"));
  });
  await query(`UPDATE nc_solicitudes SET procesado_por = ? WHERE id = ?`, [autor.nombre, sol.id]);
  await sincronizar(sol.id, origen);
}

async function vincular(sol: SolicitudNC & { created_ts: number }, autor: Autor, body: any, origen: string) {
  await exigirPaso(sol, autor, "procesa");
  if (sol.estado !== "aprobada" || sol.odoo_move_id || !sol.factura_id) throw new ErrorNC("No hay nada que vincular.", 409);
  const moveId = Number(body.move_id);
  const candidatas = await candidatasOdoo(sol.factura_id, desdeUtc(sol), await movesDeOtras(sol));
  const elegida = candidatas.find((c) => c.id === moveId);
  if (!elegida) throw new ErrorNC("Esa nota de crédito no es de esta factura o ya es de otra solicitud.", 404);
  await vincularMove(sol, moveId, autor, `Vinculada a ${elegida.nombre}, hecha en Odoo por ${elegida.creado_por || "—"}`);
  await notaEnChatter(moveId, resumenParaChatter(sol, autor, "vinculada en el panel"));
  await sincronizar(sol.id, origen);
}

/**
 * Pone la solicitud al día con Odoo:
 *   - con NC vinculada: número, total y estado. Publicada → "procesada";
 *     anulada o borrada → se desvincula y vuelve a "aprobada".
 *   - aprobada sin NC: si en Odoo hay exactamente una NC nueva de la factura
 *     y es la única solicitud abierta de esa factura, se vincula sola (Victor
 *     la hizo directo en Odoo).
 * Devuelve las candidatas cuando no se pudo decidir sola.
 */
export async function sincronizar(id: number, origen?: string): Promise<CandidataNC[]> {
  const sol = await obtener(id);
  if (!sol || !["aprobada", "procesada"].includes(sol.estado)) return [];
  const panel = { nombre: "Panel" };

  if (sol.odoo_move_id) {
    const info = (await estadosNotasOdoo([sol.odoo_move_id])).get(sol.odoo_move_id);
    if (!info || info.estado === "cancel") {
      await query(
        `UPDATE nc_solicitudes SET odoo_move_id = NULL, odoo_move_nombre = NULL, odoo_estado = NULL, odoo_total = NULL,
                estado = 'aprobada', procesado_por = NULL, procesado_at = NULL WHERE id = ?`,
        [id],
      );
      await registrarEvento(id, "odoo_anulada", panel, `La nota ${sol.odoo_move_nombre || ""} se ${info ? "anuló" : "borró"} en Odoo: queda otra vez por hacer.`);
      return [];
    }
    const pasaAPublicada = info.estado === "posted" && sol.estado !== "procesada";
    await query(
      `UPDATE nc_solicitudes SET odoo_move_nombre = ?, odoo_estado = ?, odoo_total = ?
              ${pasaAPublicada ? ", estado = 'procesada', procesado_at = NOW(), procesado_por = COALESCE(procesado_por, ?)" : ""}
        WHERE id = ?`,
      pasaAPublicada ? [info.nombre, info.estado, info.total, `${info.por || "—"} (en Odoo)`, id] : [info.nombre, info.estado, info.total, id],
    );
    if (pasaAPublicada) {
      await registrarEvento(id, "procesada", panel, `Nota de crédito ${info.nombre} publicada en Odoo por ${info.por || "—"}`);
      const nueva = await obtener(id);
      if (nueva && origen) avisarNC("procesada", nueva, origen);
    }
    return [];
  }

  if (sol.estado !== "aprobada" || !sol.factura_id) return [];
  const candidatas = await candidatasOdoo(sol.factura_id, desdeUtc(sol), await movesDeOtras(sol));
  if (candidatas.length !== 1) return candidatas;
  const abiertas = await query(
    `SELECT COUNT(*) AS n FROM nc_solicitudes WHERE factura_id = ? AND estado = 'aprobada' AND odoo_move_id IS NULL`,
    [sol.factura_id],
  );
  if (Number((abiertas.rows as any[])[0]?.n) !== 1) return candidatas;
  try {
    await vincularMove(sol, candidatas[0].id, null, `Vinculada sola a ${candidatas[0].nombre}, hecha en Odoo por ${candidatas[0].creado_por || "—"}`);
  } catch {
    return [];
  }
  return sincronizar(id, origen);
}

/** Sincroniza las aprobadas de la lista (las que esperan a quien hace la NC). */
export async function sincronizarAprobadas(sols: SolicitudNC[], origen: string): Promise<boolean> {
  const pendientes = sols.filter((s) => s.estado === "aprobada").slice(0, 20);
  let cambio = false;
  for (const s of pendientes) {
    const antes = `${s.estado}|${s.odoo_move_id}|${s.odoo_estado}|${s.odoo_total}`;
    try {
      await sincronizar(s.id, origen);
      const d = await obtener(s.id);
      if (d && `${d.estado}|${d.odoo_move_id}|${d.odoo_estado}|${d.odoo_total}` !== antes) cambio = true;
    } catch (e: any) {
      console.error(`[notas-credito] sincronizar NC-${s.id}:`, e?.message);
    }
  }
  return cambio;
}

export async function ejecutarAccion(
  id: number,
  accion: AccionNC,
  body: any,
  autor: Autor,
  origen: string,
): Promise<Record<string, unknown>> {
  const sol = await obtener(id);
  if (!sol) throw new ErrorNC("Nota de crédito no encontrada.", 404);
  const nota = String(body?.nota ?? "").trim().slice(0, 2000);
  switch (accion) {
    case "preaprobar":
      await preaprobar(sol, autor, nota, origen);
      return {};
    case "aprobar":
      await aprobar(sol, autor, nota, origen);
      return {};
    case "rechazar":
      await rechazar(sol, autor, String(body?.motivo ?? ""), origen);
      return {};
    case "factura":
      await asignarFactura(sol, autor, body);
      return {};
    case "crear_odoo":
      return crearEnOdoo(sol, autor, body);
    case "guardar_borrador":
      await guardarBorrador(sol, autor, body);
      return {};
    case "publicar":
      await publicar(sol, autor, origen);
      return {};
    case "vincular":
      await vincular(sol, autor, body, origen);
      return {};
    case "sincronizar":
      return { candidatas: await sincronizar(id, origen) };
    default:
      throw new ErrorNC("Acción desconocida.");
  }
}

/** Detalle para la pantalla: solicitud, historial, la NC de Odoo y las candidatas a vincular. */
export async function detalle(id: number, origen: string) {
  let candidatas: CandidataNC[] = [];
  try {
    candidatas = await sincronizar(id, origen);
  } catch (e: any) {
    console.error(`[notas-credito] sincronizar NC-${id}:`, e?.message);
  }
  const sol = await obtener(id);
  if (!sol) return null;
  const ev = await query(`SELECT accion, por, nota, created_at FROM nc_eventos WHERE solicitud_id = ? ORDER BY id`, [id]);
  let borrador: BorradorNC | null = null;
  if (sol.odoo_move_id) {
    try {
      borrador = await leerNotaOdoo(sol.odoo_move_id);
    } catch (e: any) {
      console.error(`[notas-credito] leer NC ${sol.odoo_move_id}:`, e?.message);
    }
  }
  return { solicitud: sol, eventos: ev.rows as any[], borrador, candidatas };
}

/** Qué puede hacer la sesión con esta solicitud (para los botones; el servidor vuelve a chequear). */
export async function permisosSobre(sol: SolicitudNC, autor: Autor) {
  const mios = (await pasosDe(autor.email))[sol.company_id] ?? [];
  const tiene = (p: PasoNC) => mios.includes(p);
  return {
    preaprobar: sol.estado === "por_preaprobar" && tiene("preaprueba"),
    aprobar: sol.estado === "por_aprobar" && tiene("aprueba"),
    rechazar: (sol.estado === "por_preaprobar" && tiene("preaprueba")) || (sol.estado === "por_aprobar" && tiene("aprueba")),
    factura: ["por_preaprobar", "por_aprobar", "aprobada"].includes(sol.estado) && !sol.odoo_move_id && tiene("procesa"),
    odoo: sol.estado === "aprobada" && tiene("procesa"),
    superadmin: esSuperadmin(autor.rol),
  };
}
