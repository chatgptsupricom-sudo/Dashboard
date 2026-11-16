// Cálculos automáticos de los KPIs por departamento del Stoplight (ver
// ./definiciones). Cada uno recibe la sede (o el company_id del país / del
// grupo, según el alcance del bloque) y el mes, y devuelve el valor del mes
// o null si no hay con qué calcularlo. Un error se lanza: ./datos lo
// muestra como aviso y la fila queda sin dato.

import { query } from "@/lib/db";
import { callOdooRPCEstricto } from "@/lib/odoo";
import { diaHabil } from "@/lib/rma/plazos";
import { reporte as reporteAsistencia } from "@/lib/asistencia/datos";
import { listarMatriz } from "@/lib/seleccion/datos";
import { calendario, type TipoEquipo } from "@/lib/mantenimiento/tipos";
import { asegurarTablas as asegurarTablasMantenimiento } from "@/lib/mantenimiento/datos";
import { ensurePresupuestoTable, fetchCuentasGasto, fetchGastoReal, rangoDelMes } from "@/lib/administracion/gastos";
import { notasOdooDelRango } from "@/lib/notas-credito/odoo";
import { ensureTablas as asegurarTablasNC } from "@/lib/notas-credito/datos";
import { calcularMetricas } from "@/lib/adminleads/metricas";
import { getCampaignMetrics } from "@/lib/campanas-meta";
import { CANALES_META, canalNormalizadoSql } from "@/lib/canales";
import { dominioVentas } from "@/lib/compras/datosOdoo";
import { esIntercompania } from "@/lib/administracion/intercompania";
import { CORTE_ODOO } from "@/lib/smartbit";

export interface ResultadoCalculo {
  valor: number | null;
  detalle?: string | null;
}

type Calculo = (companyId: number, mes: string) => Promise<ResultadoCalculo | null>;

