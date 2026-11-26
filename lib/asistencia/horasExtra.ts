/**
 * Horas extra de Asistencia (pestaña «Horas extra»): totales por día, semana,
 * empleado y departamento a partir del reporte (`Dia.extraMin`), y la hoja que
 * se imprime como PDF. Todo puro: lo usa la pantalla.
 */

import { DIAS_SEMANA, HORARIO, MIN_HORA_EXTRA, diaSemana, sumarDias, type Dia, type ResumenEmpleado } from "./tipos";

export type FilaExtra = { e: ResumenEmpleado; d: Dia };

export type DiaExtra = { fecha: string; laborable: number; descanso: number; empleados: number };
export type SemanaExtra = { lunes: string; minutos: number; empleados: number };
export type EmpleadoExtra = {
  codigo: string;
  nombre: string;
  departamento: string;
  minutos: number;
  minutosLaborable: number;
  minutosDescanso: number;
  dias: number;
};
export type DepartamentoExtra = { departamento: string; minutos: number; empleados: number };

export type ResumenExtra = {
  filas: FilaExtra[];
  totalMin: number;
  laborableMin: number;
  descansoMin: number;
  empleados: number;
  dias: number;
  porDia: DiaExtra[];
  porSemana: SemanaExtra[];
  porEmpleado: EmpleadoExtra[];
  porDepartamento: DepartamentoExtra[];
};

/** "12,5" (horas con un decimal, coma). */
export const horasDec = (min: number) => (Math.round((min / 60) * 10) / 10).toLocaleString("es-VE", { maximumFractionDigits: 1 });

/** "2 h 15 min" / "45 min" / "0". */
export const formatoExtra = (min: number) => {
  if (!min) return "0";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
};

/** Tipo del día para las horas extra. */
export const tipoDiaExtra = (d: Dia) =>
  d.especial === "feriado" ? "Feriado" : d.especial === "inventario" ? "Sábado de inventario, después de hora" : d.laborable ? "Después de hora" : "Día de descanso";

export const lunesDe = (fecha: string) => sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));

