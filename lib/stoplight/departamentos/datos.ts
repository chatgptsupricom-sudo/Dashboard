// Lectura de los KPIs por departamento del Stoplight: metas y pesos de
// kpi_targets, cargas a mano (stoplight_valores_manuales) y los cálculos
// automáticos (./calculos). Ver ./definiciones.

import { query } from "@/lib/db";
import { ensureKpiTargetsPeso, pesoDeFila } from "@/lib/kpiTargets";
import {
  BLOQUES,
  COMPANY_GLOBAL,
  companyDeBloque,
  defKpi,
  fraccionDelPeriodo,
  mesesDelPeriodo,
  type DefKpi,
  type Fuente,
  type Periodo,
  type Sentido,
  type Unidad,
} from "./definiciones";
import { CALCULOS, type ResultadoCalculo } from "./calculos";

export interface KpiDepto {
  key: string;
  titulo: string;
  descripcion: string;
  unidad: Unidad;
  sentido: Sentido;
  fuente: Fuente;
  acumula: Periodo | null;
  meta: number;
  peso: number;
  /** Valor del KPI (del período si `acumula`); null = sin dato. */
  valor: number | null;
  /** De dónde salió el valor. */
  origen: "auto" | "manual" | null;
  /** Lo que daba el cálculo automático (aunque una carga a mano lo reemplace). */
  valorAuto: number | null;
  /** Carga a mano del mes (no la suma del período). */
  manualMes: { valor: number; nota: string | null; por: string | null; el: string | null } | null;
  /** Con `acumula`: lo esperado a la fecha (meta × parte del período corrida) y el % de eso. */
  esperado: number | null;
  pctEsperado: number | null;
  /** Texto corto con de qué sale el número (ej. "12 de 15 entregas"). */
  detalle: string | null;
}

export interface BloqueDepto {
  id: string;
  titulo: string;
  alcance: "sede" | "pais" | "global";
  kpis: KpiDepto[];
}

let tablaLista = false;
export async function asegurarTablaManuales(): Promise<void> {
  if (tablaLista) return;
  await query(`CREATE TABLE IF NOT EXISTS stoplight_valores_manuales (
    kpi_key VARCHAR(100) NOT NULL,
    company_id INT NOT NULL,
    mes VARCHAR(7) NOT NULL,
    valor DECIMAL(16,4) NOT NULL,
    nota VARCHAR(500) NULL,
    actualizado_por VARCHAR(190) NULL,
    actualizado_el DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (kpi_key, company_id, mes)
  )`);
  tablaLista = true;
}

/** Guarda (o borra, con `valor` null) la carga a mano de un KPI en un mes. */
export async function guardarManual(
  key: string,
  companyId: number,
  mes: string,
  valor: number | null,
  nota: string | null,
  usuario: string | null,
): Promise<void> {
  await asegurarTablaManuales();
  if (valor === null) {
    await query("DELETE FROM stoplight_valores_manuales WHERE kpi_key = ? AND company_id = ? AND mes = ?", [key, companyId, mes]);
    return;
  }
  await query(
    `INSERT INTO stoplight_valores_manuales (kpi_key, company_id, mes, valor, nota, actualizado_por, actualizado_el)
     VALUES (?, ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), nota = VALUES(nota),
       actualizado_por = VALUES(actualizado_por), actualizado_el = NOW()`,
    [key, companyId, mes, valor, nota, usuario],
  );
}

interface FilaManual {
  kpi_key: string;
  company_id: number;
  mes: string;
  valor: number;
  nota: string | null;
  actualizado_por: string | null;
  actualizado_el: string | null;
}

async function leerManuales(companyIds: number[], meses: string[]): Promise<FilaManual[]> {
  await asegurarTablaManuales();
  if (!companyIds.length || !meses.length) return [];
  const res = await query(
    `SELECT kpi_key, company_id, mes, valor, nota, actualizado_por, actualizado_el
       FROM stoplight_valores_manuales
      WHERE company_id IN (${companyIds.map(() => "?").join(",")})
        AND mes IN (${meses.map(() => "?").join(",")})`,
    [...companyIds, ...meses],
  );
  return (res.rows as any[]).map((r) => ({ ...r, valor: Number(r.valor), company_id: Number(r.company_id) }));
}

async function leerTargets(companyIds: number[], mes: string) {
  await ensureKpiTargetsPeso();
  const res = await query(
    `SELECT kpi_key, company_id, meta_mensual, peso FROM kpi_targets
      WHERE company_id IN (${companyIds.map(() => "?").join(",")}) AND mes = ? ORDER BY id`,
    [...companyIds, mes],
  );
  const metas = new Map<string, number>();
  const pesos = new Map<string, number>();
  for (const r of res.rows as any[]) {
    const k = `${r.kpi_key}|${Number(r.company_id)}`;
    const m = Number(r.meta_mensual);
    if (Number.isFinite(m) && m > 0) metas.set(k, m);
    const p = pesoDeFila(r.peso);
    if (p !== null) pesos.set(k, p);
  }
  return { metas, pesos };
}