// --- Fechas -----------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, "0");
/** Primer día del mes siguiente (YYYY-MM-DD). */
function mesSiguiente(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`;
}
/** Hoy en Caracas (YYYY-MM-DD). */
function hoyCaracas(): string {
  return new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
}
/** Fecha de Odoo (UTC, "YYYY-MM-DD HH:MM:SS") a Date. */
const deOdoo = (s: string) => new Date(`${String(s).replace(" ", "T").slice(0, 19)}Z`);

const redondear = (n: number, dec = 1) => Math.round(n * 10 ** dec) / 10 ** dec;
const fmt = (n: number) => new Intl.NumberFormat("es-VE", { maximumFractionDigits: 1 }).format(n);

async function leerTodo(model: string, domain: any[], fields: string[], companyIds: number[]): Promise<any[]> {
  let out: any[] = [];
  for (let offset = 0; ; offset += 2000) {
    const page =
      (await callOdooRPCEstricto<any[]>(model, "search_read", [domain], {
        fields,
        order: "id asc",
        limit: 2000,
        offset,
        context: { allowed_company_ids: companyIds },
      })) || [];
    out = out.concat(page);
    if (page.length < 2000) return out;
  }
}

// --- Logística ----------------------------------------------------------------

/**
 * Ciclo de RMA: días hábiles (el del ingreso es el 1) desde que el equipo
 * llegó hasta el día en que salió, de los casos de la sede despachados en el
 * mes. El reloj arranca en el ingreso de Seguridad, si no en la llegada, si
 * no en la creación del caso, y un reingreso lo reinicia (como lib/rma/plazos).
 */
const cicloRma: Calculo = async (companyId, mes) => {
  const desde = `${mes}-01`;
  const hasta = mesSiguiente(mes);
  const sql = (conIngresos: boolean) => `
    SELECT c.created_at, c.despachado_at,
           ${conIngresos ? "(SELECT MIN(si.created_at) FROM seguridad_ingresos si WHERE si.rma_case_id = c.id)" : "NULL"} AS ingreso_at,
           (SELECT MAX(h.created_at) FROM rma_history h WHERE h.case_id = c.id AND h.to_status = 'reingresado') AS reingreso_at,
           (SELECT MIN(h.created_at) FROM rma_history h WHERE h.case_id = c.id AND h.from_status = 'por_llegar') AS llegada_at
      FROM rma_cases c
     WHERE c.company_id = ? AND c.despachado_at >= ? AND c.despachado_at < ?`;
  let filas: any[];
  try {
    filas = (await query(sql(true), [companyId, desde, hasta])).rows as any[];
  } catch {
    // Bases sin seguridad_ingresos.rma_case_id.
    filas = (await query(sql(false), [companyId, desde, hasta])).rows as any[];
  }
  const dias: number[] = [];
  for (const f of filas) {
    const base = f.ingreso_at || f.llegada_at || f.created_at;
    if (!base || !f.despachado_at) continue;
    let inicio = new Date(base);
    if (f.reingreso_at && new Date(f.reingreso_at) > inicio) inicio = new Date(f.reingreso_at);
    // despachado_at es una fecha (sin hora): fin del día en Caracas, así un
    // caso que entra y sale el mismo día no queda "saliendo antes de entrar".
    const dia = f.despachado_at instanceof Date ? f.despachado_at.toISOString().slice(0, 10) : String(f.despachado_at).slice(0, 10);
    const salida = new Date(`${dia}T23:59:00-04:00`);
    if (salida < inicio) continue;
    dias.push(diaHabil(inicio, salida));
  }
  if (!dias.length) return { valor: null, detalle: "Sin casos despachados en el mes" };
  const prom = dias.reduce((a, b) => a + b, 0) / dias.length;
  const mas10 = dias.filter((d) => d > 10).length;
  const hasta3 = dias.filter((d) => d <= 3).length;
  return {
    valor: redondear(prom),
    detalle: `${dias.length} casos · ${hasta3} en 3 días o menos · ${mas10} con más de 10`,
  };
};

/**
 * Tiempo de despacho: por cada pedido de venta con factura publicada en el
 * mes, horas entre la creación de su primera factura y su primera entrega
 * validada (0 si salió antes de facturar). Uno que todavía no salió cuenta
 * hasta hoy o, en un mes cerrado, hasta el fin del mes: así el mes cerrado no
 * sigue cambiando.
 */
const tiempoDespacho: Calculo = async (companyId, mes) => {
  const desde = `${mes}-01`;
  const hasta = mesSiguiente(mes);
  const cids = [companyId];
  const facturas = await leerTodo(
    "account.move",
    [
      ["move_type", "=", "out_invoice"],
      ["state", "=", "posted"],
      ["company_id", "=", companyId],
      ["invoice_date", ">=", desde],
      ["invoice_date", "<", hasta],
    ],
    ["id", "create_date", "invoice_partner_display_name"],
    cids,
  );
  const deAfuera = facturas.filter((f) => !esIntercompania(f.invoice_partner_display_name));
  if (!deAfuera.length) return { valor: null, detalle: "Sin facturas en el mes" };
  const creada = new Map<number, Date>(deAfuera.map((f) => [f.id, deOdoo(f.create_date)]));

  const pedidos = await leerTodo(
    "sale.order",
    [["company_id", "=", companyId], ["invoice_ids", "in", [...creada.keys()]]],
    ["id", "invoice_ids", "picking_ids"],
    cids,
  );
  const pickingIds = pedidos.flatMap((p) => p.picking_ids || []);
  const entregas = pickingIds.length
    ? await leerTodo(
        "stock.picking",
        [["id", "in", pickingIds], ["picking_type_code", "=", "outgoing"], ["state", "!=", "cancel"]],
        ["id", "state", "date_done"],
        cids,
      )
    : [];
  const entregaPorId = new Map<number, any>(entregas.map((e) => [e.id, e]));

  const tope = Math.min(Date.now(), new Date(`${hasta}T00:00:00-04:00`).getTime());
  const horas: number[] = [];
  let pendientes = 0;
  for (const p of pedidos) {
    const misEntregas = (p.picking_ids || []).map((id: number) => entregaPorId.get(id)).filter(Boolean);
    if (!misEntregas.length) continue; // pedido sin entrega (servicios)
    const fechasFactura = (p.invoice_ids || [])
      .map((id: number) => creada.get(id))
      .filter((d: Date | undefined): d is Date => !!d);
    if (!fechasFactura.length) continue;
    const facturado = new Date(Math.min(...fechasFactura.map((d: Date) => d.getTime())));
    const hechas = misEntregas
      .filter((e: any) => e.state === "done" && e.date_done)
      .map((e: any) => deOdoo(e.date_done).getTime())
      .sort((a: number, b: number) => a - b);
    let salida: number;
    if (hechas.length) salida = hechas[0];
    else {
      salida = tope;
      pendientes++;
    }
    horas.push(Math.max(0, (salida - facturado.getTime()) / 3_600_000));
  }
  if (!horas.length) return { valor: null, detalle: "Sin pedidos facturados con entrega" };
  const prom = horas.reduce((a, b) => a + b, 0) / horas.length;
  const en48 = horas.filter((h) => h <= 48).length;
  return {
    valor: redondear(prom),
    detalle: `${horas.length} pedidos · ${en48} en 48 h o menos${pendientes ? ` · ${pendientes} sin despachar` : ""}`,
  };
};

// --- Auditoría ------------------------------------------------------------------

/** NC de cliente publicadas en el mes que salieron del flujo de aprobación del panel. */
const ncValidadas: Calculo = async (companyId, mes) => {
  const notas = (await notasOdooDelRango([companyId], `${mes}-01`, mesSiguiente(mes))).filter((n) => n.estado === "posted");
  if (!notas.length) return { valor: null, detalle: "Sin notas de crédito publicadas en el mes" };
  await asegurarTablasNC();
  const ids = notas.map((n) => n.id);
  const r = await query(
    `SELECT COUNT(DISTINCT odoo_move_id) AS n FROM nc_solicitudes WHERE odoo_move_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  const enFlujo = Number((r.rows as any[])[0]?.n) || 0;
  return { valor: redondear((enFlujo / notas.length) * 100), detalle: `${enFlujo} de ${notas.length} notas de crédito por el flujo` };
};

