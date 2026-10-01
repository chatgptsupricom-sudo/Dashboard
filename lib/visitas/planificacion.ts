import { query } from "@/lib/db";

/**
 * Planificación de rutas y visitas (formato PL-CAP-01 del gerente de ventas) y
 * el KPI "Cobertura territorial" de la tabla de KPIs de Ventas:
 *
 *   cobertura territorial = visitas foráneas realizadas ÷ visitas foráneas planificadas
 *
 * (peso 8%, mínimo 70% desde oct-2026). Cada asesor carga su plan semanal:
 * encabezado (semana, zona/ruta, marcas priorizadas), la matriz de ponderación
 * de productos y el cronograma lunes–viernes mañana/tarde (meta ≥ 7 visitas).
 * La gerencia marca cada visita como realizada / no realizada; al marcarla
 * realizada se registra también en `weekly_visits`, así "Visitas" y el
 * detalle de visitas del Stoplight siguen cuadrando.
 *
 * Solo cuentan para el KPI las visitas planificadas hasta hoy (una visita de
 * mañana todavía no se puede haber hecho).
 */

export const CRITERIOS_MATRIZ = [
  { clave: "baja_rotacion", criterio: "Prioridad 1: Baja rotación / Inventario detenido", peso: 35 },
  { clave: "producto_nuevo", criterio: "Prioridad 2: Producto nuevo / Entrante", peso: 25 },
  { clave: "necesidad_cliente", criterio: "Prioridad 3: Necesidad detectada en clientes", peso: 20 },
  { clave: "complejidad_tecnica", criterio: "Complejidad técnica: Demostración / Configuración", peso: 10 },
  { clave: "marcas_clave", criterio: "Importancia estratégica: Marcas clave", peso: 10 },
] as const;

export const META_VISITAS_SEMANA = 7;

export type Bloque = "manana" | "tarde";
export type EstadoVisita = "planificada" | "realizada" | "no_realizada";

export interface FilaMatriz {
  clave: string;
  candidatos: string;
  puntaje: string;
  estatus: string;
}

export interface ItemPlan {
  id?: number;
  fecha: string; // YYYY-MM-DD
  bloque: Bloque;
  zona: string;
  cliente: string;
  tema: string;
  objetivo: string;
  foranea: boolean;
  estado: EstadoVisita;
  nota: string;
}

export interface Plan {
  id?: number;
  companyId: number;
  userId: number;
  vendedor: string;
  semanaInicio: string; // lunes, YYYY-MM-DD
  semanaNumero: number;
  zonaRuta: string;
  marcasPriorizadas: string;
  matriz: FilaMatriz[];
  items: ItemPlan[];
  actualizadoPor?: string | null;
  actualizadoEl?: string | null;
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const aFecha = (v: any): string => (v instanceof Date ? ymd(v) : String(v).slice(0, 10));

/** Lunes de la semana de una fecha "YYYY-MM-DD". */
export function lunesDe(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const f = new Date(y, m - 1, d);
  f.setDate(f.getDate() - ((f.getDay() + 6) % 7));
  return ymd(f);
}

/** Número de semana ISO. */
export function semanaISO(fecha: string): number {
  const [y, m, d] = fecha.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  const dia = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - dia);
  const inicioAnio = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return Math.ceil(((t.getTime() - inicioAnio.getTime()) / 86400000 + 1) / 7);
}

let tablasListas = false;
export async function asegurarTablasPlanificacion() {
  if (tablasListas) return;
  await query(
    `CREATE TABLE IF NOT EXISTS visit_plans (
      id INT AUTO_INCREMENT PRIMARY KEY,
      company_id INT NOT NULL,
      user_id INT NOT NULL,
      seller_name VARCHAR(255) NOT NULL,
      semana_inicio DATE NOT NULL,
      semana_numero INT NOT NULL,
      zona_ruta VARCHAR(255) NULL,
      marcas_priorizadas VARCHAR(500) NULL,
      matriz JSON NULL,
      updated_by VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_plan_semana (company_id, user_id, semana_inicio)
    )`,
    [],
  );
  await query(
    `CREATE TABLE IF NOT EXISTS visit_plan_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      plan_id INT NOT NULL,
      fecha DATE NOT NULL,
      bloque VARCHAR(10) NOT NULL,
      zona VARCHAR(255) NULL,
      cliente VARCHAR(255) NOT NULL,
      tema VARCHAR(255) NULL,
      objetivo VARCHAR(500) NULL,
      foranea TINYINT(1) NOT NULL DEFAULT 1,
      estado VARCHAR(20) NOT NULL DEFAULT 'planificada',
      nota VARCHAR(500) NULL,
      weekly_visit_id INT NULL,
      marcada_por VARCHAR(255) NULL,
      marcada_at TIMESTAMP NULL,
      KEY idx_plan (plan_id),
      KEY idx_fecha (fecha)
    )`,
    [],
  );
  tablasListas = true;
}

