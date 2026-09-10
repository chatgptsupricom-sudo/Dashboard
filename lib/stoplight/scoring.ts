// Lógica de semáforo y puntaje del Stoplight Report. Funciones puras, sin
// React — extraídas de components/superadmin/StoplightReport.tsx (audit #23)
// para que el componente no cargue con ~130 líneas de reglas de negocio.

// Semáforo sobre el % de meta cumplida: verde al llegar (>=100), amarillo
// cuando ya está cerca (70–99), rojo cuando falta bastante (<70).
export const getCellColor = (value: string) => {
  if (!value) return "";
  const numValue = parseInt(value);
  if (isNaN(numValue)) return "";
  if (numValue >= 100) return "bg-green-100 text-green-800 font-medium";
  if (numValue >= 70) return "bg-yellow-100 text-yellow-800 font-medium";
  return "bg-red-100 text-red-800 font-medium";
};

// KPIs cuyo valor mostrado es la métrica cruda (no un "% de meta"): más alto
// mejor, o más bajo mejor. El resto muestra directamente "% de meta cumplida".
export const KPI_MAS_ES_MEJOR = ["efectividad_cobranza", "recuperacion_vencidos", "pagos_a_tiempo", "procesamiento_oportuno",
  "usuarios_totales", "sesiones", "paginas_vistas", "clicks_sc", "impresiones_sc", "ctr_sc", "email_open_rate"];
export const KPI_MENOS_ES_MEJOR = ["cartera_vencida", "dso", "cuentas_pagar_vencidas", "dpo", "tasa_rebote", "posicion_sc", "ciclo_reposicion"];

export const getKpiCellColor = (kpiId: string, value: string | null, goal: string) => {
  if (!value) return "";
  const numVal = parseFloat(value.replace("%", "").replace(" días", "").trim());
  if (isNaN(numVal)) return "";
  const numGoal = parseFloat(goal);

  const higherBetter = KPI_MAS_ES_MEJOR;
  const lowerBetter = KPI_MENOS_ES_MEJOR;

  if (higherBetter.includes(kpiId) && !isNaN(numGoal)) {
    if (numVal >= numGoal) return "bg-emerald-100 text-emerald-800 font-medium";
    if (numVal >= numGoal * 0.7) return "bg-amber-100 text-amber-800 font-medium";
    return "bg-red-100 text-red-800 font-medium";
  }

  if (lowerBetter.includes(kpiId) && !isNaN(numGoal)) {
    if (numVal <= numGoal) return "bg-emerald-100 text-emerald-800 font-medium";
    if (numVal <= numGoal * 1.3) return "bg-amber-100 text-amber-800 font-medium";
    return "bg-red-100 text-red-800 font-medium";
  }

  // Sin meta configurada no hay contra qué medir: el KPI queda NEUTRO (ni
  // verde ni rojo) y no cuenta en el resumen del semáforo. `nivelSemaforo` lo
  // traduce a "sin" al no encontrar color.
  if (!Number.isFinite(numGoal) || numGoal <= 0) return "";

  return getCellColor(value);
};

/** true cuando el KPI no tiene meta configurada (>0). */
export const sinMeta = (goal: string | number | null | undefined): boolean => {
  const n = parseFloat(String(goal ?? ""));
  return !Number.isFinite(n) || n <= 0;
};

export type Nivel = "verde" | "amarillo" | "rojo" | "sin";

// Traduce el color de celda de un KPI a un nivel de semáforo, para los
// resúmenes del encabezado y de cada grupo.
export const nivelSemaforo = (kpiId: string, average: string | null, goal: string): Nivel => {
  const c = getKpiCellColor(kpiId, average, goal);
  if (/green|emerald/.test(c)) return "verde";
  if (/yellow|amber/.test(c)) return "amarillo";
  if (/red/.test(c)) return "rojo";
  return "sin";
};

/**
 * Cumplimiento de un KPI en 0–100 (para el puntaje ponderado del grupo).
 * `null` = sin meta configurada ⇒ no entra en el puntaje.
 */
export const cumplimientoKpi = (
  kpiId: string,
  average: string | null,
  goal: string | number | null | undefined,
): number | null => {
  if (!average) return null;
  const numVal = parseFloat(String(average).replace("%", "").replace(" días", "").replace(/N\/?A/i, "").trim());
  if (isNaN(numVal)) return null;
  const numGoal = parseFloat(String(goal ?? ""));
  if (!Number.isFinite(numGoal) || numGoal <= 0) return null;
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  if (KPI_MENOS_ES_MEJOR.includes(kpiId)) {
    return numVal <= 0 ? 100 : clamp((numGoal / numVal) * 100);
  }
  if (KPI_MAS_ES_MEJOR.includes(kpiId)) {
    return clamp((numVal / numGoal) * 100);
  }
  // El resto: `average` ya es "% de meta cumplida".
  return clamp(numVal);
};

/**
 * Puntaje ponderado de un grupo: Σ(peso × cumplimiento) ÷ Σ(peso), tomando
 * solo los KPIs con meta. `null` si ninguno tiene meta.
 */
export const puntajeGrupo = (
  kpis: any[],
): { valor: number; pesoConMeta: number; kpisConMeta: number } | null => {
  let ponderado = 0;
  let peso = 0;
  let n = 0;
  for (const k of kpis || []) {
    const c = cumplimientoKpi(k.id, k.average, k.goalDefault);
    if (c === null) continue;
    const p = parseFloat(String(k.peso).replace("%", "")) || 0;
    if (p <= 0) continue;
    ponderado += p * c;
    peso += p;
    n++;
  }
  if (peso <= 0) return null;
  return { valor: Math.round(ponderado / peso), pesoConMeta: Math.round(peso), kpisConMeta: n };
};

export const NIVEL_UI: Record<Exclude<Nivel, "sin">, { punto: string; barra: string; texto: string }> = {
  verde: { punto: "bg-emerald-500", barra: "bg-emerald-500", texto: "text-emerald-600" },
  amarillo: { punto: "bg-amber-500", barra: "bg-amber-500", texto: "text-amber-600" },
  rojo: { punto: "bg-rose-500", barra: "bg-rose-500", texto: "text-rose-600" },
};

export function contarNiveles(kpis: any[]): { verde: number; amarillo: number; rojo: number; total: number } {
  const acc = { verde: 0, amarillo: 0, rojo: 0, total: 0 };
  for (const k of kpis) {
    const n = nivelSemaforo(k.id, k.average, k.goalDefault);
    if (n === "sin") continue;
    acc[n]++;
    acc.total++;
  }
  return acc;
}
