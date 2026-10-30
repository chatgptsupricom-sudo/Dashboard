// Tablero de los leads de los Excel de antes del panel (pestaña "Leads de
// Excel" de Monitoreo Leads). Es un tablero aparte del de `leads`, pero con
// las mismas columnas y acciones: cada lead de `leads_historicos` se devuelve
// con la forma de un lead del panel, y lo que se hace en el tablero (estatus,
// vendedor, cierre) se guarda en sus columnas `panel_*` / `seller_id`, que
// re-importar el Excel no toca.
//
// Un cierre hecho desde el tablero (`cerrado_en_panel = 1`) sale en Cierres y
// suma en las tarjetas del Dashboard Leads por su fecha de cierre
// (lib/adminleads/metricas.ts). Los vendidos que ya venían en el Excel
// (CONCRETADO) no: son historia de antes del panel y se ven en la pestaña
// Histórico (Excel) del Dashboard. Un cierre ganado deja el lead como
// CONCRETADO (con estatus_original, igual que "Por revisar") para que entre en
// Recompra; "Ya es cliente" no entra, como en los leads del panel.
//
// Reasignar un lead de Excel a un vendedor lo pasa al panel (`pasarAlPanel`):
// nace su fila en `leads`, con la fecha de ingreso del Excel, y queda enlazado
// en `leads_historicos.lead_id`. Desde ahí es un lead normal del tablero del
// vendedor (y de la pestaña de leads del panel) y lo de Excel lo deja fuera:
// este tablero, sus cierres en el Dashboard Leads, Recompra, "Por revisar" y
// el Histórico (Excel). `lead_id = 0` = se está pasando.

import { query } from "@/lib/db";
import { mismaOperacion } from "@/lib/adminleads/sucursal";
import { asegurarTablas } from "@/lib/adminleads/recompra";
import { normalizarRif } from "@/lib/smartbit";
import { normalizarCanal, SIN_CANAL } from "@/lib/canales";
import { avisarReasignacion } from "@/lib/adminleads/reasignacion";

const PANAMA = 7;

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

/**
 * Columna del tablero para el estatus escrito en el Excel. CONCRETADO = cerrado
 * ganado; lo que suena a perdido = cerrado perdido; si coincide con un estatus
 * del panel, ese; vacío = NUEVO; lo demás, CONTACTADO.
 */
export function estatusDelTablero(estatus: unknown, delPanel: string[]): { status: string; motivo: string | null } {
  const e = norm(estatus);
  if (!e) return { status: "NUEVO", motivo: null };
  if (e.includes("CONCRET") || e.includes("VENDID") || e === "VENTA" || e === "GANADO") return { status: "CERRADO", motivo: "GANADO" };
  if (/PERDID|NO INTERES|DESCART|NO COMPR|NO RESPON|ABANDON|RECHAZ/.test(e)) return { status: "CERRADO", motivo: "PERDIDO" };
  const igual = delPanel.find((p) => norm(p) === e);
  if (igual) return { status: igual, motivo: null };
  return { status: "CONTACTADO", motivo: null };
}

/** Condición de sede: Panamá ve Panamá; los demás, Venezuela (como /api/adminleads/leads). */
function alcanceSql(userCids: number | null) {
  return userCids === PANAMA
    ? `COALESCE(s.cids, h.company_id) = ${PANAMA}`
    : `COALESCE(s.cids, h.company_id) <> ${PANAMA}`;
}

const SELECT_LEAD = `SELECT h.*, s.name AS seller_nombre, s.cids AS seller_cids,
       DATE_FORMAT(h.fecha_interaccion, '%Y-%m-%d') AS entrada,
       DATE_FORMAT(h.primera_venta, '%Y-%m-%d') AS primera,
       DATE_FORMAT(h.panel_fecha_cierre, '%Y-%m-%d %H:%i:%s') AS cierre
  FROM leads_historicos h
  LEFT JOIN sellers s ON s.id = h.seller_id`;

const estadosDelPanel = async () => {
  const { rows } = await query("SELECT name FROM lead_statuses ORDER BY order_index ASC").catch(() => ({ rows: [] as any[] }));
  return rows.map((e: any) => String(e.name));
};

