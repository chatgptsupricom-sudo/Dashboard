import { query } from "@/lib/db";
import { casosConPlazo } from "@/lib/rma/plazosCasos";
import { etiquetaEstado } from "@/components/rma/estados";
import {
  COLOR_SEDE, ESTADO, NOMBRE_SEDE, PALETA, bloque, etiquetaMes, finDeMes, mesesHasta, r2, variacion,
  type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Servicio técnico: casos de `rma_cases` (MySQL), su historial de estados
 * (`rma_history`) y el semáforo de plazos de lib/rma/plazosCasos.ts.
 * Un caso sin sede solo cuenta con "todas las sedes".
 */

const MESES = 12;
const RESUELTOS = ["reparado", "nota_credito", "no_procesado"];
const COLOR_RESULTADO: Record<string, string> = { reparado: ESTADO.bien, nota_credito: PALETA[6], no_procesado: ESTADO.critico };

const ETAPAS = [
  { id: "por_llegar", etiqueta: "Por llegar" },
  { id: "diagnostico", etiqueta: "Diagnóstico" },
  { id: "reparacion", etiqueta: "Reparación" },
  { id: "listo", etiqueta: "Listo para salir" },
] as const;

export async function graficasRma(cids: number[], sede: string, mes: string): Promise<DatosArea> {
  const avisos: string[] = [];
  const kpis: Kpi[] = [];
  const graficas: Grafica[] = [];
  const todas = sede === "todas";
  const filtro = todas ? "1=1" : `c.company_id IN (${cids.map(() => "?").join(",")})`;
  const pSede = todas ? [] : cids;
  const meses = mesesHasta(mes, MESES);
  const desde = `${meses[0]}-01`;
  const hasta = `${finDeMes(mes)} 23:59:59`;
  const mesAnterior = mesesHasta(mes, 2)[0];

  const [nuevos, resultados, salida, marcas, plazos] = await Promise.all([
    bloque(avisos, "los casos nuevos", async () =>
      (await query(
        `SELECT DATE_FORMAT(c.created_at, '%Y-%m') AS mes, c.company_id, COUNT(*) AS n FROM rma_cases c
          WHERE c.created_at BETWEEN ? AND ? AND ${filtro} GROUP BY mes, c.company_id`, [desde, hasta, ...pSede],
      )).rows),
    bloque(avisos, "los resultados", async () =>
      (await query(
        `SELECT DATE_FORMAT(h.created_at, '%Y-%m') AS mes, h.to_status, COUNT(DISTINCT h.case_id) AS n
           FROM rma_history h JOIN rma_cases c ON c.id = h.case_id
          WHERE h.to_status IN (${RESUELTOS.map(() => "?").join(",")}) AND h.created_at BETWEEN ? AND ? AND ${filtro}
          GROUP BY mes, h.to_status`, [...RESUELTOS, desde, hasta, ...pSede],
      )).rows),
    bloque(avisos, "los tiempos de salida", async () =>
      (await query(
        `SELECT DATE_FORMAT(c.despachado_at, '%Y-%m') AS mes, AVG(DATEDIFF(c.despachado_at, c.created_at)) AS dias, COUNT(*) AS n
           FROM rma_cases c
          WHERE c.despachado_at BETWEEN ? AND ? AND c.despachado_at >= DATE(c.created_at) AND ${filtro}
          GROUP BY mes`, [desde, finDeMes(mes), ...pSede],
      )).rows),
    bloque(avisos, "las marcas", async () =>
      (await query(
        `SELECT COALESCE(NULLIF(TRIM(c.brand), ''), 'Sin marca') AS marca, COUNT(*) AS n FROM rma_cases c
          WHERE c.created_at BETWEEN ? AND ? AND ${filtro}
          GROUP BY marca ORDER BY n DESC LIMIT 12`, [desde, hasta, ...pSede],
      )).rows),
    bloque(avisos, "los plazos", async () =>
      todas ? casosConPlazo() : (await Promise.all(cids.map((c) => casosConPlazo({ companyId: c })))).flat()),
  ]);

  // Con "todas" también salen los casos sin sede, como serie aparte.
  const sedesFila = todas ? [...cids, 0] : cids;
  const deSede = (companyId: unknown, c: number) => (c === 0 ? !cids.includes(Number(companyId)) : Number(companyId) === c);
  const seriesSede = sedesFila.map((c) => ({ clave: String(c), etiqueta: NOMBRE_SEDE[c] || "Sin sede", color: COLOR_SEDE[c] || "#a3a29c" }));

  // Los activos salen de casosConPlazo, igual que el semáforo: sin los resueltos
  // que llevan más de 30 días sin despacho ni los tickets del portal que nunca llegaron.
  if (plazos) {
    const enTaller = plazos.filter((c) => c.plazo.etapa === "diagnostico" || c.plazo.etapa === "reparacion").length;
    kpis.push({ id: "activos", etiqueta: "Casos en curso", valor: plazos.length, formato: "num", nota: `hoy · ${enTaller} en el taller` });
    const estados = [...new Set(plazos.map((c) => String(c.status)))];
    graficas.push({
      id: "rma_estados",
      titulo: "Casos en curso por estado",
      descripcion: "Hoy, sin importar el mes elegido: equipos que todavía no han salido.",
      tipo: "apiladas_h",
      formato: "num",
      datos: estados.map((st): Record<string, string | number> => ({
        etiqueta: etiquetaEstado[st] || st,
        ...Object.fromEntries(sedesFila.map((c) => [String(c), plazos.filter((p) => p.status === st && deSede(p.company_id, c)).length])),
      })).sort((a, b) => sedesFila.reduce((s, c) => s + Number(b[String(c)]), 0) - sedesFila.reduce((s, c) => s + Number(a[String(c)]), 0)),
      series: seriesSede,
      vacio: "No hay casos en curso.",
    });
  }

  if (nuevos) {
    const delMes = (m: string) => nuevos.filter((r: any) => r.mes === m).reduce((s: number, r: any) => s + Number(r.n), 0);
    kpis.push({ id: "nuevos", etiqueta: "Casos nuevos del mes", valor: delMes(mes), formato: "num", delta: variacion(delMes(mes), delMes(mesAnterior)), referencia: "vs mes anterior", mejor: "baja" });
    graficas.push({
      id: "rma_nuevos",
      titulo: "Casos nuevos por mes",
      tipo: "apiladas",
      formato: "num",
      datos: meses.map((m) => ({
        etiqueta: etiquetaMes(m),
        ...Object.fromEntries(sedesFila.map((c) => [String(c), nuevos.filter((r: any) => r.mes === m && deSede(r.company_id, c)).reduce((s: number, r: any) => s + Number(r.n), 0)])),
      })),
      series: seriesSede,
    });
  }

  if (resultados) {
    const n = (m: string, st: string) => Number(resultados.find((r: any) => r.mes === m && r.to_status === st)?.n || 0);
    const resueltosMes = RESUELTOS.reduce((s, st) => s + n(mes, st), 0);
    kpis.push({ id: "resueltos", etiqueta: "Resueltos en el mes", valor: resueltosMes, formato: "num" });
    kpis.push({ id: "pct_nc", etiqueta: "Terminan en nota de crédito", valor: resueltosMes ? r2((n(mes, "nota_credito") / resueltosMes) * 100) : null, formato: "pct", mejor: "baja" });
    graficas.push({
      id: "rma_resultados",
      titulo: "¿Cómo terminan los casos?",
      descripcion: "Casos que pasaron a cada resultado en el mes.",
      tipo: "apiladas",
      formato: "num",
      datos: meses.map((m) => ({ etiqueta: etiquetaMes(m), ...Object.fromEntries(RESUELTOS.map((st) => [st, n(m, st)])) })),
      series: RESUELTOS.map((st) => ({ clave: st, etiqueta: etiquetaEstado[st], color: COLOR_RESULTADO[st] })),
    });
  }

  if (salida) {
    const delMes = salida.find((r: any) => r.mes === mes);
    kpis.push({ id: "dias_salida", etiqueta: "Días promedio en salir", valor: delMes ? r2(Number(delMes.dias)) : null, formato: "dias", mejor: "baja", nota: delMes ? `${delMes.n} despachados` : "sin despachos en el mes" });
    graficas.push({
      id: "rma_tiempo",
      titulo: "Días desde que se abre hasta que sale",
      descripcion: "Promedio de días calendario de los equipos despachados cada mes.",
      tipo: "lineas",
      formato: "dias",
      datos: meses.map((m) => {
        const r = salida.find((x: any) => x.mes === m);
        return { etiqueta: etiquetaMes(m), valor: r ? r2(Number(r.dias)) : null };
      }),
      series: [{ clave: "valor", etiqueta: "Días", color: PALETA[0] }],
    });
  }

  if (plazos) {
    const vencidos = plazos.filter((c) => c.plazo.nivel === "vencido").length;
    kpis.unshift({ id: "vencidos", etiqueta: "Fuera de plazo", valor: vencidos, formato: "num", mejor: "baja", nota: `hoy · ${plazos.filter((c) => c.plazo.nivel === "aviso").length} por vencer` });
    graficas.unshift({
      id: "rma_semaforo",
      titulo: "Semáforo de plazos",
      descripcion: "Hoy, sin importar el mes elegido. Diagnóstico en 48 h hábiles y salida antes del 7.º día hábil.",
      tipo: "apiladas_h",
      formato: "num",
      datos: ETAPAS.map((e) => {
        const de = plazos.filter((c) => c.plazo.etapa === e.id);
        return {
          etiqueta: e.etiqueta,
          ok: de.filter((c) => c.plazo.nivel === "ok").length,
          aviso: de.filter((c) => c.plazo.nivel === "aviso").length,
          vencido: de.filter((c) => c.plazo.nivel === "vencido").length,
        };
      }),
      series: [
        { clave: "ok", etiqueta: "A tiempo", color: ESTADO.bien },
        { clave: "aviso", etiqueta: "Por vencer", color: ESTADO.aviso },
        { clave: "vencido", etiqueta: "Vencido", color: ESTADO.critico },
      ],
    });
  }

  if (marcas) {
    graficas.push({
      id: "rma_marcas",
      titulo: "Marcas con más casos",
      descripcion: `Casos abiertos en los últimos ${MESES} meses.`,
      tipo: "barras_h",
      formato: "num",
      datos: marcas.map((r: any) => ({ etiqueta: String(r.marca), valor: Number(r.n) })),
      series: [{ clave: "valor", etiqueta: "Casos", color: PALETA[6] }],
    });
  }

  if (plazos && !plazos.length && nuevos && !nuevos.length) {
    avisos.push("No hay casos de RMA registrados en el panel para esta sede en los últimos 12 meses.");
  }

  return { area: "rma", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