// --- Recursos Humanos -----------------------------------------------------------

/** Ausencias ÷ días laborables evaluados del biométrico (hasta ayer en el mes en curso). */
const ausentismo: Calculo = async (companyId, mes) => {
  const { desde, hasta } = rangoDelMes(mes);
  const hoy = hoyCaracas();
  if (desde > hoy) return null;
  const fin = hasta < hoy ? hasta : hoy;
  const rep = await reporteAsistencia(companyId, desde, fin);
  let laborables = 0;
  let ausencias = 0;
  for (const e of rep.empleados) {
    laborables += e.laborables;
    ausencias += e.ausencias;
  }
  if (!laborables) return { valor: null, detalle: "Sin marcas del biométrico cargadas para el mes" };
  return {
    valor: redondear((ausencias / laborables) * 100),
    detalle: `${ausencias} ausencias en ${laborables} días laborables · ${rep.empleados.length} empleados`,
  };
};

/** Días de cobertura de las requisiciones de la sede cubiertas en el mes. */
const diasVacante: Calculo = async (companyId, mes) => {
  const { requisiciones, candidatos } = await listarMatriz();
  const dias: number[] = [];
  for (const r of requisiciones) {
    if (Number(r.sede) !== companyId) continue;
    const contratados = candidatos.filter((c) => c.requisicion_id === r.id && c.estatus === "contratado" && c.fecha_ingreso);
    if (contratados.length < Math.max(1, r.vacantes)) continue;
    const ultimo = contratados.map((c) => String(c.fecha_ingreso)).sort().pop()!;
    if (!ultimo.startsWith(mes) || !r.fecha_recepcion) continue;
    const d = Math.round((Date.parse(`${ultimo}T00:00:00Z`) - Date.parse(`${String(r.fecha_recepcion).slice(0, 10)}T00:00:00Z`)) / 86_400_000);
    if (Number.isFinite(d) && d >= 0) dias.push(d);
  }
  if (!dias.length) return { valor: null, detalle: "Ninguna requisición cubierta en el mes" };
  return { valor: redondear(dias.reduce((a, b) => a + b, 0) / dias.length), detalle: `${dias.length} requisiciones cubiertas` };
};

