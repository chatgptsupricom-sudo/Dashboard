"use client";

import { BotonExcel } from "@/components/administracion/comunes";
import {
  CAMPOS_CANDIDATO,
  ESTATUS_FINAL,
  SEDES_SELECCION,
  estadoRequisicion,
  hoyCaracas,
  indicadores,
  opcion,
  situacion,
  slaCandidato,
  type Candidato,
  type Requisicion,
} from "@/lib/seleccion/tipos";
import { ClipboardList, Loader2, Plus, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormCandidato, FormRequisicion } from "./Formularios";
import { Indicadores } from "./Indicadores";
import { Matriz, type Grupo } from "./Matriz";

type Vista = "matriz" | "indicadores";
type FiltroEstado = "todas" | "activas" | "cubierta" | "cancelada";

const selCls = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";

export default function PantallaSeleccion() {
  const [requisiciones, setRequisiciones] = useState<Requisicion[]>([]);
  const [candidatos, setCandidatos] = useState<Candidato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vista, setVista] = useState<Vista>("matriz");
  const [sede, setSede] = useState("todas");
  const [estado, setEstado] = useState<FiltroEstado>("activas");
  const [anio, setAnio] = useState("todos");
  const [estatus, setEstatus] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const [formReq, setFormReq] = useState<{ abierto: boolean; req: Requisicion | null }>({ abierto: false, req: null });
  const [formCand, setFormCand] = useState<{ abierto: boolean; cand: Candidato | null; reqId: number | null }>({
    abierto: false,
    cand: null,
    reqId: null,
  });

  const cargar = useCallback(async () => {
    try {
      const r = await fetch("/api/rrhh/seleccion");
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo cargar la matriz");
      setRequisiciones(j.requisiciones || []);
      setCandidatos(j.candidatos || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  /** Cambio en línea desde la matriz: se pinta ya y se deshace si el servidor lo rechaza. */
  const cambiar = async (c: Candidato, cambios: Partial<Candidato>) => {
    setCandidatos((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...cambios } : x)));
    try {
      const r = await fetch(`/api/rrhh/seleccion/candidatos/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      setCandidatos((cs) => cs.map((x) => (x.id === c.id ? j.candidato : x)));
    } catch (e: any) {
      setCandidatos((cs) => cs.map((x) => (x.id === c.id ? c : x)));
      setError(`${c.nombre}: ${e.message}`);
    }
  };

  const hoy = hoyCaracas();
  const anios = useMemo(
    () => [...new Set(requisiciones.map((r) => r.fecha_recepcion.slice(0, 4)))].sort().reverse(),
    [requisiciones],
  );

  // Requisiciones del filtro (sede, año, estado): sobre estas salen los indicadores.
  const reqsFiltradas = useMemo(
    () =>
      requisiciones.filter((r) => {
        if (sede !== "todas" && String(r.sede) !== sede) return false;
        if (anio !== "todos" && !r.fecha_recepcion.startsWith(anio)) return false;
        if (estado === "todas") return true;
        const e = estadoRequisicion(r, candidatos, hoy).estado;
        return estado === "activas" ? e === "abierta" || e === "pausada" : e === estado;
      }),
    [requisiciones, candidatos, sede, anio, estado, hoy],
  );

  const grupos: Grupo[] = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return reqsFiltradas.flatMap((r) => {
      let cs = candidatos.filter((c) => c.requisicion_id === r.id);
      if (estatus !== "todos") cs = cs.filter((c) => c.estatus === estatus);
      if (q) {
        const reqCoincide = [r.codigo, r.cargo, r.unidad_solicitante].some((t) => t.toLowerCase().includes(q));
        if (!reqCoincide) cs = cs.filter((c) => [c.nombre, c.correo, c.telefono].some((t) => t.toLowerCase().includes(q)));
        if (!reqCoincide && !cs.length) return [];
      }
      if (estatus !== "todos" && !cs.length) return [];
      return [{ requisicion: r, estado: estadoRequisicion(r, candidatos, hoy), candidatos: cs }];
    });
  }, [reqsFiltradas, candidatos, busqueda, estatus, hoy]);

  const datosIndicadores = useMemo(() => indicadores(reqsFiltradas, candidatos, hoy), [reqsFiltradas, candidatos, hoy]);

  const hojasExcel = () => {
    const filas = grupos.flatMap(({ requisicion: r, estado: e, candidatos: cs }) => {
      const vacante = {
        "ID requisición": r.codigo,
        "Fecha de recepción": r.fecha_recepcion,
        "Unidad solicitante": r.unidad_solicitante,
        "Cargo vacante": r.cargo,
        Sede: SEDES_SELECCION[r.sede],
        "Estado requisición": e.etiqueta,
      };
      if (!cs.length) return [vacante];
      return cs.map((c) => {
        const fila: Record<string, any> = { ...vacante };
        for (const campo of CAMPOS_CANDIDATO) {
          const v = c[campo.clave];
          fila[campo.etiqueta] = campo.opciones ? (opcion(campo, v as string)?.etiqueta ?? "") : (v ?? "");
        }
        fila["Días totales (SLA)"] = slaCandidato(c, r) ?? "";
        fila["Situación"] = situacion(c).texto;
        return fila;
      });
    });
    const reqs = reqsFiltradas.map((r) => {
      const e = estadoRequisicion(r, candidatos, hoy);
      return {
        "ID requisición": r.codigo,
        "Fecha de recepción": r.fecha_recepcion,
        "Unidad solicitante": r.unidad_solicitante,
        "Cargo vacante": r.cargo,
        Sede: SEDES_SELECCION[r.sede],
        Vacantes: r.vacantes,
        Contratados: e.contratados,
        Estado: e.etiqueta,
        Días: e.dias ?? "",
        "Meta (días)": r.meta_dias,
        "En meta": e.dias == null ? "" : e.dias <= r.meta_dias ? "Sí" : "No",
      };
    });
    const fuentes = datosIndicadores.porFuente.map((f) => ({
      Fuente: f.fuente,
      Candidatos: f.candidatos,
      "En terna": f.terna,
      Contratados: f.contratados,
      "Efectividad %": f.efectividad,
    }));
    return [
      { nombre: "Matriz", filas },
      { nombre: "Requisiciones", filas: reqs },
      { nombre: "Por fuente", filas: fuentes },
      { nombre: "Embudo", filas: datosIndicadores.embudo.map((e) => ({ Fase: e.etiqueta, Candidatos: e.cantidad })) },
    ];
  };

  const unidades = useMemo(() => [...new Set(requisiciones.map((r) => r.unidad_solicitante).filter(Boolean))], [requisiciones]);
  const sedeInicial = sede !== "todas" ? Number(sede) : 9;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-600">
            <ClipboardList className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900">Selección de personal</h1>
            <p className="text-sm text-slate-500">Matriz de rastreo y seguimiento: de la requisición al ingreso</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <BotonExcel archivo={`seleccion-personal-${hoy}`} hojas={hojasExcel} />
          <button
            onClick={() => setFormCand({ abierto: true, cand: null, reqId: null })}
            disabled={!requisiciones.length}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-blue-300 disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" /> Candidato
          </button>
          <button
            onClick={() => setFormReq({ abierto: true, req: null })}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nueva requisición
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-slate-200 bg-white p-1">
          {(
            [
              ["matriz", "Matriz"],
              ["indicadores", "Indicadores de tiempo"],
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
        <select className={selCls} value={sede} onChange={(e) => setSede(e.target.value)} aria-label="Sede">
          <option value="todas">Todas las sedes</option>
          {Object.entries(SEDES_SELECCION).map(([id, n]) => (
            <option key={id} value={id}>
              {n}
            </option>
          ))}
        </select>
        <select className={selCls} value={estado} onChange={(e) => setEstado(e.target.value as FiltroEstado)} aria-label="Estado">
          <option value="activas">Abiertas y en pausa</option>
          <option value="cubierta">Cubiertas</option>
          <option value="cancelada">Canceladas</option>
          <option value="todas">Todas las requisiciones</option>
        </select>
        <select className={selCls} value={anio} onChange={(e) => setAnio(e.target.value)} aria-label="Año">
          <option value="todos">Todos los años</option>
          {anios.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        {vista === "matriz" && (
          <>
            <select className={selCls} value={estatus} onChange={(e) => setEstatus(e.target.value)} aria-label="Estatus del candidato">
              <option value="todos">Todos los candidatos</option>
              {ESTATUS_FINAL.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar requisición, cargo o candidato…"
              className={`${selCls} w-full sm:w-72`}
            />
          </>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {cargando ? (
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" />
      ) : !requisiciones.length ? (
        <div className="mx-auto max-w-lg rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <h2 className="mt-3 text-lg font-bold text-slate-800">Todavía no hay requisiciones</h2>
          <p className="mt-1 text-sm text-slate-500">
            Cada proceso empieza con la requisición de personal que manda la unidad solicitante. Regístrala y luego agrega a
            los candidatos para seguirlos fase por fase.
          </p>
          <button
            onClick={() => setFormReq({ abierto: true, req: null })}
            className="mx-auto mt-5 flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Nueva requisición
          </button>
        </div>
      ) : vista === "matriz" ? (
        <Matriz
          grupos={grupos}
          puedeEditar
          onCambiar={cambiar}
          onEditarCandidato={(c) => setFormCand({ abierto: true, cand: c, reqId: c.requisicion_id })}
          onNuevoCandidato={(id) => setFormCand({ abierto: true, cand: null, reqId: id })}
          onEditarRequisicion={(r) => setFormReq({ abierto: true, req: r })}
        />
      ) : (
        <Indicadores datos={datosIndicadores} />
      )}

      <FormRequisicion
        abierto={formReq.abierto}
        requisicion={formReq.req}
        unidades={unidades}
        sedeInicial={sedeInicial}
        onCerrar={() => setFormReq({ abierto: false, req: null })}
        onGuardado={() => {
          setFormReq({ abierto: false, req: null });
          cargar();
        }}
      />
      <FormCandidato
        abierto={formCand.abierto}
        candidato={formCand.cand}
        requisiciones={requisiciones}
        requisicionInicial={formCand.reqId}
        onCerrar={() => setFormCand({ abierto: false, cand: null, reqId: null })}
        onGuardado={() => {
          setFormCand({ abierto: false, cand: null, reqId: null });
          cargar();
        }}
      />
    </div>
  );
}
