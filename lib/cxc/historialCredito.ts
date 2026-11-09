import { db, query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { COMPANY_NAMES } from "@/lib/cxc/alcance";
import { calcularSobregiro, type EstadoSobregiro } from "@/lib/cxc/sobregiro";
import { compararFotos, type Previa, type TipoEvento } from "@/lib/cxc/historialCreditoCruce";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import { esICExcluido } from "@/lib/intercompania";

/**
 * Historial del crédito de los clientes (pestaña Historial de Sobregiro).
 *
 * Odoo no guarda la historia del límite de crédito: `credit_limit` es
 * company_dependent, vive en `ir.property` y cada cambio pisa el valor
 * anterior (ni el chatter ni el auditlog lo registran, nov-2026). Por eso el
 * panel toma cada hora (cron de server.js → /api/cron/historial-credito) el
 * cálculo de Sobregiro de las tres sedes y:
 *   - guarda la foto del día de cada cliente (cupo, usado, vencido, estado) en
 *     `cxc_credito_fotos`, una fila por cliente y día (la última corrida del
 *     día gana): de ahí sale "cuánto tenía en tal fecha" y los días excedido;
 *   - compara con la foto anterior y anota en `cxc_credito_eventos` cada
 *     cambio de cupo (antes → después, con quién lo cambió en Odoo:
 *     `ir.property.write_uid`) y cada vez que un cliente pasa a estar excedido
 *     o deja de estarlo.
 * La primera corrida solo deja la base (sin eventos). Nada de antes se puede
 * recuperar. Un exceso que empieza y termina dentro de la misma hora no se ve.
 */

const FOTOS = "cxc_credito_fotos";
const EVENTOS = "cxc_credito_eventos";
export const SEDES_HISTORIAL = [9, 10, 7];

let tablasListas = false;
async function asegurarTablas() {
  if (tablasListas) return;
  await query(
    `CREATE TABLE IF NOT EXISTS ${FOTOS} (
      company_id INT NOT NULL,
      partner_id INT NOT NULL,
      fecha DATE NOT NULL,
      cliente VARCHAR(255) NOT NULL,
      rif VARCHAR(40) NOT NULL DEFAULT '',
      vendedor VARCHAR(150) NOT NULL DEFAULT '',
      limite DECIMAL(14,2) NOT NULL DEFAULT 0,
      usado DECIMAL(14,2) NOT NULL DEFAULT 0,
      vencido DECIMAL(14,2) NOT NULL DEFAULT 0,
      estado VARCHAR(12) NOT NULL,
      actualizado_el DATETIME NOT NULL,
      PRIMARY KEY (company_id, partner_id, fecha),
      INDEX idx_fecha (fecha)
    )`,
  );
  await query(
    `CREATE TABLE IF NOT EXISTS ${EVENTOS} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      partner_id INT NOT NULL,
      cliente VARCHAR(255) NOT NULL,
      tipo VARCHAR(10) NOT NULL,
      limite_antes DECIMAL(14,2) NULL,
      limite_despues DECIMAL(14,2) NULL,
      usado DECIMAL(14,2) NULL,
      usuario VARCHAR(255) NULL,
      cambiado_el DATETIME NULL,
      dia DATE NOT NULL,
      detectado_el DATETIME NOT NULL,
      INDEX idx_dia (company_id, dia),
      INDEX idx_partner (partner_id)
    )`,
  );
  tablasListas = true;
}

/** Última foto guardada de cada cliente de la sede. */
async function fotoPrevia(cid: number): Promise<Map<number, Previa>> {
  const { rows } = await query(
    `SELECT f.partner_id, f.limite, f.usado, f.estado, f.cliente
       FROM ${FOTOS} f
       JOIN (SELECT partner_id, MAX(fecha) AS fecha FROM ${FOTOS} WHERE company_id = ? GROUP BY partner_id) u
         ON u.partner_id = f.partner_id AND u.fecha = f.fecha
      WHERE f.company_id = ?`,
    [cid, cid],
  );
  return new Map((rows as any[]).map((r) => [
    Number(r.partner_id),
    { limite: Number(r.limite), usado: Number(r.usado), estado: r.estado, cliente: r.cliente },
  ]));
}

/** Quién y cuándo cambió el cupo en Odoo (último cambio de cada `ir.property`). */
async function quienCambio(cid: number, partnerIds: number[]): Promise<Map<number, { usuario: string; el: Date | null }>> {
  const out = new Map<number, { usuario: string; el: Date | null }>();
  if (!partnerIds.length) return out;
  try {
    const props = await callOdooRPCEstricto<any[]>("ir.property", "search_read", [[
      ["name", "=", "credit_limit"],
      ["company_id", "=", cid],
      ["res_id", "in", partnerIds.map((id) => `res.partner,${id}`)],
    ]], { fields: ["res_id", "write_uid", "write_date"], context: { allowed_company_ids: [cid] } });
    for (const p of props || []) {
      const id = Number(String(p.res_id || "").split(",")[1]);
      if (id) out.set(id, {
        usuario: Array.isArray(p.write_uid) ? p.write_uid[1] : "",
        el: p.write_date ? new Date(String(p.write_date).replace(" ", "T") + "Z") : null,
      });
    }
  } catch (e: any) {
    // Sin permiso sobre ir.property el cambio se anota igual, sin el usuario.
    console.error(`[historial-credito] ir.property sede ${cid}:`, e?.message);
  }
  return out;
}

/** Una corrida para una sede: guarda la foto de hoy y los eventos desde la anterior. */
export async function registrarSede(cid: number): Promise<{ clientes: number; eventos: number; base: boolean }> {
  await asegurarTablas();
  const { clientes } = await calcularSobregiro([cid]);
  const previa = await fotoPrevia(cid);
  const hayBase = previa.size > 0;
  const hoy = hoyCaracas();
  const ahora = new Date();
  const { filas: actuales, eventos } = compararFotos(previa, clientes);

  const quien = await quienCambio(cid, eventos.filter((e) => e.tipo === "cupo").map((e) => e.partnerId));

  // Directo al pool y no con query(): son ~500 filas por sede cada hora y
  // query() dejaría cada lote en system_audit_log sin que lo haya hecho nadie.
  for (let i = 0; i < actuales.length; i += 400) {
    const lote = actuales.slice(i, i + 400);
    await db.query(
      `INSERT INTO ${FOTOS} (company_id, partner_id, fecha, cliente, rif, vendedor, limite, usado, vencido, estado, actualizado_el)
       VALUES ?
       ON DUPLICATE KEY UPDATE cliente = VALUES(cliente), rif = VALUES(rif), vendedor = VALUES(vendedor), limite = VALUES(limite),
         usado = VALUES(usado), vencido = VALUES(vencido), estado = VALUES(estado), actualizado_el = VALUES(actualizado_el)`,
      [lote.map((c) => [cid, c.partnerId, hoy, c.cliente.slice(0, 255), c.rif.slice(0, 40), c.vendedor.slice(0, 150), c.limite, c.usado, c.vencido, c.estado, ahora])],
    );
  }
  if (eventos.length) {
    await db.query(
      `INSERT INTO ${EVENTOS} (company_id, partner_id, cliente, tipo, limite_antes, limite_despues, usado, usuario, cambiado_el, dia, detectado_el) VALUES ?`,
      [eventos.map((e) => {
        const q = e.tipo === "cupo" ? quien.get(e.partnerId) : undefined;
        return [cid, e.partnerId, e.cliente.slice(0, 255), e.tipo, e.antes, e.despues, e.usado, q?.usuario || null, q?.el || null, hoy, ahora];
      })],
    );
  }
  return { clientes: actuales.length, eventos: eventos.length, base: !hayBase };
}

let corriendo = false;
/** Corrida de las tres sedes (el cron). Una a la vez. */
export async function registrarHistorialCredito(): Promise<Record<number, string>> {
  if (corriendo) return { 0: "ya estaba corriendo" };
  corriendo = true;
  const resultado: Record<number, string> = {};
  try {
    for (const cid of SEDES_HISTORIAL) {
      try {
        const r = await registrarSede(cid);
        resultado[cid] = r.base ? `base tomada (${r.clientes} clientes)` : `${r.clientes} clientes, ${r.eventos} eventos`;
      } catch (e: any) {
        console.error(`[historial-credito] sede ${cid}:`, e?.message);
        resultado[cid] = `error: ${e?.message}`;
      }
    }
  } finally {
    corriendo = false;
  }
  return resultado;
}

// ---------------------------------------------------------------- lectura

const num = (v: any) => Number(v) || 0;
const sede = (cid: number) => COMPANY_NAMES[cid] || String(cid);
const marcas = (ids: number[]) => ids.map(() => "?").join(", ");

export interface FotoCliente {
  companyId: number; sede: string; partnerId: number; cliente: string; rif: string; vendedor: string;
  limite: number; usado: number; vencido: number; estado: EstadoSobregiro; fecha: string;
}

/** Cupo y deuda de cada cliente en una fecha: su última foto hasta ese día. */
export async function fotoDelDia(companyIds: number[], fecha: string): Promise<FotoCliente[]> {
  await asegurarTablas();
  const { rows } = await query(
    `SELECT f.company_id, f.partner_id, f.cliente, f.rif, f.vendedor, f.limite, f.usado, f.vencido, f.estado,
            DATE_FORMAT(f.fecha, '%Y-%m-%d') AS fecha
       FROM ${FOTOS} f
       JOIN (SELECT company_id, partner_id, MAX(fecha) AS fecha FROM ${FOTOS}
              WHERE company_id IN (${marcas(companyIds)}) AND fecha <= ? GROUP BY company_id, partner_id) u
         ON u.company_id = f.company_id AND u.partner_id = f.partner_id AND u.fecha = f.fecha`,
    [...companyIds, fecha],
  );
  return (rows as any[])
    .filter((r) => !esICExcluido(r.partner_id))
    .map((r) => ({
      companyId: r.company_id, sede: sede(r.company_id), partnerId: r.partner_id, cliente: r.cliente, rif: r.rif,
      vendedor: r.vendedor, limite: num(r.limite), usado: num(r.usado), vencido: num(r.vencido), estado: r.estado, fecha: r.fecha,
    }))
    .filter((f) => !(f.limite === 0 && f.usado === 0));
}

export interface EventoCredito {
  id: number; companyId: number; sede: string; partnerId: number; cliente: string; tipo: TipoEvento;
  limiteAntes: number | null; limiteDespues: number | null; usado: number | null;
  usuario: string | null; cambiadoEl: string | null; dia: string; detectadoEl: string;
}

export interface ResumenCliente {
  companyId: number; sede: string; partnerId: number; cliente: string;
  limiteInicio: number | null; limiteFin: number | null;
  cambiosCupo: number; vecesExcedido: number; diasExcedido: number; mayorExceso: number;
}

/** Eventos y resumen por cliente entre dos fechas (incluidas, hora de Caracas). */
export async function historialCredito(companyIds: number[], desde: string, hasta: string) {
  await asegurarTablas();
  const { rows: inicioRows } = await query(`SELECT DATE_FORMAT(MIN(fecha), '%Y-%m-%d') AS desde FROM ${FOTOS} WHERE company_id IN (${marcas(companyIds)})`, companyIds);
  const midiendoDesde: string | null = (inicioRows as any[])[0]?.desde || null;

  const { rows: evRows } = await query(
    `SELECT id, company_id, partner_id, cliente, tipo, limite_antes, limite_despues, usado, usuario, cambiado_el,
            DATE_FORMAT(dia, '%Y-%m-%d') AS dia, detectado_el
       FROM ${EVENTOS} WHERE company_id IN (${marcas(companyIds)}) AND dia BETWEEN ? AND ?
      ORDER BY detectado_el DESC, id DESC`,
    [...companyIds, desde, hasta],
  );
  const eventos: EventoCredito[] = (evRows as any[])
    .filter((r) => !esICExcluido(r.partner_id))
    .map((r) => ({
      id: r.id, companyId: r.company_id, sede: sede(r.company_id), partnerId: r.partner_id, cliente: r.cliente, tipo: r.tipo,
      limiteAntes: r.limite_antes == null ? null : num(r.limite_antes),
      limiteDespues: r.limite_despues == null ? null : num(r.limite_despues),
      usado: r.usado == null ? null : num(r.usado), usuario: r.usuario,
      cambiadoEl: r.cambiado_el ? new Date(r.cambiado_el).toISOString() : null,
      dia: r.dia, detectadoEl: new Date(r.detectado_el).toISOString(),
    }));

  const { rows: diasRows } = await query(
    `SELECT company_id, partner_id, MAX(cliente) AS cliente,
            SUM(estado = 'excedido') AS dias_excedido, MAX(IF(limite > 0, usado - limite, 0)) AS mayor_exceso
       FROM ${FOTOS} WHERE company_id IN (${marcas(companyIds)}) AND fecha BETWEEN ? AND ?
      GROUP BY company_id, partner_id`,
    [...companyIds, desde, hasta],
  );
  const [inicio, fin] = await Promise.all([fotoDelDia(companyIds, desde), fotoDelDia(companyIds, hasta)]);
  const llave = (cid: number, pid: number) => `${cid}-${pid}`;
  const limInicio = new Map(inicio.map((f) => [llave(f.companyId, f.partnerId), f.limite]));
  const limFin = new Map(fin.map((f) => [llave(f.companyId, f.partnerId), f.limite]));

  const porCliente = new Map<string, ResumenCliente>();
  const fila = (cid: number, pid: number, cliente: string) => {
    const k = llave(cid, pid);
    let r = porCliente.get(k);
    if (!r) {
      r = {
        companyId: cid, sede: sede(cid), partnerId: pid, cliente,
        limiteInicio: limInicio.get(k) ?? null, limiteFin: limFin.get(k) ?? null,
        cambiosCupo: 0, vecesExcedido: 0, diasExcedido: 0, mayorExceso: 0,
      };
      porCliente.set(k, r);
    }
    return r;
  };
  for (const d of diasRows as any[]) {
    if (esICExcluido(d.partner_id) || num(d.dias_excedido) === 0) continue;
    const r = fila(d.company_id, d.partner_id, d.cliente);
    r.diasExcedido = num(d.dias_excedido);
    r.mayorExceso = Math.max(0, Math.round(num(d.mayor_exceso) * 100) / 100);
  }
  for (const e of eventos) {
    if (e.tipo === "normalizo") continue;
    const r = fila(e.companyId, e.partnerId, e.cliente);
    if (e.tipo === "cupo") r.cambiosCupo++;
    else r.vecesExcedido++;
  }
  const clientes = [...porCliente.values()].sort((a, b) =>
    b.vecesExcedido - a.vecesExcedido || b.diasExcedido - a.diasExcedido || b.cambiosCupo - a.cambiosCupo);

  return {
    midiendoDesde,
    eventos,
    clientes,
    resumen: {
      cambiosCupo: eventos.filter((e) => e.tipo === "cupo").length,
      vecesExcedido: eventos.filter((e) => e.tipo === "excedio").length,
      clientesExcedidos: clientes.filter((c) => c.vecesExcedido > 0 || c.diasExcedido > 0).length,
      diasClienteExcedido: clientes.reduce((s, c) => s + c.diasExcedido, 0),
    },
  };
}
