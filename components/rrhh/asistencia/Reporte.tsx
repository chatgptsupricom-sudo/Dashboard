"use client";

import { BotonExcel } from "@/components/administracion/comunes";
import {
  DIAS_SEMANA,
  ETIQUETA_ESTADO,
  HORARIO,
  SEDES_ASISTENCIA,
  diaSemana,
  formatoMin,
  hoyCaracas,
  type Dia,
  type Reporte as DatosReporte,
  type ResumenEmpleado,
} from "@/lib/asistencia/tipos";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Pastilla, fechaCorta } from "../seleccion/comunes";

const selCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";
const th = "whitespace-nowrap px-3 py-2 text-left text-xs font-semibold text-slate-600";
const td = "border-t border-slate-100 px-3 py-2 text-sm tabular-nums text-slate-700";

const nombreDia = (f: string) => DIAS_SEMANA[diaSemana(f)];

/** En «Por día» van primero los que faltaron y los que llegaron tarde. */
const ORDEN_DIA: Dia["estado"][] = ["ausente", "retardo", "sin_entrada", "puntual", "no_laborable"];

/** Etiquetas de un día: estado + lo que falló aparte (salida antes, sin salida). */
export function EtiquetasDia({ d }: { d: Dia }) {
  const e = ETIQUETA_ESTADO[d.estado];
  return (
    <div className="flex flex-wrap gap-1">
      <Pastilla tono={e.tono}>
        {e.texto}
        {d.estado === "retardo" ? ` · ${formatoMin(d.retardoMin)}` : ""}
      </Pastilla>
      {d.laborable && d.salidaAnticipadaMin > 0 && (
        <Pastilla tono="ambar">Salió antes · {formatoMin(d.salidaAnticipadaMin)}</Pastilla>
      )}
      {d.laborable && d.sinSalida && <Pastilla tono="gris">Sin marca de salida</Pastilla>}
    </div>
  );
}

function Tarjeta({ titulo, valor, detalle }: { titulo: string; valor: string | number; detalle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{valor}</p>
      {detalle && <p className="mt-0.5 text-xs text-slate-500">{detalle}</p>}
    </div>
  );
}

const inicioMes = () => `${hoyCaracas().slice(0, 8)}01`;