// --- Servicios Generales --------------------------------------------------------

/**
 * Servicios del plan de mantenimiento al día ÷ servicios del plan, de las
 * unidades activas de la sede. El calendario es del medidor de hoy: solo se
 * calcula en el mes en curso.
 */
const mantenimientoPreventivo: Calculo = async (companyId, mes) => {
  if (!hoyCaracas().startsWith(mes)) return { valor: null, detalle: "Solo se calcula en el mes en curso (es del kilometraje de hoy)" };
  await asegurarTablasMantenimiento();
  const r = await query(
    "SELECT tipo, medidor, servicios_json FROM mantenimiento_equipos WHERE activo = 1 AND cids = ?",
    [companyId],
  );
  let total = 0;
  let vencidos = 0;
  let unidades = 0;
  for (const f of r.rows as any[]) {
    let servicios: Record<string, number> | null = null;
    try {
      const crudo = f.servicios_json ? JSON.parse(String(f.servicios_json)) : null;
      if (crudo && typeof crudo === "object" && !Array.isArray(crudo)) servicios = crudo;
    } catch {
      servicios = null;
    }
    const medidor = f.medidor === null || f.medidor === undefined ? null : Number(f.medidor);
    const items = calendario({ tipo: f.tipo as TipoEquipo, medidor, servicios: servicios as any });
    if (!items.length) continue;
    unidades++;
    total += items.length;
    vencidos += items.filter((i) => i.estado === "vencido").length;
  }
  if (!total) return { valor: null, detalle: "Sin unidades con kilometraje anotado" };
  return {
    valor: redondear(((total - vencidos) / total) * 100),
    detalle: `${vencidos} servicios vencidos de ${total} · ${unidades} unidades`,
  };
};

/** Gasto real ÷ presupuesto del mes (Gastos y Presupuesto de Administración). */
const gastoPresupuesto: Calculo = async (companyId, mes) => {
  // En el mes en curso, contra el presupuesto prorrateado a los días que van.
  if (mesSiguiente(mes) <= CORTE_ODOO) return null; // antes de Odoo no hay gasto
  await ensurePresupuestoTable();
  const pres = await query(
    "SELECT COALESCE(SUM(monto), 0) AS monto FROM presupuesto_gastos WHERE company_id = ? AND mes = ? AND monto > 0",
    [companyId, mes],
  );
  const presupuesto = Number((pres.rows as any[])[0]?.monto) || 0;
  if (presupuesto <= 0) return { valor: null, detalle: "Sin presupuesto cargado para el mes" };
  const cuentas = await fetchCuentasGasto([companyId]);
  const { desde, hasta } = rangoDelMes(mes);
  const { porCuenta } = await fetchGastoReal([companyId], desde, hasta, cuentas);
  const real = Object.values(porCuenta).reduce((s, v) => s + v, 0);
  const hoy = hoyCaracas();
  const diasMes = Number(hasta.slice(8, 10));
  const fraccion = hoy.startsWith(mes) ? Math.max(1, Number(hoy.slice(8, 10))) / diasMes : 1;
  const esperado = presupuesto * fraccion;
  return {
    valor: redondear((real / esperado) * 100),
    detalle: `$${fmt(real)} de $${fmt(presupuesto)} presupuestados${fraccion < 1 ? ` ($${fmt(esperado)} a la fecha)` : ""}`,
  };
};