const matrizVacia = (): FilaMatriz[] => CRITERIOS_MATRIZ.map((c) => ({ clave: c.clave, candidatos: "", puntaje: "", estatus: "" }));

function normalizarMatriz(raw: any): FilaMatriz[] {
  let arr: any[] = [];
  try { arr = typeof raw === "string" ? JSON.parse(raw) : Array.isArray(raw) ? raw : []; } catch { arr = []; }
  return CRITERIOS_MATRIZ.map((c) => {
    const f = arr.find((x) => x?.clave === c.clave) || {};
    return { clave: c.clave, candidatos: String(f.candidatos || ""), puntaje: String(f.puntaje || ""), estatus: String(f.estatus || "") };
  });
}

export async function leerPlan(companyId: number, userId: number, semanaInicio: string): Promise<Plan | null> {
  await asegurarTablasPlanificacion();
  const r = await query(
    "SELECT * FROM visit_plans WHERE company_id = ? AND user_id = ? AND semana_inicio = ? LIMIT 1",
    [companyId, userId, semanaInicio],
  );
  const p = (r.rows as any[])[0];
  if (!p) return null;
  const it = await query("SELECT * FROM visit_plan_items WHERE plan_id = ? ORDER BY fecha, bloque", [p.id]);
  return {
    id: p.id,
    companyId: p.company_id,
    userId: p.user_id,
    vendedor: p.seller_name,
    semanaInicio: aFecha(p.semana_inicio),
    semanaNumero: p.semana_numero,
    zonaRuta: p.zona_ruta || "",
    marcasPriorizadas: p.marcas_priorizadas || "",
    matriz: normalizarMatriz(p.matriz),
    items: (it.rows as any[]).map((x) => ({
      id: x.id,
      fecha: aFecha(x.fecha),
      bloque: x.bloque === "tarde" ? "tarde" : "manana",
      zona: x.zona || "",
      cliente: x.cliente || "",
      tema: x.tema || "",
      objetivo: x.objetivo || "",
      foranea: !!x.foranea,
      estado: (["realizada", "no_realizada"].includes(x.estado) ? x.estado : "planificada") as EstadoVisita,
      nota: x.nota || "",
    })),
    actualizadoPor: p.updated_by,
    actualizadoEl: p.updated_at ? new Date(p.updated_at).toISOString() : null,
  };
}

export function planVacio(companyId: number, userId: number, vendedor: string, semanaInicio: string): Plan {
  return {
    companyId, userId, vendedor, semanaInicio,
    semanaNumero: semanaISO(semanaInicio),
    zonaRuta: "", marcasPriorizadas: "", matriz: matrizVacia(), items: [],
  };
}

/**
 * Guarda encabezado, matriz y cronograma. Los ítems se reemplazan, pero el
 * estado (realizada / no realizada) solo lo cambia `marcarVisita`: aquí se
 * conserva el de los ítems existentes y un ítem ya realizado no se puede
 * borrar ni mover (su visita ya está registrada).
 */
