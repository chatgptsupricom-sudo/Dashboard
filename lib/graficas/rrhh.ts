import { listarMatriz } from "@/lib/seleccion/datos";
import { indicadores } from "@/lib/seleccion/tipos";
import { listar as listarSolicitudes, usuarioDe } from "@/lib/solicitudes-personal/datos";
import { ESTADOS, URGENCIAS } from "@/lib/solicitudes-personal/tipos";
import { reporte } from "@/lib/asistencia/datos";
import { hoyCaracas } from "@/lib/compras/datosOdoo";
import {
  ESTADO, GRIS, NOMBRE_SEDE, PALETA, RAMPA, bloque, etiquetaMes, finDeMes, mesesHasta, r2,
  type DatosArea, type Grafica, type Kpi,
} from "./tipos";

/**
 * Recursos Humanos: matriz de Selección (lib/seleccion), Solicitudes de
 * personal (lib/solicitudes-personal) y Asistencia por biométrico del mes
 * (lib/asistencia). Sin nombres de personas: solo conteos.
 */

/** "YYYY-MM" en hora de Caracas de un timestamp ISO (created_at viene en UTC). */
const mesCaracas = (iso: string | null) => (iso ? new Date(Date.parse(iso) - 4 * 3_600_000).toISOString().slice(0, 7) : "");

const COLOR_ESTADO_SOLICITUD: Record<string, string> = {
  pendiente: ESTADO.aviso,
  aprobada: ESTADO.bien,
  rechazada: ESTADO.critico,
  retirada: GRIS,
};

