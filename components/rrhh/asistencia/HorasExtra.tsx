"use client";

import { BotonExcel } from "@/components/administracion/comunes";
import { Button } from "@/components/ui/button";
import {
  formatoExtra,
  horasDec,
  htmlPdfExtra,
  resumirExtra,
  tipoDiaExtra,
} from "@/lib/asistencia/horasExtra";
import {
  DIAS_SEMANA,
  HORARIO,
  MIN_HORA_EXTRA,
  SEDES_ASISTENCIA,
  diaSemana,
  hoyCaracas,
  type Reporte as DatosReporte,
} from "@/lib/asistencia/tipos";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, FileText, Loader2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fechaCorta } from "../seleccion/comunes";

const selCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";
const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-600";
const td = "border-t border-slate-100 px-3 py-2 text-sm tabular-nums text-slate-700";

const AZUL = "#2563eb";
const AMBAR = "#f59e0b";
const ETQ_LAB = "Después de hora";
const ETQ_DES = "Descanso y feriados";

const nombreDia = (f: string) => DIAS_SEMANA[diaSemana(f)];
const h = (min: number) => Math.round((min / 60) * 100) / 100;
const inicioMes = () => `${hoyCaracas().slice(0, 8)}01`;

/** Imprime (o guarda como PDF) una página HTML desde un iframe oculto. */
function imprimirHtml(html: string) {
  const marco = document.createElement("iframe");
  marco.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(marco);
  const doc = marco.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    marco.contentWindow!.focus();
    marco.contentWindow!.print();
    setTimeout(() => marco.remove(), 1000);
  }, 400);
}