/** Leads de Excel con la forma de un lead del panel. `soloCerradosEnPanel`: los de la sección Cierres. */
export async function listarLeadsExcel(userCids: number | null, soloCerradosEnPanel = false) {
  await asegurarTablas();
  const delPanel = await estadosDelPanel();
  // Los que se reasignaron antes de que reasignar los pasara al panel.
  const { rows: pendientes } = await query(`${SELECT_LEAD} WHERE h.seller_id IS NOT NULL AND h.lead_id IS NULL`);
  for (const h of pendientes) {
    await pasarAlPanel(h, h.seller_id, delPanel).catch((e) => console.error("Pasar lead de Excel al panel:", h.id, e?.message));
  }
  const { rows } = await query(
    `${SELECT_LEAD} WHERE h.lead_id IS NULL AND ${alcanceSql(userCids)} ${soloCerradosEnPanel ? "AND h.cerrado_en_panel = 1" : ""}`,
  );
  return rows.map((h: any) => comoLead(h, delPanel));
}

/** Un lead de Excel (fila de SELECT_LEAD) con la forma de un lead del panel. */
function comoLead(h: any, delPanel: string[]) {
  const delExcel = estatusDelTablero(h.estatus, delPanel);
  const status = h.panel_status || delExcel.status;
  const motivo = h.panel_status ? h.panel_motivo : delExcel.motivo;
  return {
    origen: "excel",
    id: h.id,
    company_id: h.company_id,
    nombre_contacto: h.nombre,
    name: h.nombre,
    telefono: h.telefono || "",
    rif: h.rif || "",
    ubicacion_estado: h.ubicacion || "",
    canal_origen: h.red_social || "",
    campana: h.campana_editada || h.campana || "",
    status,
    motivo_cierre: status === "CERRADO" ? motivo : null,
    seller_id: h.seller_id,
    // El vendedor del panel si se reasignó; si no, el nombre que traía el Excel.
    vendedor_nombre: h.seller_nombre || h.vendedor || "",
    vendedor_excel: h.vendedor || "",
    estatus_excel: h.estatus_original ?? h.estatus ?? "",
    monto_cerrado_usd: h.panel_monto ?? h.monto,
    num_factura: h.panel_factura || h.factura_txt || "",
    fecha_ingreso: h.entrada,
    fecha_venta: h.cierre || h.primera || (motivo === "GANADO" ? h.entrada : null),
    observaciones_vendedor: h.panel_observaciones ?? h.observacion ?? "",
    observaciones_cierres: h.panel_obs_cierre || "",
    motivo_perdido: h.panel_motivo_perdido || "",
    producto_perdido: h.panel_producto_perdido || "",
    has_segunda_compra: h.panel_segunda_compra ? 1 : 0,
    cerrado_en_panel: h.cerrado_en_panel ? 1 : 0,
  };
}

/**
 * Pasa un lead de Excel al panel: crea su fila en `leads` con el vendedor, los
 * datos y lo trabajado en este tablero (fecha de ingreso = la del Excel) y la
 * enlaza en `leads_historicos.lead_id`. `h` es una fila de SELECT_LEAD.
 * Devuelve el id del lead, o null si otro pedido ya lo está pasando.
 */