export async function graficasRrhh(cids: number[], sede: string, mes: string, payload: any): Promise<DatosArea> {
  const avisos: string[] = [];
  const kpis: Kpi[] = [];
  const graficas: Grafica[] = [];
  const hoy = hoyCaracas();
  const desdeMes = `${mes}-01`;
  const hastaMes = finDeMes(mes) < hoy ? finDeMes(mes) : hoy;

  const [matriz, solicitudes, asistencia] = await Promise.all([
    bloque(avisos, "la selección de personal", () => listarMatriz()),
    bloque(avisos, "las solicitudes de personal", () => listarSolicitudes(usuarioDe(payload))),
    desdeMes > hoy
      ? Promise.resolve([])
      : bloque(avisos, "la asistencia", async () => {
          const reportes = await Promise.allSettled(cids.map((c) => reporte(c, desdeMes, hastaMes)));
          reportes.forEach((r, i) => {
            if (r.status === "rejected") avisos.push(`No se pudo leer la asistencia de ${NOMBRE_SEDE[cids[i]]}.`);
          });
          return reportes.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
        }),
  ]);

  if (matriz) {
    const reqs = matriz.requisiciones.filter((r) => cids.includes(Number(r.sede)));
    const ids = new Set(reqs.map((r) => r.id));
    const ind = indicadores(reqs, matriz.candidatos.filter((c) => ids.has(c.requisicion_id)));
    kpis.push({ id: "abiertas", etiqueta: "Vacantes en búsqueda", valor: ind.abiertas, formato: "num", nota: `hoy · ${ind.vencidas} pasadas de su meta` });
    kpis.push({ id: "contratados", etiqueta: "Contratados", valor: ind.contratados, formato: "num", nota: `desde el inicio · ${ind.enProceso} en proceso` });
    kpis.push({ id: "cobertura", etiqueta: "Días para cubrir una vacante", valor: ind.promedioCobertura, formato: "dias", mejor: "baja", nota: ind.dentroDeMeta != null ? `${ind.dentroDeMeta} % dentro de la meta` : undefined });
    graficas.push({
      id: "rrhh_embudo",
      sinTotal: true,
      titulo: "Embudo de selección",
      descripcion: "Candidatos que llegaron a cada fase.",
      tipo: "barras_h",
      formato: "num",
      datos: ind.embudo.map((e) => ({ etiqueta: e.etiqueta, valor: e.cantidad })),
      series: [{ clave: "valor", etiqueta: "Candidatos", color: PALETA[0] }],
      // Ordinal: cada fase un azul más oscuro.
      colorPorFila: ind.embudo.map((_, i) => RAMPA[Math.min(RAMPA.length - 1, Math.round((i * (RAMPA.length - 1)) / Math.max(1, ind.embudo.length - 1)))]),
      vacio: "Todavía no hay candidatos.",
    });
    graficas.push({
      id: "rrhh_fuentes",
      titulo: "Candidatos por fuente",
      descripcion: "De dónde vienen y cuántos llegan a la terna y se contratan.",
      tipo: "barras_h",
      formato: "num",
      datos: ind.porFuente.map((f) => ({ etiqueta: f.fuente, candidatos: f.candidatos, terna: f.terna, contratados: f.contratados })),
      series: [
        { clave: "candidatos", etiqueta: "Candidatos", color: PALETA[0] },
        { clave: "terna", etiqueta: "En terna", color: PALETA[1] },
        { clave: "contratados", etiqueta: "Contratados", color: PALETA[2] },
      ],
      vacio: "Todavía no hay candidatos.",
    });
    graficas.push({
      id: "rrhh_unidades",
      titulo: "Días para cubrir, por unidad",
      tipo: "barras_h",
      formato: "dias",
      datos: ind.porUnidad.filter((u) => u.promedio != null).map((u) => ({ etiqueta: u.unidad, valor: u.promedio })),
      series: [{ clave: "valor", etiqueta: "Días promedio", color: PALETA[6] }],
      vacio: "Ninguna requisición cubierta todavía.",
    });
  }

  if (solicitudes) {
    const sols = solicitudes.filter((s) => cids.includes(Number(s.sede)));
    const pendientes = sols.filter((s) => s.estado === "pendiente").length;
    kpis.push({ id: "sol_pendientes", etiqueta: "Solicitudes por aprobar", valor: pendientes, formato: "num", mejor: "baja" });
    const meses = mesesHasta(mes, 6);
    graficas.push({
      id: "rrhh_solicitudes",
      titulo: "Solicitudes de personal",
      descripcion: "Por mes en que se pidieron y cómo están hoy.",
      tipo: "apiladas",
      formato: "num",
      datos: meses.map((m) => ({
        etiqueta: etiquetaMes(m),
        ...Object.fromEntries(Object.keys(ESTADOS).map((e) => [e, sols.filter((s) => mesCaracas(s.created_at) === m && s.estado === e).length])),
      })),
      series: Object.entries(ESTADOS).map(([e, x]) => ({ clave: e, etiqueta: x.etiqueta, color: COLOR_ESTADO_SOLICITUD[e] })),
    });
    graficas.push({
      id: "rrhh_urgencia",
      titulo: "Solicitudes aprobadas por urgencia",
      tipo: "barras",
      formato: "num",
      datos: Object.entries(URGENCIAS).map(([u, x]) => ({ etiqueta: x.etiqueta, valor: sols.filter((s) => s.estado === "aprobada" && s.urgencia === u).length })),
      series: [{ clave: "valor", etiqueta: "Solicitudes", color: PALETA[0] }],
      colorPorFila: [ESTADO.critico, ESTADO.aviso, GRIS],
    });
  }

  if (asistencia && asistencia.length) {
    const empleados = asistencia.flatMap((r) => r.empleados).filter((e) => e.laborables > 0);
    const asist = empleados.reduce((s, e) => s + e.asistencias, 0);
    const retardos = empleados.reduce((s, e) => s + e.retardos, 0);
    const ausencias = empleados.reduce((s, e) => s + e.ausencias, 0);
    const laborables = empleados.reduce((s, e) => s + e.laborables, 0);
    kpis.push({ id: "puntualidad", etiqueta: "Puntualidad", valor: asist ? r2(((asist - retardos) / asist) * 100) : null, formato: "pct", nota: `${empleados.length} personas con marcas` });
    kpis.push({ id: "ausentismo", etiqueta: "Ausentismo", valor: laborables ? r2((ausencias / laborables) * 100) : null, formato: "pct", mejor: "baja", nota: `${ausencias} ausencias` });

    // Día a día: cuántos llegaron puntuales, tarde, sin marca de entrada o faltaron.
    const porDia = new Map<string, { puntual: number; retardo: number; sin_entrada: number; ausente: number }>();
    for (const e of empleados) {
      for (const d of e.dias) {
        if (!d.laborable || d.estado === "no_laborable") continue;
        const x = porDia.get(d.fecha) ?? { puntual: 0, retardo: 0, sin_entrada: 0, ausente: 0 };
        x[d.estado]++;
        porDia.set(d.fecha, x);
      }
    }
    graficas.push({
      id: "rrhh_asistencia",
      titulo: "Asistencia día a día",
      descripcion: `Biométrico de ${etiquetaMes(mes)}. Horario 8:00 a 4:30.`,
      tipo: "apiladas",
      formato: "num",
      ancho: 2,
      datos: [...porDia].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, x]) => ({ etiqueta: fecha.slice(8), ...x })),
      series: [
        { clave: "puntual", etiqueta: "Puntual", color: ESTADO.bien },
        { clave: "retardo", etiqueta: "Retardo", color: ESTADO.aviso },
        { clave: "sin_entrada", etiqueta: "Sin marca de entrada", color: ESTADO.serio },
        { clave: "ausente", etiqueta: "Ausente", color: ESTADO.critico },
      ],
      vacio: "No hay marcas cargadas para este mes.",
    });

    const porDepto = new Map<string, { asist: number; retardos: number }>();
    for (const e of empleados) {
      const k = e.departamento || "Sin departamento";
      const x = porDepto.get(k) ?? { asist: 0, retardos: 0 };
      x.asist += e.asistencias;
      x.retardos += e.retardos;
      porDepto.set(k, x);
    }
    graficas.push({
      id: "rrhh_depto",
      titulo: "Puntualidad por departamento",
      tipo: "barras_h",
      formato: "pct",
      datos: [...porDepto].filter(([, x]) => x.asist > 0)
        .map(([etiqueta, x]) => ({ etiqueta, valor: r2(((x.asist - x.retardos) / x.asist) * 100) }))
        .sort((a, b) => a.valor - b.valor),
      series: [{ clave: "valor", etiqueta: "% puntual", color: PALETA[2] }],
    });
  } else if (asistencia) {
    avisos.push("No hay marcas del biométrico cargadas para esta sede y mes.");
  }

  return { area: "rrhh", sede, mes, generado: new Date().toISOString(), kpis, graficas, avisos };
}