// Caché del cálculo automático: varios son lecturas pesadas de Odoo.
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map<string, { t: number; valor: ResultadoCalculo | null; error?: string }>();

async function calcularAuto(key: string, companyId: number, mes: string, refrescar: boolean) {
  const fn = CALCULOS[key];
  if (!fn) return { valor: null as ResultadoCalculo | null };
  const ck = `${key}|${companyId}|${mes}`;
  const hit = cache.get(ck);
  if (!refrescar && hit && Date.now() - hit.t < CACHE_MS) return { valor: hit.valor, error: hit.error };
  try {
    const valor = await fn(companyId, mes);
    cache.set(ck, { t: Date.now(), valor });
    return { valor };
  } catch (e: any) {
    const error = `${defKpi(key)?.titulo ?? key}: ${e?.message || "no se pudo calcular"}`;
    console.error("[stoplight departamentos]", key, companyId, mes, e?.message);
    cache.set(ck, { t: Date.now() - CACHE_MS + 60_000, valor: null, error }); // reintenta en 1 min
    return { valor: null, error };
  }
}

/**
 * Bloques de departamento del Stoplight de una sede y un mes. Los bloques
 * por país (Marketing) se leen con 9 (Venezuela) o 7 (Panamá) y los globales
 * (Expansión) con company_id 0.
 */
export async function leerDepartamentos(
  companyId: number,
  mes: string,
  opciones: { refrescar?: boolean; hoy?: Date } = {},
): Promise<{ bloques: BloqueDepto[]; avisos: string[] }> {
  const hoy = opciones.hoy ?? new Date();
  const companyIds = [...new Set([companyId, COMPANY_GLOBAL, companyDeBloque("pais", companyId)])];
  // Meses que hacen falta para sumar las cuentas por período (hasta el año).
  const meses = mesesDelPeriodo(mes, "anio");
  const [manuales, targets] = await Promise.all([leerManuales(companyIds, meses), leerTargets(companyIds, mes)]);
  const avisos: string[] = [];

  const manual = (key: string, cid: number, m: string) =>
    manuales.find((f) => f.kpi_key === key && f.company_id === cid && f.mes === m) ?? null;

  const leerKpi = async (def: DefKpi, cid: number): Promise<KpiDepto> => {
    const meta = targets.metas.get(`${def.key}|${cid}`) ?? def.meta;
    const peso = targets.pesos.get(`${def.key}|${cid}`) ?? def.peso;
    const mMes = manual(def.key, cid, mes);

    // Automático: una sede concreta (los globales calculan sobre el grupo).
    let auto: ResultadoCalculo | null = null;
    if (def.fuente !== "manual") {
      const r = await calcularAuto(def.key, cid, mes, !!opciones.refrescar);
      auto = r.valor;
      if (r.error) avisos.push(r.error);
    }

    let valor: number | null = null;
    let origen: KpiDepto["origen"] = null;
    if (def.acumula && def.acumula !== "mes") {
      // Cuenta del período: suma de las cargas de sus meses (a mano), o el
      // automático si no hay ninguna.
      const delPeriodo = mesesDelPeriodo(mes, def.acumula)
        .map((m) => manual(def.key, cid, m))
        .filter((f): f is FilaManual => !!f);
      if (delPeriodo.length) {
        valor = delPeriodo.reduce((s, f) => s + f.valor, 0);
        origen = "manual";
      } else if (auto?.valor != null) {
        valor = auto.valor;
        origen = "auto";
      }
    } else if (mMes) {
      valor = mMes.valor;
      origen = "manual";
    } else if (auto?.valor != null) {
      valor = auto.valor;
      origen = "auto";
    }

    let esperado: number | null = null;
    let pctEsperado: number | null = null;
    if (def.acumula && valor != null && meta > 0) {
      esperado = meta * fraccionDelPeriodo(mes, def.acumula, hoy);
      pctEsperado = esperado > 0 ? Math.round((valor / esperado) * 100) : null;
    }

    return {
      key: def.key,
      titulo: def.titulo,
      descripcion: def.descripcion,
      unidad: def.unidad,
      sentido: def.sentido,
      fuente: def.fuente,
      acumula: def.acumula ?? null,
      meta,
      peso,
      valor,
      origen,
      valorAuto: auto?.valor ?? null,
      manualMes: mMes
        ? { valor: mMes.valor, nota: mMes.nota, por: mMes.actualizado_por, el: mMes.actualizado_el ? String(mMes.actualizado_el) : null }
        : null,
      esperado,
      pctEsperado,
      detalle: origen === "auto" ? auto?.detalle ?? null : null,
    };
  };

  const bloques = await Promise.all(
    BLOQUES.map(async (b) => {
      const cid = companyDeBloque(b.alcance, companyId);
      const kpis = await Promise.all(b.kpis.map((k) => leerKpi(k, cid)));
      return { id: b.id, titulo: b.titulo, alcance: b.alcance, kpis };
    }),
  );
  return { bloques, avisos };
}