async function pasarAlPanel(h: any, sellerId: number, delPanel: string[]): Promise<number | null> {
  // Se toma antes de crear la fila: dos pedidos a la vez no lo pasan dos veces.
  const { rows: tomado }: any = await query("UPDATE leads_historicos SET lead_id = 0 WHERE id = ? AND lead_id IS NULL", [h.id]);
  if (!tomado.affectedRows) return null;
  try {
    const l = comoLead(h, delPanel);
    const canal = normalizarCanal(l.canal_origen);
    const cerrado = l.status === "CERRADO";
    const { rows: nuevo }: any = await query(
      `INSERT INTO leads
         (nombre_contacto, name, telefono, rif, ubicacion_estado, canal_origen, campana, seller_id, status, motivo_cierre,
          monto_cerrado_usd, num_factura, fecha_venta, fecha_ingreso, observaciones_vendedor, observaciones_cierres,
          motivo_perdido, producto_perdido, has_segunda_compra, reactivacion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?)`,
      [
        l.nombre_contacto, l.name, l.telefono, l.rif, l.ubicacion_estado, canal === SIN_CANAL ? null : canal, l.campana,
        sellerId, l.status, l.motivo_cierre, cerrado ? l.monto_cerrado_usd ?? null : null, l.num_factura || null,
        cerrado ? l.fecha_venta : null, l.fecha_ingreso, l.observaciones_vendedor || null, l.observaciones_cierres || null,
        l.motivo_perdido || null, l.producto_perdido || null, l.has_segunda_compra, h.panel_reactivacion ? 1 : 0,
      ],
    );
    await query("UPDATE leads_historicos SET lead_id = ?, seller_id = ? WHERE id = ?", [nuevo.insertId, sellerId, h.id]);
    return nuevo.insertId;
  } catch (e) {
    await query("UPDATE leads_historicos SET lead_id = NULL WHERE id = ? AND lead_id = 0", [h.id]);
    throw e;
  }
}

export class ErrorLeadExcel extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

/**
 * Cambios desde el tablero, con el mismo cuerpo que PATCH /api/vendedores/leads
 * (y { leadId, newSellerId } para reasignar, como /api/adminleads/reasignar:
 * reasignar a un vendedor pasa el lead al panel; `payload` es la sesión, para
 * el registro de la reasignación).
 * `reabrir` (sección Cierres, como /api/adminleads/reactivar) también reabre un
 * lead ganado; `reactivacion` (arrastrar en el tablero) solo un perdido.
 */