function Tarjeta({ titulo, valor, detalle, color }: { titulo: string; valor: string | number; detalle?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
        {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}
        {titulo}
      </p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

function Panel({ titulo, children, accion }: { titulo: string; children: React.ReactNode; accion?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-800">{titulo}</h3>
        {accion}
      </div>
      {children}
    </div>
  );
}

const tooltipHoras = (v: number, n: string) => [`${v.toLocaleString("es-VE")} h`, n];

/** Pestaña «Horas extra» de Asistencia (lib/asistencia/horasExtra.ts). */
export function HorasExtra({ sede }: { sede: number }) {
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoyCaracas);
  const [datos, setDatos] = useState<DatosReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [departamento, setDepartamento] = useState("");
  const [agrupar, setAgrupar] = useState<"dia" | "semana">("dia");
  const [abierto, setAbierto] = useState<string | null>(null);

  useEffect(() => {
    setCargando(true);
    setError(null);
    fetch(`/api/rrhh/asistencia?sede=${sede}&desde=${desde}&hasta=${hasta}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j: DatosReporte) => setDatos(j))
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [sede, desde, hasta]);

  const departamentos = useMemo(
    () => [...new Set((datos?.empleados ?? []).map((e) => e.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [datos],
  );

  const empleados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos?.empleados ?? []).filter(
      (e) => (!q || `${e.codigo} ${e.nombre}`.toLowerCase().includes(q)) && (!departamento || e.departamento === departamento),
    );
  }, [datos, busqueda, departamento]);

  // Los días que todavía no tienen marcas no se dibujan.
  const finDatos = datos?.cobertura && datos.cobertura < hasta ? datos.cobertura : hasta;
  const r = useMemo(() => resumirExtra(empleados, desde, finDatos), [empleados, desde, finDatos]);

  const serie = useMemo(
    () =>
      agrupar === "dia"
        ? r.porDia.map((d) => ({ x: `${d.fecha.slice(8)}/${d.fecha.slice(5, 7)}`, titulo: `${nombreDia(d.fecha)} ${fechaCorta(d.fecha)}`, [ETQ_LAB]: h(d.laborable), [ETQ_DES]: h(d.descanso) }))
        : r.porSemana.map((s) => ({ x: `${s.lunes.slice(8)}/${s.lunes.slice(5, 7)}`, titulo: `Semana del ${fechaCorta(s.lunes)}`, Total: h(s.minutos) })),
    [r, agrupar],
  );

  const top = useMemo(
    () =>
      r.porEmpleado.slice(0, 10).map((e) => ({
        nombre: (e.nombre || e.codigo).split(" ").slice(0, 2).join(" "),
        completo: e.nombre,
        [ETQ_LAB]: h(e.minutosLaborable),
        [ETQ_DES]: h(e.minutosDescanso),
      })),
    [r],
  );

  const deptos = useMemo(() => r.porDepartamento.map((d) => ({ nombre: d.departamento, Horas: h(d.minutos), empleados: d.empleados })), [r]);

  const filtroTexto = [departamento, busqueda.trim() && `búsqueda «${busqueda.trim()}»`].filter(Boolean).join(" · ");
  const archivo = `horas-extra-${SEDES_ASISTENCIA[sede]}-${desde}-a-${hasta}`;

  const hojas = () => [
    {
      nombre: "Por empleado",
      filas: r.porEmpleado.map((e) => ({
        Código: e.codigo,
        Nombre: e.nombre,
        Departamento: e.departamento,
        "Días con horas extra": e.dias,
        "Después de hora (h)": h(e.minutosLaborable),
        "Descanso y feriados (h)": h(e.minutosDescanso),
        "Total (h)": h(e.minutos),
        "Total (min)": e.minutos,
      })),
    },
    {
      nombre: "Detalle por día",
      filas: r.filas.map(({ e, d }) => ({
        Fecha: d.fecha,
        Día: nombreDia(d.fecha),
        Código: e.codigo,
        Nombre: e.nombre,
        Departamento: e.departamento,
        Tipo: tipoDiaExtra(d),
        Entrada: d.entrada ?? "",
        Salida: d.salida ?? "",
        "Horas extra (h)": h(d.extraMin),
        "Horas extra (min)": d.extraMin,
      })),
    },
    {
      nombre: "Por día",
      filas: r.porDia.map((d) => ({
        Fecha: d.fecha,
        Día: nombreDia(d.fecha),
        "Después de hora (h)": h(d.laborable),
        "Descanso y feriados (h)": h(d.descanso),
        "Total (h)": h(d.laborable + d.descanso),
        Empleados: d.empleados,
      })),
    },
    {
      nombre: "Por departamento",
      filas: r.porDepartamento.map((d) => ({ Departamento: d.departamento, Empleados: d.empleados, "Total (h)": h(d.minutos) })),
    },
  ];

  const pdf = () => imprimirHtml(htmlPdfExtra(r, { sede: SEDES_ASISTENCIA[sede], desde, hasta: finDatos, filtro: filtroTexto }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          Desde
          <input type="date" className={selCls} value={desde} onChange={(e) => e.target.value && setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          Hasta
          <input type="date" className={selCls} value={hasta} onChange={(e) => e.target.value && setHasta(e.target.value)} />
        </label>
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar empleado o código…"
          className={`${selCls} w-full sm:w-60`}
        />
        {departamentos.length > 0 && (
          <select className={selCls} value={departamento} onChange={(e) => setDepartamento(e.target.value)}>
            <option value="">Todos los departamentos</option>
            {departamentos.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex gap-2">
          <BotonExcel archivo={archivo} hojas={hojas} />
          <Button variant="outline" size="sm" onClick={pdf} className="h-9" disabled={!datos?.cobertura}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Horas extra = lo trabajado después de las {HORARIO.salida} en un día laborable (también el sábado de inventario), o todo lo trabajado de
        entrada a salida en un día de descanso o feriado. Menos de {MIN_HORA_EXTRA} min en un día no cuenta, y un día sin marca de entrada o de
        salida no se puede calcular.
      </p>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {cargando && <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />}

      {!cargando && datos && !datos.cobertura && (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          Todavía no hay marcas de {SEDES_ASISTENCIA[sede]}. Súbelas en «Cargar Excel».
        </p>
      )}

      {!cargando && datos?.cobertura && (
        <>
          {datos.cobertura < hasta && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Hay marcas cargadas hasta el {fechaCorta(datos.cobertura)}: los días siguientes no se cuentan hasta que se suba el Excel que los
              traiga.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tarjeta titulo="Horas extra" valor={`${horasDec(r.totalMin)} h`} detalle={formatoExtra(r.totalMin)} />
            <Tarjeta titulo={ETQ_LAB} color={AZUL} valor={`${horasDec(r.laborableMin)} h`} detalle={`Después de las ${HORARIO.salida}`} />
            <Tarjeta titulo={ETQ_DES} color={AMBAR} valor={`${horasDec(r.descansoMin)} h`} detalle="Todo lo trabajado ese día" />
            <Tarjeta
              titulo="Empleados"
              valor={r.empleados}
              detalle={`${r.dias} día${r.dias === 1 ? "" : "s"} con horas extra${r.empleados ? ` · ${horasDec(r.totalMin / r.empleados)} h por empleado` : ""}`}
            />
          </div>

          {!r.filas.length ? (
            <p className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-sm text-slate-500">
              <Clock className="h-4 w-4" />
              Nadie hizo horas extra en el período.
            </p>
          ) : (
            <>
              <Panel
                titulo={agrupar === "dia" ? "Horas extra por día" : "Horas extra por semana (lunes a domingo)"}
                accion={
                  <div className="flex rounded-lg border border-slate-200 p-0.5">
                    {(
                      [
                        ["dia", "Por día"],
                        ["semana", "Por semana"],
                      ] as const
                    ).map(([v, t]) => (
                      <button
                        key={v}
                        onClick={() => setAgrupar(v)}
                        className={`rounded-md px-2.5 py-1 text-xs font-semibold ${agrupar === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                }
              >
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serie} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="x" tick={{ fontSize: 11, fill: "#64748b" }} interval="preserveStartEnd" minTickGap={8} />
                      <YAxis tick={{ fontSize: 11, fill: "#64748b" }} unit=" h" allowDecimals={false} />
                      <Tooltip
                        formatter={tooltipHoras}
                        labelFormatter={(_, p) => (p?.[0]?.payload?.titulo as string) ?? ""}
                        cursor={{ fill: "#f1f5f9" }}
                      />
                      {agrupar === "dia" ? (
                        <>
                          <Legend wrapperStyle={{ fontSize: 12 }} />
                          <Bar dataKey={ETQ_LAB} stackId="a" fill={AZUL} />
                          <Bar dataKey={ETQ_DES} stackId="a" fill={AMBAR} radius={[3, 3, 0, 0]} />
                        </>
                      ) : (
                        <Bar dataKey="Total" fill={AZUL} radius={[3, 3, 0, 0]} />
                      )}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Panel>

              <div className="grid gap-4 lg:grid-cols-2">
                <Panel titulo={`Empleados con más horas extra${r.porEmpleado.length > 10 ? " (los 10 primeros)" : ""}`}>
                  <div style={{ height: Math.max(160, top.length * 30 + 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={top} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} unit=" h" allowDecimals={false} />
                        <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 11, fill: "#334155" }} />
                        <Tooltip
                          formatter={tooltipHoras}
                          labelFormatter={(_, p) => (p?.[0]?.payload?.completo as string) ?? ""}
                          cursor={{ fill: "#f1f5f9" }}
                        />
                        <Bar dataKey={ETQ_LAB} stackId="a" fill={AZUL} />
                        <Bar dataKey={ETQ_DES} stackId="a" fill={AMBAR} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>

                <Panel titulo="Por departamento">
                  <div style={{ height: Math.max(160, deptos.length * 30 + 40) }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={deptos} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "#64748b" }} unit=" h" allowDecimals={false} />
                        <YAxis type="category" dataKey="nombre" width={120} tick={{ fontSize: 11, fill: "#334155" }} />
                        <Tooltip
                          formatter={(v: number, _n, p) => [`${v.toLocaleString("es-VE")} h · ${p.payload.empleados} empleado(s)`, "Horas extra"]}
                          cursor={{ fill: "#f1f5f9" }}
                        />
                        <Bar dataKey="Horas" fill="#6366f1" radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Panel>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[760px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th} />
                      <th className={th}>Código</th>
                      <th className={th}>Empleado</th>
                      <th className={`${th} text-right`}>Días</th>
                      <th className={`${th} text-right`}>{ETQ_LAB}</th>
                      <th className={`${th} text-right`}>{ETQ_DES}</th>
                      <th className={`${th} text-right`}>Total</th>
                      <th className={th}>Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.porEmpleado.map((e) => {
                      const abiertoAqui = abierto === e.codigo;
                      const max = r.porEmpleado[0]?.minutos || 1;
                      const dias = r.filas.filter((f) => f.e.codigo === e.codigo);
                      return (
                        <Fragment key={e.codigo}>
                          <tr className="cursor-pointer hover:bg-blue-50/40" onClick={() => setAbierto(abiertoAqui ? null : e.codigo)}>
                            <td className={`${td} w-8`}>
                              {abiertoAqui ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                            </td>
                            <td className={`${td} font-mono text-xs`}>{e.codigo}</td>
                            <td className={`${td} font-semibold text-slate-900`}>
                              {e.nombre || "(sin nombre)"}
                              {e.departamento && <span className="ml-2 text-xs font-normal text-slate-400">{e.departamento}</span>}
                            </td>
                            <td className={`${td} text-right`}>{e.dias}</td>
                            <td className={`${td} text-right`}>{formatoExtra(e.minutosLaborable)}</td>
                            <td className={`${td} text-right`}>{formatoExtra(e.minutosDescanso)}</td>
                            <td className={`${td} text-right font-semibold text-slate-900`}>{horasDec(e.minutos)} h</td>
                            <td className={`${td} w-40`}>
                              <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
                                <div style={{ width: `${(e.minutosLaborable / max) * 100}%`, background: AZUL }} />
                                <div style={{ width: `${(e.minutosDescanso / max) * 100}%`, background: AMBAR }} />
                              </div>
                            </td>
                          </tr>
                          {abiertoAqui && (
                            <tr>
                              <td colSpan={8} className="bg-slate-50/70 px-4 py-3">
                                <table className="w-full">
                                  <thead>
                                    <tr>
                                      <th className={th}>Fecha</th>
                                      <th className={th}>Tipo</th>
                                      <th className={th}>Entrada</th>
                                      <th className={th}>Salida</th>
                                      <th className={`${th} text-right`}>Horas extra</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dias.map(({ d }) => (
                                      <tr key={d.fecha}>
                                        <td className={`${td} whitespace-nowrap`}>
                                          {fechaCorta(d.fecha)} <span className="text-xs text-slate-400">{nombreDia(d.fecha)}</span>
                                        </td>
                                        <td className={td}>{tipoDiaExtra(d)}</td>
                                        <td className={td}>{d.entrada}</td>
                                        <td className={td}>{d.salida}</td>
                                        <td className={`${td} text-right font-semibold`}>{formatoExtra(d.extraMin)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