export async function guardarPlan(plan: Plan, usuario: string): Promise<number> {
  await asegurarTablasPlanificacion();
  const semanaFin = (() => {
    const [y, m, d] = plan.semanaInicio.split("-").map(Number);
    return ymd(new Date(y, m - 1, d + 6));
  })();
  await query(
    `INSERT INTO visit_plans (company_id, user_id, seller_name, semana_inicio, semana_numero, zona_ruta, marcas_priorizadas, matriz, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE seller_name = VALUES(seller_name), semana_numero = VALUES(semana_numero), zona_ruta = VALUES(zona_ruta),
       marcas_priorizadas = VALUES(marcas_priorizadas), matriz = VALUES(matriz), updated_by = VALUES(updated_by)`,
    [plan.companyId, plan.userId, plan.vendedor, plan.semanaInicio, plan.semanaNumero || semanaISO(plan.semanaInicio),
     plan.zonaRuta.slice(0, 255), plan.marcasPriorizadas.slice(0, 500), JSON.stringify(normalizarMatriz(plan.matriz)), usuario],
  );
  const r = await query(
    "SELECT id FROM visit_plans WHERE company_id = ? AND user_id = ? AND semana_inicio = ?",
    [plan.companyId, plan.userId, plan.semanaInicio],
  );
  const planId = Number((r.rows as any[])[0].id);

  const existentes = await query("SELECT id, estado FROM visit_plan_items WHERE plan_id = ?", [planId]);
  const estadoDe = new Map<number, string>((existentes.rows as any[]).map((x) => [Number(x.id), x.estado]));
  const conservar = new Set<number>();

  for (const it of plan.items) {
    if (!it.cliente.trim()) continue;
    if (it.fecha < plan.semanaInicio || it.fecha > semanaFin) continue;
    const valores = [it.fecha, it.bloque === "tarde" ? "tarde" : "manana", it.zona.slice(0, 255), it.cliente.slice(0, 255),
      it.tema.slice(0, 255), it.objetivo.slice(0, 500), it.foranea ? 1 : 0];
    if (it.id && estadoDe.has(it.id)) {
      conservar.add(it.id);
      // Una visita ya realizada queda como está.
      if (estadoDe.get(it.id) === "realizada") continue;
      await query(
        "UPDATE visit_plan_items SET fecha = ?, bloque = ?, zona = ?, cliente = ?, tema = ?, objetivo = ?, foranea = ? WHERE id = ? AND plan_id = ?",
        [...valores, it.id, planId],
      );
    } else {
      await query(
        "INSERT INTO visit_plan_items (plan_id, fecha, bloque, zona, cliente, tema, objetivo, foranea) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [planId, ...valores],
      );
    }
  }
  for (const [id, estado] of estadoDe) {
    if (!conservar.has(id) && estado !== "realizada") await query("DELETE FROM visit_plan_items WHERE id = ?", [id]);
  }
  return planId;
}

/**
 * Marca una visita (solo gerencia). "realizada" la registra en
 * `weekly_visits`; volver a "planificada"/"no_realizada" borra ese registro.
 */
export async function marcarVisita(itemId: number, estado: EstadoVisita, nota: string, usuario: string, usuarioId: number, companyIdPermitida: number | null) {
  await asegurarTablasPlanificacion();
  const r = await query(
    `SELECT i.*, p.company_id, p.seller_name FROM visit_plan_items i JOIN visit_plans p ON p.id = i.plan_id WHERE i.id = ?`,
    [itemId],
  );
  const it = (r.rows as any[])[0];
  if (!it) throw new Error("NO_ENCONTRADA");
  if (companyIdPermitida != null && Number(it.company_id) !== companyIdPermitida) throw new Error("OTRA_SEDE");

  // Misma definición que app/api/superadmin/stoplight/weekly-visits.
  await query(
    `CREATE TABLE IF NOT EXISTS weekly_visits (
      id INT AUTO_INCREMENT PRIMARY KEY,
      seller_name VARCHAR(255) NOT NULL,
      client_name VARCHAR(255) NOT NULL,
      is_prospect TINYINT(1) DEFAULT 0,
      visit_date DATE NOT NULL,
      photo_url TEXT,
      company_id INT NOT NULL,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`,
    [],
  );
  let weeklyVisitId: number | null = it.weekly_visit_id ? Number(it.weekly_visit_id) : null;
  if (estado === "realizada" && !weeklyVisitId) {
    const ins: any = await query(
      "INSERT INTO weekly_visits (seller_name, client_name, is_prospect, visit_date, company_id, created_by) VALUES (?, ?, 0, ?, ?, ?)",
      [it.seller_name, it.cliente, aFecha(it.fecha), it.company_id, usuarioId],
    );
    weeklyVisitId = Number(ins?.rows?.insertId ?? ins?.insertId ?? 0) || null;
  }
  if (estado !== "realizada" && weeklyVisitId) {
    await query("DELETE FROM weekly_visits WHERE id = ?", [weeklyVisitId]);
    weeklyVisitId = null;
  }
  await query(
    "UPDATE visit_plan_items SET estado = ?, nota = ?, weekly_visit_id = ?, marcada_por = ?, marcada_at = CURRENT_TIMESTAMP WHERE id = ?",
    [estado, nota.slice(0, 500), weeklyVisitId, usuario, itemId],
  );
}