export async function actualizarLeadExcel(body: any, userCids: number | null, payload: any) {
  await asegurarTablas();
  const id = Number(body.id ?? body.leadId);
  if (!id) throw new ErrorLeadExcel("ID requerido");
  const { rows } = await query(`${SELECT_LEAD} WHERE h.id = ? AND ${alcanceSql(userCids)}`, [id]);
  const lead = rows[0];
  if (!lead) throw new ErrorLeadExcel("Lead no encontrado", 404);
  if (lead.lead_id != null) throw new ErrorLeadExcel("Este lead ya está en el tablero del panel", 409);
  const delPanel = await estadosDelPanel();
  const actual = lead.panel_status
    ? { status: lead.panel_status, motivo: lead.panel_motivo }
    : estatusDelTablero(lead.estatus, delPanel);
  const ganado = actual.status === "CERRADO" && (actual.motivo === "GANADO" || actual.motivo === "VENTA");

  const set = async (campos: Record<string, any>) => {
    const cols = Object.keys(campos);
    await query(`UPDATE leads_historicos SET ${cols.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`, [...cols.map((c) => campos[c]), id]);
  };
  // Si el cierre desde el tablero lo dejó CONCRETADO, se devuelve el estatus del Excel.
  const deshacerConcretado = lead.cerrado_en_panel && lead.estatus_original != null && lead.estatus === "CONCRETADO"
    ? { estatus: lead.estatus_original || null, estatus_original: null }
    : {};

  if (body.newSellerId !== undefined) {
    const sellerId = body.newSellerId ? Number(body.newSellerId) : null;
    let nuevo: any = null;
    if (sellerId) {
      const { rows: s } = await query("SELECT name, cids FROM sellers WHERE id = ?", [sellerId]);
      nuevo = s[0];
      if (!nuevo) throw new ErrorLeadExcel("Vendedor no encontrado", 404);
      if (!mismaOperacion(lead.company_id, nuevo.cids)) throw new ErrorLeadExcel("Ese vendedor es de otra operación", 403);
    }
    if (ganado) throw new ErrorLeadExcel("No se puede cambiar el vendedor de un lead cerrado por venta", 403);
    if (!sellerId) {
      await set({ seller_id: null });
    } else {
      const leadId = await pasarAlPanel(lead, sellerId, delPanel);
      if (!leadId) throw new ErrorLeadExcel("Este lead ya se está pasando al tablero del panel", 409);
      const l = comoLead(lead, delPanel);
      await avisarReasignacion(payload, leadId, sellerId, {
        ...l,
        lead_name: l.name,
        ubicacion_detalle: "",
        old_seller_name: lead.seller_nombre,
        old_seller_cids: lead.seller_cids,
        new_seller_name: nuevo.name,
        new_seller_cids: nuevo.cids,
      });
    }
  } else if (["nombre", "empresa", "telefono", "rif", "ubicacionEstado"].some((k) => body[k] !== undefined)) {
    const campos: Record<string, any> = {};
    const nombre = body.empresa ?? body.nombre;
    if (nombre !== undefined && String(nombre).trim()) campos.nombre = String(nombre).trim().slice(0, 255);
    if (body.telefono !== undefined) campos.telefono = String(body.telefono || "").slice(0, 120);
    if (body.ubicacionEstado !== undefined) campos.ubicacion = String(body.ubicacionEstado || "").slice(0, 120);
    if (body.rif !== undefined) {
      const rif = normalizarRif(String(body.rif || ""));
      Object.assign(campos, rif ? { rif, rif_origen: "manual" } : { rif: null, rif_origen: null, cliente_rif: null });
    }
    if (Object.keys(campos).length) await set(campos);
  } else if (body.observacionesVendedor !== undefined) {
    await set({ panel_observaciones: body.observacionesVendedor });
  } else if (body.segundaCompraRealizada) {
    await set({ panel_segunda_compra: 1 });
  } else if (body.reactivacion || body.reabrir) {
    if (ganado && !body.reabrir) throw new ErrorLeadExcel("Solo el administrador puede reactivar leads ganados", 403);
    await set({
      panel_status: body.status || "NUEVO",
      panel_motivo: null,
      panel_fecha_cierre: null,
      panel_reactivacion: ganado ? 0 : 1,
      cerrado_en_panel: 0,
      ...deshacerConcretado,
    });
  } else if (body.status !== undefined) {
    const status = String(body.status);
    if (status !== "CERRADO") {
      if (ganado) throw new ErrorLeadExcel("Un lead ganado no puede cambiar de estado.", 403);
      await set({ panel_status: status });
    } else {
      const motivo = String(body.motivo || actual.motivo || "GANADO");
      const fecha = /^\d{4}-\d{2}-\d{2}$/.test(body.fecha || "") ? `${body.fecha} ${new Date().toTimeString().split(" ")[0]}` : null;
      const campos: Record<string, any> = {
        panel_status: "CERRADO",
        panel_motivo: motivo,
        // Editar un cierre (sección Cierres) manda solo lo que cambia.
        panel_fecha_cierre: fecha ?? lead.panel_fecha_cierre ?? new Date(),
        cerrado_en_panel: 1,
      };
      if (body.monto !== undefined) campos.panel_monto = body.monto === "" || body.monto == null || isNaN(Number(body.monto)) ? null : Number(body.monto);
      if (body.factura !== undefined) campos.panel_factura = String(body.factura || "").slice(0, 100) || null;
      if (body.motivoPerdido !== undefined) campos.panel_motivo_perdido = body.motivoPerdido || null;
      if (body.productoPerdido !== undefined) campos.panel_producto_perdido = body.productoPerdido || null;
      if (body.observacionesCierres !== undefined) campos.panel_obs_cierre = body.observacionesCierres || null;
      if (motivo === "GANADO" || motivo === "VENTA") {
        // Venta: queda CONCRETADO para Recompra (re-importar no lo pisa por estatus_original).
        if (lead.estatus !== "CONCRETADO") Object.assign(campos, { estatus_original: lead.estatus_original ?? lead.estatus ?? "", estatus: "CONCRETADO" });
        if (campos.panel_monto != null) campos.monto = campos.panel_monto;
      } else {
        Object.assign(campos, deshacerConcretado);
      }
      await set(campos);
    }
  } else {
    throw new ErrorLeadExcel("No hay campos para actualizar");
  }

  const io = (globalThis as any).io;
  if (io) io.emit("leads-updated", { action: "PATCH", id, origen: "excel" });
}