// --- Marketing (por país: 9 = Venezuela, 7 = Panamá) ---------------------------

const cacheLeads = new Map<string, Promise<any>>();
/** Tarjetas del Dashboard de Leads del mes para el país (una lectura para varios KPIs). */
function metricasLeads(pais: number, mes: string): Promise<any> {
  const k = `${pais}|${mes}`;
  let p = cacheLeads.get(k);
  if (!p) {
    const { desde, hasta } = rangoDelMes(mes);
    const sp = new URLSearchParams({ fecha_inicio: desde, fecha_fin: hasta });
    p = calcularMetricas({ cids: pais === 7 ? 7 : 9 }, sp).then((r) => r.stats);
    cacheLeads.set(k, p);
    p.catch(() => cacheLeads.delete(k));
    setTimeout(() => cacheLeads.delete(k), 60_000);
  }
  return p;
}

const cacheMeta = new Map<string, Promise<any>>();
/** Resumen de campañas de Meta del mes para el país. */
function resumenMeta(pais: number, mes: string): Promise<any> {
  const k = `${pais}|${mes}`;
  let p = cacheMeta.get(k);
  if (!p) {
    const { desde, hasta } = rangoDelMes(mes);
    p = getCampaignMetrics({ userCids: pais === 7 ? 7 : 9, sede: null, fechaInicio: desde, fechaFin: hasta }).then((r) => r.summary);
    cacheMeta.set(k, p);
    p.catch(() => cacheMeta.delete(k));
    setTimeout(() => cacheMeta.delete(k), 60_000);
  }
  return p;
}

const ventasLeads: Calculo = async (pais, mes) => {
  const s = await metricasLeads(pais, mes);
  const monto = Number(s?.monto_total) || 0;
  return { valor: Math.round(monto), detalle: `${Number(s?.total_ventas) || 0} ventas cerradas` };
};

/** Misma cohorte arriba y abajo: de los leads que entraron en el mes, los vendidos. */
const conversionLeads: Calculo = async (pais, mes) => {
  const s = await metricasLeads(pais, mes);
  const leads = Number(s?.total_leads) || 0;
  const ventas = Number(s?.ventas_del_mes) || 0;
  if (!leads) return { valor: null, detalle: "Sin leads en el mes" };
  return { valor: redondear((ventas / leads) * 100), detalle: `${ventas} vendidos de ${leads} leads del mes` };
};

const leadsCalificados: Calculo = async (pais, mes) => {
  const s = await resumenMeta(pais, mes);
  const si = Number(s?.total_calificados) || 0;
  const no = Number(s?.total_no_calificados) || 0;
  // Sin ninguna conversación calificada (o sin la tabla) no hay de dónde contar.
  if (!si && !no) return { valor: null, detalle: "Sin conversaciones calificadas en el mes" };
  return { valor: si, detalle: `${no} no calificados` };
};

const tasaCalificacion: Calculo = async (pais, mes) => {
  const s = await resumenMeta(pais, mes);
  const si = Number(s?.total_calificados) || 0;
  const no = Number(s?.total_no_calificados) || 0;
  if (!si && !no) return { valor: null, detalle: "Sin conversaciones calificadas en el mes" };
  return { valor: redondear((si / (si + no)) * 100), detalle: `${si} de ${si + no} conversaciones` };
};