export function resumirExtra(empleados: ResumenEmpleado[], desde: string, hasta: string): ResumenExtra {
  const filas = empleados
    .flatMap((e) => e.dias.filter((d) => d.extraMin > 0).map((d) => ({ e, d })))
    .sort((a, b) => a.d.fecha.localeCompare(b.d.fecha) || b.d.extraMin - a.d.extraMin);

  // Todos los días del rango (con 0 los que no tienen), para que la gráfica no salte días.
  const porDia = new Map<string, DiaExtra & { quien: Set<string> }>();
  const ultimo = filas.length ? filas[filas.length - 1].d.fecha : hasta;
  const fin = ultimo > hasta ? ultimo : hasta;
  for (let f = desde; f <= fin && porDia.size < 400; f = sumarDias(f, 1)) {
    porDia.set(f, { fecha: f, laborable: 0, descanso: 0, empleados: 0, quien: new Set() });
  }
  const porSemana = new Map<string, SemanaExtra & { quien: Set<string> }>();
  const porEmpleado = new Map<string, EmpleadoExtra>();
  const porDepto = new Map<string, DepartamentoExtra & { quien: Set<string> }>();

  for (const { e, d } of filas) {
    const dia = porDia.get(d.fecha) ?? { fecha: d.fecha, laborable: 0, descanso: 0, empleados: 0, quien: new Set<string>() };
    if (d.laborable) dia.laborable += d.extraMin;
    else dia.descanso += d.extraMin;
    dia.quien.add(e.codigo);
    porDia.set(d.fecha, dia);

    const lunes = lunesDe(d.fecha);
    const sem = porSemana.get(lunes) ?? { lunes, minutos: 0, empleados: 0, quien: new Set<string>() };
    sem.minutos += d.extraMin;
    sem.quien.add(e.codigo);
    porSemana.set(lunes, sem);

    const emp = porEmpleado.get(e.codigo) ?? {
      codigo: e.codigo,
      nombre: e.nombre,
      departamento: e.departamento,
      minutos: 0,
      minutosLaborable: 0,
      minutosDescanso: 0,
      dias: 0,
    };
    emp.minutos += d.extraMin;
    if (d.laborable) emp.minutosLaborable += d.extraMin;
    else emp.minutosDescanso += d.extraMin;
    emp.dias += 1;
    porEmpleado.set(e.codigo, emp);

    const nombreDepto = e.departamento || "Sin departamento";
    const dep = porDepto.get(nombreDepto) ?? { departamento: nombreDepto, minutos: 0, empleados: 0, quien: new Set<string>() };
    dep.minutos += d.extraMin;
    dep.quien.add(e.codigo);
    porDepto.set(nombreDepto, dep);
  }

  const sinQuien = <T extends { quien: Set<string> }>({ quien, ...resto }: T) => ({ ...resto, empleados: quien.size });
  const empleadosExtra = [...porEmpleado.values()].sort((a, b) => b.minutos - a.minutos || a.nombre.localeCompare(b.nombre, "es"));
  const laborableMin = empleadosExtra.reduce((s, x) => s + x.minutosLaborable, 0);
  const descansoMin = empleadosExtra.reduce((s, x) => s + x.minutosDescanso, 0);

  return {
    filas,
    totalMin: laborableMin + descansoMin,
    laborableMin,
    descansoMin,
    empleados: empleadosExtra.length,
    dias: new Set(filas.map((f) => f.d.fecha)).size,
    porDia: [...porDia.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(sinQuien),
    porSemana: [...porSemana.values()].sort((a, b) => a.lunes.localeCompare(b.lunes)).map(sinQuien),
    porEmpleado: empleadosExtra,
    porDepartamento: [...porDepto.values()].map(sinQuien).sort((a, b) => b.minutos - a.minutos),
  };
}

/* --------------------------------------------------------------------- PDF */

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const fechaCorta = (f: string) => {
  const [a, m, d] = f.split("-");
  return `${d}/${m}/${a}`;
};

/**
 * Hoja de horas extra para imprimir o guardar como PDF (carta, vertical):
 * tarjetas, barras por día y por empleado, y las tablas por empleado y por día.
 */
export function htmlPdfExtra(r: ResumenExtra, { sede, desde, hasta, filtro }: { sede: string; desde: string; hasta: string; filtro?: string }): string {
  const maxDia = Math.max(1, ...r.porDia.map((d) => d.laborable + d.descanso));
  const barrasDia = r.porDia
    .map((d) => {
      const alto = (min: number) => `${(min / maxDia) * 100}%`;
      const dow = diaSemana(d.fecha);
      return `<div class="col" title="${fechaCorta(d.fecha)}: ${formatoExtra(d.laborable + d.descanso)}">
        <div class="pila"><div class="b des" style="height:${alto(d.descanso)}"></div><div class="b lab" style="height:${alto(d.laborable)}"></div></div>
        <div class="eje ${dow === 0 || dow === 6 ? "fin" : ""}">${d.fecha.slice(8)}</div>
      </div>`;
    })
    .join("");

  const top = r.porEmpleado.slice(0, 15);
  const maxEmp = Math.max(1, ...top.map((e) => e.minutos));
  const barrasEmp = top
    .map(
      (e) => `<div class="fila"><div class="nom">${esc(e.nombre || e.codigo)}</div>
        <div class="pista"><div class="b lab" style="width:${(e.minutosLaborable / maxEmp) * 100}%"></div><div class="b des" style="width:${(e.minutosDescanso / maxEmp) * 100}%"></div></div>
        <div class="val">${horasDec(e.minutos)} h</div></div>`,
    )
    .join("");

  const tablaEmp = r.porEmpleado
    .map(
      (e) => `<tr><td class="mono">${esc(e.codigo)}</td><td>${esc(e.nombre)}</td><td>${esc(e.departamento)}</td>
        <td class="n">${e.dias}</td><td class="n">${formatoExtra(e.minutosLaborable)}</td><td class="n">${formatoExtra(e.minutosDescanso)}</td>
        <td class="n b">${formatoExtra(e.minutos)}</td><td class="n">${horasDec(e.minutos)}</td></tr>`,
    )
    .join("");

  const tablaDias = r.filas
    .map(
      ({ e, d }) => `<tr><td>${fechaCorta(d.fecha)} <span class="gris">${DIAS_SEMANA[diaSemana(d.fecha)].slice(0, 3)}</span></td>
        <td>${esc(e.nombre)}</td><td>${tipoDiaExtra(d)}</td><td class="n">${d.entrada ?? ""}</td><td class="n">${d.salida ?? ""}</td>
        <td class="n b">${formatoExtra(d.extraMin)}</td></tr>`,
    )
    .join("");

  const tarjeta = (t: string, v: string, det = "") => `<div class="tar"><p class="t">${t}</p><p class="v">${v}</p>${det ? `<p class="d">${det}</p>` : ""}</div>`;
  const generado = new Date().toLocaleString("es-VE", { timeZone: "America/Caracas" });

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Horas extra ${esc(sede)} ${desde} a ${hasta}</title>
<style>
@page{size:letter;margin:14mm}
*{box-sizing:border-box}
body{font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:10.5px;margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
h1{font-size:18px;margin:0}h2{font-size:12.5px;margin:18px 0 8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px}
.cab{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #2563eb;padding-bottom:8px}
.sub{color:#475569;margin-top:3px}.gris{color:#94a3b8}
.tars{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px}
.tar{border:1px solid #e2e8f0;border-radius:8px;padding:8px 10px}.tar p{margin:0}.t{color:#64748b;font-size:9.5px;font-weight:bold}.v{font-size:18px;font-weight:900;margin-top:2px!important}.d{color:#64748b;font-size:9px}
.ley{display:flex;gap:14px;font-size:9.5px;color:#475569;margin-bottom:6px}.ley span:before{content:"";display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:4px;vertical-align:-1px;background:var(--c)}
.lab{background:#2563eb}.des{background:#f59e0b}
.dias{display:flex;align-items:flex-end;gap:2px;height:130px;border-bottom:1px solid #cbd5e1}
.col{flex:1;display:flex;flex-direction:column;height:100%;min-width:0}.pila{flex:1;display:flex;flex-direction:column;justify-content:flex-end}.pila .b{width:100%;border-radius:2px 2px 0 0}
.eje{font-size:7.5px;text-align:center;color:#64748b;padding-top:2px}.eje.fin{color:#cbd5e1}
.fila{display:flex;align-items:center;gap:8px;margin:3px 0}.nom{width:34%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pista{flex:1;display:flex;height:11px;background:#f1f5f9;border-radius:3px;overflow:hidden}.val{width:48px;text-align:right;font-weight:bold}
table{width:100%;border-collapse:collapse}th{background:#f1f5f9;text-align:left;font-size:9.5px;padding:5px 6px}td{border-top:1px solid #e2e8f0;padding:4px 6px}
.n{text-align:right;white-space:nowrap}td.b{font-weight:bold}.mono{font-family:monospace}
tr{page-break-inside:avoid}.nota{color:#64748b;font-size:9px;margin-top:4px}
</style></head><body>
<div class="cab"><div><h1>Horas extra · ${esc(sede)}</h1><div class="sub">Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}${filtro ? ` · ${esc(filtro)}` : ""}</div></div>
<div class="sub">Supricom · Recursos Humanos<br>Generado ${esc(generado)}</div></div>
<div class="tars">
${tarjeta("Horas extra", `${horasDec(r.totalMin)} h`, formatoExtra(r.totalMin))}
${tarjeta("Después de hora", `${horasDec(r.laborableMin)} h`, `Lunes a viernes después de las ${HORARIO.salida}`)}
${tarjeta("Descanso y feriados", `${horasDec(r.descansoMin)} h`, "Todo lo trabajado ese día")}
${tarjeta("Empleados", String(r.empleados), `${r.dias} días con horas extra`)}
</div>
<h2>Horas extra por día</h2>
<div class="ley"><span style="--c:#2563eb">Después de hora</span><span style="--c:#f59e0b">Descanso y feriados</span></div>
<div class="dias">${barrasDia}</div>
${top.length ? `<h2>Empleados con más horas extra${r.porEmpleado.length > top.length ? ` (los ${top.length} primeros)` : ""}</h2>${barrasEmp}` : ""}
<h2>Por empleado</h2>
<table><thead><tr><th>Código</th><th>Empleado</th><th>Departamento</th><th class="n">Días</th><th class="n">Después de hora</th><th class="n">Descanso/feriado</th><th class="n">Total</th><th class="n">Horas</th></tr></thead>
<tbody>${tablaEmp || `<tr><td colspan="8" class="gris">Nadie hizo horas extra en el período.</td></tr>`}</tbody></table>
${r.filas.length ? `<h2>Detalle por día</h2><table><thead><tr><th>Fecha</th><th>Empleado</th><th>Tipo</th><th class="n">Entrada</th><th class="n">Salida</th><th class="n">Horas extra</th></tr></thead><tbody>${tablaDias}</tbody></table>` : ""}
<p class="nota">Horas extra = lo trabajado después de las ${HORARIO.salida} en un día laborable, o todo lo trabajado (entrada a salida) en un día de descanso o feriado (un sábado de inventario es laborable: cuenta después de las ${HORARIO.salida}). Menos de ${MIN_HORA_EXTRA} min en un día no cuenta. Sale de las marcas del biométrico: un día sin marca de entrada o de salida no se puede calcular.</p>
</body></html>`;
}