export interface ResumenAsesor {
  userId: number;
  vendedor: string;
  planes: number;
  planificadas: number;
  foraneasPlanificadas: number;
  /** Foráneas con fecha hasta hoy: el denominador del KPI. */
  foraneasVencidas: number;
  foraneasRealizadas: number;
  realizadas: number;
  noRealizadas: number;
  cobertura: number | null;
}

/** Ítems de planes con fecha en el rango (opcionalmente de un asesor). */
export async function itemsDelRango(companyId: number, desde: string, hasta: string, userId?: number) {
  await asegurarTablasPlanificacion();
  const r = await query(
    `SELECT i.fecha, i.estado, i.foranea, p.user_id, p.seller_name, p.id AS plan_id
       FROM visit_plan_items i JOIN visit_plans p ON p.id = i.plan_id
      WHERE p.company_id = ? AND i.fecha >= ? AND i.fecha <= ?${userId ? " AND p.user_id = ?" : ""}`,
    userId ? [companyId, desde, hasta, userId] : [companyId, desde, hasta],
  );
  return (r.rows as any[]).map((x) => ({
    fecha: aFecha(x.fecha),
    estado: String(x.estado),
    foranea: !!x.foranea,
    userId: Number(x.user_id),
    vendedor: String(x.seller_name),
    planId: Number(x.plan_id),
  }));
}

export async function resumenPorAsesor(companyId: number, desde: string, hasta: string, hoy = new Date()): Promise<ResumenAsesor[]> {
  const hoyStr = ymd(hoy);
  const items = await itemsDelRango(companyId, desde, hasta);
  const m = new Map<number, ResumenAsesor & { planIds: Set<number> }>();
  for (const it of items) {
    if (!m.has(it.userId)) {
      m.set(it.userId, { userId: it.userId, vendedor: it.vendedor, planes: 0, planificadas: 0, foraneasPlanificadas: 0,
        foraneasVencidas: 0, foraneasRealizadas: 0, realizadas: 0, noRealizadas: 0, cobertura: null, planIds: new Set() });
    }
    const a = m.get(it.userId)!;
    a.planIds.add(it.planId);
    a.planificadas++;
    if (it.estado === "realizada") a.realizadas++;
    if (it.estado === "no_realizada") a.noRealizadas++;
    if (it.foranea) {
      a.foraneasPlanificadas++;
      if (it.fecha <= hoyStr) a.foraneasVencidas++;
      if (it.estado === "realizada") a.foraneasRealizadas++;
    }
  }
  return [...m.values()].map(({ planIds, ...a }) => ({
    ...a,
    planes: planIds.size,
    cobertura: a.foraneasVencidas > 0 ? Math.round((a.foraneasRealizadas / a.foraneasVencidas) * 100) : null,
  })).sort((a, b) => a.vendedor.localeCompare(b.vendedor));
}

/**
 * Cobertura territorial por semana del Stoplight y del mes: foráneas
 * realizadas ÷ foráneas planificadas con fecha hasta hoy. `null` en la
 * semana si no había nada planificado (o es futura). Devuelve `null` entero
 * si el período no tiene planes (el KPI sigue con "visitas semanales").
 */
export async function coberturaTerritorial(
  companyId: number,
  desde: string,
  hasta: string,
  semanas: { inicio: Date; fin: Date }[],
  userId?: number,
  hoy = new Date(),
): Promise<{ semanas: (number | null)[]; mes: number | null; planificadas: number; realizadas: number } | null> {
  const items = (await itemsDelRango(companyId, desde, hasta, userId)).filter((i) => i.foranea);
  if (items.length === 0) return null;
  const hoyStr = ymd(hoy);
  const vencidas = items.filter((i) => i.fecha <= hoyStr);
  const pct = (xs: typeof items) => {
    const v = xs.filter((i) => i.fecha <= hoyStr);
    return v.length > 0 ? Math.round((v.filter((i) => i.estado === "realizada").length / v.length) * 100) : null;
  };
  return {
    semanas: semanas.map((s) => {
      if (s.inicio > hoy) return null;
      const a = ymd(s.inicio), b = ymd(s.fin);
      return pct(items.filter((i) => i.fecha >= a && i.fecha <= b));
    }),
    mes: pct(items),
    planificadas: vencidas.length,
    realizadas: vencidas.filter((i) => i.estado === "realizada").length,
  };
}