const costoLeadCalificado: Calculo = async (pais, mes) => {
  const s = await resumenMeta(pais, mes);
  const gasto = Number(s?.total_spend) || 0;
  const calificados = Number(s?.total_calificados) || 0;
  // Gasto 0 = Meta no respondió (getCampaignMetrics se traga el error) o no
  // hubo campañas: no es "costo 0".
  if (gasto <= 0) return { valor: null, detalle: "Sin inversión de Meta leída para el mes" };
  if (!calificados) return { valor: null, detalle: gasto ? `$${fmt(gasto)} invertidos sin leads calificados` : "Sin inversión ni leads calificados" };
  return { valor: Math.round((gasto / calificados) * 100) / 100, detalle: `$${fmt(gasto)} ÷ ${calificados} calificados` };
};

/** Leads cerrados como venta en el mes que tienen campaña ÷ cerrados como venta. */
const atribucion: Calculo = async (pais, mes) => {
  const { desde, hasta } = rangoDelMes(mes);
  const filtroPais =
    pais === 7
      ? "l.seller_id IN (SELECT id FROM sellers WHERE cids = 7)"
      : "(l.seller_id IS NULL OR l.seller_id NOT IN (SELECT id FROM sellers WHERE cids = 7))";
  const r = await query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN l.campana IS NOT NULL AND TRIM(l.campana) <> '' THEN 1 ELSE 0 END) AS con_campana
       FROM leads l
      WHERE l.status = 'CERRADO' AND l.motivo_cierre IN ('VENTA', 'GANADO')
        AND l.fecha_venta BETWEEN ? AND ?
        AND ${canalNormalizadoSql("l.canal_origen")} IN (${CANALES_META.map((c) => `'${c}'`).join(", ")})
        AND ${filtroPais}`,
    [`${desde} 00:00:00`, `${hasta} 23:59:59`],
  );
  const fila = (r.rows as any[])[0] || {};
  const total = Number(fila.total) || 0;
  const con = Number(fila.con_campana) || 0;
  if (!total) return { valor: null, detalle: "Sin ventas de leads de Meta en el mes" };
  return { valor: redondear((con / total) * 100), detalle: `${con} de ${total} ventas con campaña` };
};

// --- Expansión (global) ----------------------------------------------------------

const RE_ESTADO_CON_SEDE = /carabobo|capital|miranda/i;
const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Ventas en USD sin IVA (sin intercompañía) a clientes de estados sin sede, Valencia + Caracas. */
async function ventasEstadosSinSede(desde: string, hastaIncl: string): Promise<{ total: number; porEstado: Map<string, number> }> {
  const porPartner = new Map<number, number>();
  for (const cid of [9, 10]) {
    const grupos =
      (await callOdooRPCEstricto<any[]>(
        "account.move.line",
        "read_group",
        [[...(await dominioVentas(cid)), ["invoice_date", ">=", desde], ["invoice_date", "<=", hastaIncl]], ["balance:sum"], ["partner_id"]],
        { lazy: false, context: { allowed_company_ids: [cid] } },
      )) || [];
    for (const g of grupos) {
      const id = Array.isArray(g.partner_id) ? g.partner_id[0] : null;
      if (!id) continue;
      porPartner.set(id, (porPartner.get(id) || 0) - Number(g.balance || 0));
    }
  }
  const ids = [...porPartner.keys()];
  const partners = ids.length
    ? (await callOdooRPCEstricto<any[]>("res.partner", "read", [ids, ["state_id", "commercial_partner_id"]], {
        context: { active_test: false },
      })) || []
    : [];
  const comerciales = [
    ...new Set(partners.filter((p) => !p.state_id && Array.isArray(p.commercial_partner_id)).map((p) => p.commercial_partner_id[0])),
  ];
  const estadoComercial = new Map<number, string>();
  if (comerciales.length) {
    const cs = (await callOdooRPCEstricto<any[]>("res.partner", "read", [comerciales, ["state_id"]], { context: { active_test: false } })) || [];
    for (const c of cs) if (Array.isArray(c.state_id)) estadoComercial.set(c.id, String(c.state_id[1]));
  }
  const porEstado = new Map<string, number>();
  let total = 0;
  for (const p of partners) {
    const estado = Array.isArray(p.state_id)
      ? String(p.state_id[1])
      : Array.isArray(p.commercial_partner_id)
      ? estadoComercial.get(p.commercial_partner_id[0])
      : undefined;
    if (!estado) continue; // sin estado no se sabe si tiene sede
    const limpio = sinAcentos(estado).replace(/\s*\(.*\)\s*$/, "").trim();
    if (RE_ESTADO_CON_SEDE.test(limpio)) continue;
    const monto = porPartner.get(p.id) || 0;
    total += monto;
    porEstado.set(limpio, (porEstado.get(limpio) || 0) + monto);
  }
  return { total, porEstado };
}

/**
 * Crecimiento de lo que va del trimestre contra el mismo tramo del trimestre
 * anterior (mismos días desde el inicio de cada uno).
 */
const crecimientoEstadosSinSede: Calculo = async (_cid, mes) => {
  const [y, m] = mes.split("-").map(Number);
  const qIni = Math.floor((m - 1) / 3) * 3 + 1;
  const inicio = new Date(Date.UTC(y, qIni - 1, 1));
  const finMes = new Date(Date.UTC(y, m, 0));
  const hoy = new Date(`${hoyCaracas()}T00:00:00Z`);
  if (hoy < inicio) return null;
  const fin = finMes < hoy ? finMes : hoy;
  // Mismo tramo del trimestre anterior, mes por mes: el mismo día del mes
  // correspondiente (o su último día, si es más corto o si el mes ya cerró).
  const inicioPrev = new Date(Date.UTC(y, qIni - 4, 1));
  const mesEnTrimestre = fin.getUTCMonth() - (qIni - 1);
  const ultimoPrev = new Date(Date.UTC(y, qIni - 4 + mesEnTrimestre + 1, 0)).getUTCDate();
  const finEsFinDeMes = fin.getUTCDate() === new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0)).getUTCDate();
  const finPrev = new Date(Date.UTC(y, qIni - 4 + mesEnTrimestre, finEsFinDeMes ? ultimoPrev : Math.min(fin.getUTCDate(), ultimoPrev)));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (iso(inicioPrev) < CORTE_ODOO) return { valor: null, detalle: "El trimestre anterior es de antes de Odoo (sin estado del cliente)" };

  const [act, prev] = await Promise.all([ventasEstadosSinSede(iso(inicio), iso(fin)), ventasEstadosSinSede(iso(inicioPrev), iso(finPrev))]);
  if (prev.total <= 0) return { valor: null, detalle: "Sin ventas en estados sin sede el trimestre anterior" };
  const top = [...act.porEstado.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([e]) => e)
    .join(", ");
  return {
    valor: redondear(((act.total - prev.total) / prev.total) * 100),
    detalle: `$${fmt(act.total)} vs $${fmt(prev.total)} (${iso(inicio)}–${iso(fin)} vs ${iso(inicioPrev)}–${iso(finPrev)})${top ? ` · más: ${top}` : ""}`,
  };
};

export const CALCULOS: Record<string, Calculo> = {
  log_ciclo_rma: cicloRma,
  log_tiempo_despacho: tiempoDespacho,
  aud_nc_validadas: ncValidadas,
  rrhh_ausentismo: ausentismo,
  rrhh_dias_vacante: diasVacante,
  sg_mantenimiento_preventivo: mantenimientoPreventivo,
  sg_gasto_presupuesto: gastoPresupuesto,
  mkt_ventas_leads: ventasLeads,
  mkt_leads_calificados: leadsCalificados,
  mkt_conversion: conversionLeads,
  mkt_tasa_calificacion: tasaCalificacion,
  mkt_costo_lead_calificado: costoLeadCalificado,
  mkt_atribucion: atribucion,
  bi_crecimiento_estados_sin_sede: crecimientoEstadosSinSede,
};