export function Reporte({ sede }: { sede: number }) {
  const [desde, setDesde] = useState(inicioMes);
  const [hasta, setHasta] = useState(hoyCaracas);
  const [datos, setDatos] = useState<DatosReporte | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vista, setVista] = useState<"empleados" | "dia">("empleados");
  const [busqueda, setBusqueda] = useState("");
  const [soloIncidencias, setSoloIncidencias] = useState(false);
  const [departamento, setDepartamento] = useState("");
  const [abierto, setAbierto] = useState<string | null>(null);
  const [dia, setDia] = useState(hoyCaracas);

  useEffect(() => {
    setCargando(true);
    setError(null);
    fetch(`/api/rrhh/asistencia?sede=${sede}&desde=${desde}&hasta=${hasta}`)
      .then((r) => r.json().then((j) => (r.ok ? j : Promise.reject(new Error(j?.error || "Error")))))
      .then((j: DatosReporte) => {
        setDatos(j);
        // El día a mirar: el último con datos dentro del rango.
        const ultimo = j.cobertura && j.cobertura < hasta ? j.cobertura : hasta;
        setDia((d) => (d >= desde && d <= ultimo ? d : ultimo));
      })
      .catch((e) => setError(e.message))
      .finally(() => setCargando(false));
  }, [sede, desde, hasta]);

  const empleados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos?.empleados ?? []).filter((e) => {
      if (q && !`${e.codigo} ${e.nombre}`.toLowerCase().includes(q)) return false;
      if (departamento && e.departamento !== departamento) return false;
      if (soloIncidencias && !(e.retardos || e.ausencias || e.salidasAnticipadas || e.sinMarca)) return false;
      return true;
    });
  }, [datos, busqueda, soloIncidencias, departamento]);

  const departamentos = useMemo(
    () => [...new Set((datos?.empleados ?? []).map((e) => e.departamento).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [datos],
  );

  const total = (f: (e: ResumenEmpleado) => number) => empleados.reduce((s, e) => s + f(e), 0);

  const delDia = useMemo(
    () =>
      empleados.flatMap((e) => {
        const d = e.dias.find((x) => x.fecha === dia);
        return d ? [{ e, d }] : [];
      }).sort((a, b) => ORDEN_DIA.indexOf(a.d.estado) - ORDEN_DIA.indexOf(b.d.estado) || (a.d.entrada ?? "").localeCompare(b.d.entrada ?? "")),
    [empleados, dia],
  );

  const hojas = () => [
    {
      nombre: "Resumen",
      filas: empleados.map((e) => ({
        Código: e.codigo,
        Nombre: e.nombre,
        Departamento: e.departamento,
        "Días laborables": e.laborables,
        Asistencias: e.asistencias,
        Retardos: e.retardos,
        "Minutos de retardo": e.minutosRetardo,
        Ausencias: e.ausencias,
        "Salidas antes de hora": e.salidasAnticipadas,
        "Sin marca": e.sinMarca,
        Horas: e.horas,
      })),
    },
    {
      nombre: "Detalle por día",
      filas: empleados.flatMap((e) =>
        e.dias.map((d) => ({
          Código: e.codigo,
          Nombre: e.nombre,
          Departamento: e.departamento,
          Fecha: d.fecha,
          Día: nombreDia(d.fecha),
          Tipo: d.especial === "inventario" ? "Sábado de inventario" : d.laborable ? "Laborable" : "No laborable",
          Entrada: d.entrada ?? "",
          Salida: d.salida ?? "",
          Estado: ETIQUETA_ESTADO[d.estado].texto,
          "Minutos de retardo": d.retardoMin || "",
          "Salió antes (min)": d.salidaAnticipadaMin || "",
          "Sin marca de salida": d.laborable && d.sinSalida ? "Sí" : "",
          Marcas: d.marcas.join(" "),
        })),
      ),
    },
  ];

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
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ["empleados", "Por empleado"],
              ["dia", "Por día"],
            ] as const
          ).map(([v, t]) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${vista === v ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              {t}
            </button>
          ))}
        </div>
        {vista === "dia" && (
          <input type="date" className={selCls} value={dia} min={desde} max={hasta} onChange={(e) => e.target.value && setDia(e.target.value)} />
        )}
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
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={soloIncidencias} onChange={(e) => setSoloIncidencias(e.target.checked)} />
          Solo con incidencias
        </label>
        <div className="ml-auto">
          <BotonExcel archivo={`asistencia-${SEDES_ASISTENCIA[sede]}-${desde}-a-${hasta}`} hojas={hojas} />
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Horario: lunes a viernes de {HORARIO.entrada} a {HORARIO.salida} (y los sábados de inventario del calendario). Retardo = entrada después de
        las {HORARIO.entrada}.
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
              Hay marcas cargadas hasta el {fechaCorta(datos.cobertura)} ({nombreDia(datos.cobertura)}): los días siguientes no se evalúan
              hasta que se suba el Excel que los traiga.
            </p>
          )}

          {vista === "empleados" ? (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Tarjeta titulo="Empleados" valor={empleados.length} />
                <Tarjeta titulo="Retardos" valor={total((e) => e.retardos)} detalle={formatoMin(total((e) => e.minutosRetardo))} />
                <Tarjeta titulo="Ausencias" valor={total((e) => e.ausencias)} detalle="Días laborables sin ninguna marca" />
                <Tarjeta titulo="Salidas antes de hora" valor={total((e) => e.salidasAnticipadas)} />
                <Tarjeta titulo="Días sin una marca" valor={total((e) => e.sinMarca)} detalle="Falta la entrada o la salida" />
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={th} />
                      <th className={th}>Código</th>
                      <th className={th}>Empleado</th>
                      <th className={`${th} text-right`}>Días laborables</th>
                      <th className={`${th} text-right`}>Asistió</th>
                      <th className={`${th} text-right`}>Retardos</th>
                      <th className={`${th} text-right`}>Ausencias</th>
                      <th className={`${th} text-right`}>Salió antes</th>
                      <th className={`${th} text-right`}>Sin marca</th>
                      <th className={`${th} text-right`}>Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!empleados.length && (
                      <tr>
                        <td colSpan={10} className={`${td} py-8 text-center text-slate-400`}>
                          Sin resultados.
                        </td>
                      </tr>
                    )}
                    {empleados.map((e) => {
                      const abiertoAqui = abierto === e.codigo;
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
                              {!e.activo && <span className="ml-2 text-xs font-normal text-slate-400">inactivo</span>}
                            </td>
                            <td className={`${td} text-right`}>{e.laborables}</td>
                            <td className={`${td} text-right`}>{e.asistencias}</td>
                            <td className={`${td} text-right ${e.retardos ? "font-semibold text-amber-700" : ""}`}>
                              {e.retardos}
                              {e.retardos > 0 && <span className="ml-1 text-xs font-normal text-slate-500">({formatoMin(e.minutosRetardo)})</span>}
                            </td>
                            <td className={`${td} text-right ${e.ausencias ? "font-semibold text-red-700" : ""}`}>{e.ausencias}</td>
                            <td className={`${td} text-right`}>{e.salidasAnticipadas}</td>
                            <td className={`${td} text-right`}>{e.sinMarca}</td>
                            <td className={`${td} text-right`}>{e.horas}</td>
                          </tr>
                          {abiertoAqui && (
                            <tr>
                              <td colSpan={10} className="bg-slate-50/70 px-4 py-3">
                                <table className="w-full">
                                  <thead>
                                    <tr>
                                      <th className={th}>Fecha</th>
                                      <th className={th}>Entrada</th>
                                      <th className={th}>Salida</th>
                                      <th className={th}>Marcas</th>
                                      <th className={th}>Resultado</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {e.dias.map((d) => (
                                      <tr key={d.fecha}>
                                        <td className={`${td} whitespace-nowrap`}>
                                          {fechaCorta(d.fecha)} <span className="text-xs text-slate-400">{nombreDia(d.fecha)}</span>
                                          {d.especial === "inventario" && <span className="ml-1 text-xs text-indigo-600">inventario</span>}
                                        </td>
                                        <td className={td}>{d.entrada ?? "—"}</td>
                                        <td className={td}>{d.salida ?? "—"}</td>
                                        <td className={`${td} text-xs text-slate-500`}>{d.marcas.join(" · ") || "—"}</td>
                                        <td className={td}>
                                          <EtiquetasDia d={d} />
                                        </td>
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
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 p-4">
                <h3 className="text-sm font-bold capitalize text-slate-800">
                  {nombreDia(dia)} {fechaCorta(dia)}
                </h3>
                <p className="text-xs text-slate-500">
                  {delDia.filter((x) => x.d.estado === "retardo").length} retardos ·{" "}
                  {delDia.filter((x) => x.d.estado === "ausente").length} ausentes · {delDia.filter((x) => x.d.marcas.length).length} marcaron
                </p>
              </div>
              <table className="w-full min-w-[700px]">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={th}>Código</th>
                    <th className={th}>Empleado</th>
                    <th className={th}>Entrada</th>
                    <th className={th}>Salida</th>
                    <th className={th}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {!delDia.length && (
                    <tr>
                      <td colSpan={5} className={`${td} py-8 text-center text-slate-400`}>
                        {dia > (datos.cobertura ?? "") ? "Ese día todavía no tiene marcas cargadas." : "No es día laborable y nadie marcó."}
                      </td>
                    </tr>
                  )}
                  {delDia.map(({ e, d }) => (
                    <tr key={e.codigo}>
                      <td className={`${td} font-mono text-xs`}>{e.codigo}</td>
                      <td className={`${td} font-semibold text-slate-900`}>
                        {e.nombre || "(sin nombre)"}
                        {e.departamento && <span className="ml-2 text-xs font-normal text-slate-400">{e.departamento}</span>}
                      </td>
                      <td className={td}>{d.entrada ?? "—"}</td>
                      <td className={td}>{d.salida ?? "—"}</td>
                      <td className={td}>
                        <EtiquetasDia d={d} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
