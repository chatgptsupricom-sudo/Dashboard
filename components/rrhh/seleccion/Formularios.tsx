"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BLOQUES,
  CAMPO_POR_CLAVE,
  CAMPOS_CANDIDATO,
  ESTADOS_REQUISICION,
  FUENTES,
  META_DIAS_DEFECTO,
  SEDES_SELECCION,
  UNIDADES,
  hoyCaracas,
  opcion,
  type CampoCandidato,
  type Candidato,
  type Requisicion,
} from "@/lib/seleccion/tipos";
import { History, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { inputCls } from "./comunes";

async function enviar(url: string, method: string, cuerpo?: object) {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
  return j;
}

function Etiqueta({ texto, ayuda, children }: { texto: string; ayuda?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-semibold text-slate-600">{texto}</span>
      {children}
      {ayuda && <span className="block text-[11px] text-slate-400">{ayuda}</span>}
    </label>
  );
}

/* -------------------------------------------------------------- requisición */

export function FormRequisicion({
  abierto,
  requisicion,
  unidades,
  sedeInicial,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  requisicion: Requisicion | null;
  unidades: string[];
  sedeInicial: number;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const nuevo = () => ({
    codigo: "",
    fecha_recepcion: hoyCaracas(),
    unidad_solicitante: "",
    cargo: "",
    sede: sedeInicial,
    vacantes: 1,
    meta_dias: META_DIAS_DEFECTO,
    estado: "abierta",
    notas: "",
    motivo_estado: "",
  });
  const [f, setF] = useState(nuevo);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setF(requisicion ? { ...requisicion, motivo_estado: "" } : nuevo());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, requisicion]);

  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      // Las requisiciones nacen de las solicitudes de personal aprobadas: aquí solo se editan.
      if (requisicion) await enviar(`/api/rrhh/seleccion/requisiciones/${requisicion.id}`, "PUT", f);
      onGuardado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!requisicion || !confirm(`¿Borrar la requisición ${requisicion.codigo}?`)) return;
    setGuardando(true);
    try {
      await enviar(`/api/rrhh/seleccion/requisiciones/${requisicion.id}`, "DELETE");
      onGuardado();
    } catch (e: any) {
      setError(e.message);
      setGuardando(false);
    }
  };

  const listaUnidades = [...new Set([...UNIDADES, ...unidades])].sort();

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{requisicion ? `Requisición ${requisicion.codigo}` : "Nueva requisición de personal"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Etiqueta texto="ID requisición" ayuda="Identifica la solicitud formal de personal. Ej.: REQ-2026-004">
            <input
              className={inputCls}
              value={f.codigo}
              onChange={(e) => set("codigo", e.target.value)}
              placeholder={requisicion ? "" : "Automático (REQ-AAAA-001)"}
            />
          </Etiqueta>
          <Etiqueta texto="Fecha de recepción" ayuda="Desde aquí se cuentan los días del proceso.">
            <input type="date" className={inputCls} value={f.fecha_recepcion} onChange={(e) => set("fecha_recepcion", e.target.value)} />
          </Etiqueta>
          <Etiqueta texto="Unidad solicitante" ayuda="Cliente interno / entrevistador técnico. Ej.: Ventas">
            <input
              className={inputCls}
              list="seleccion-unidades"
              value={f.unidad_solicitante}
              onChange={(e) => set("unidad_solicitante", e.target.value)}
            />
            <datalist id="seleccion-unidades">
              {listaUnidades.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </Etiqueta>
          <Etiqueta texto="Cargo vacante" ayuda="Según el perfil de cargo. Ej.: Vendedor de calle">
            <input className={inputCls} value={f.cargo} onChange={(e) => set("cargo", e.target.value)} />
          </Etiqueta>
          <Etiqueta texto="Sede" ayuda="Dónde va a trabajar la persona.">
            <select className={inputCls} value={f.sede} onChange={(e) => set("sede", Number(e.target.value))}>
              {Object.entries(SEDES_SELECCION).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </Etiqueta>
          <div className="grid grid-cols-2 gap-3">
            <Etiqueta texto="Vacantes" ayuda="Personas a contratar.">
              <input type="number" min={1} className={inputCls} value={f.vacantes} onChange={(e) => set("vacantes", e.target.value)} />
            </Etiqueta>
            <Etiqueta texto="Meta (días)" ayuda="Tiempo de cobertura esperado. Alta 15, Media 30, Baja 60.">
              <input type="number" min={1} className={inputCls} value={f.meta_dias} onChange={(e) => set("meta_dias", e.target.value)} />
            </Etiqueta>
          </div>
          {requisicion && (
            <Etiqueta texto="Estado" ayuda="«Cubierta» se pone sola al contratar las vacantes.">
              <select className={inputCls} value={f.estado} onChange={(e) => set("estado", e.target.value)}>
                {ESTADOS_REQUISICION.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </select>
            </Etiqueta>
          )}
          {requisicion && f.estado !== requisicion.estado && (f.estado === "pausada" || f.estado === "cancelada") && (
            <div className="sm:col-span-2">
              <Etiqueta texto="Motivo *" ayuda="Lo ve el gerente que pidió el cargo y le llega por correo.">
                <textarea rows={2} className={inputCls} value={f.motivo_estado} onChange={(e) => set("motivo_estado", e.target.value)} />
              </Etiqueta>
            </div>
          )}
          <div className="sm:col-span-2">
            <Etiqueta texto="Notas" ayuda="Lo que sirva para la búsqueda. Si viene de una solicitud, aquí están el perfil y quién la aprobó.">
              <textarea rows={3} className={inputCls} value={f.notas} onChange={(e) => set("notas", e.target.value)} />
            </Etiqueta>
          </div>
        </div>
        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          {requisicion ? (
            <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={borrar} disabled={guardando}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Borrar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------- candidato */

type Evento = { id: number; campo: string; antes: string | null; despues: string | null; usuario: string | null; fecha: string | null };

function legible(campo: string, v: string | null): string {
  if (v == null || v === "") return "vacío";
  const c = CAMPO_POR_CLAVE.get(campo);
  return opcion(c, v)?.etiqueta ?? v;
}

function Historial({ id }: { id: number }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  useEffect(() => {
    fetch(`/api/rrhh/seleccion/candidatos/${id}`)
      .then((r) => r.json())
      .then((j) => setEventos(j.historial || []))
      .catch(() => setEventos([]));
  }, [id]);
  if (!eventos) return <Loader2 className="h-4 w-4 animate-spin text-slate-400" />;
  if (!eventos.length) return <p className="text-xs text-slate-400">Sin cambios registrados.</p>;
  return (
    <ul className="max-h-48 space-y-1.5 overflow-y-auto text-xs">
      {eventos.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-2 text-slate-600">
          <span className="tabular-nums text-slate-400">
            {e.fecha ? new Date(e.fecha).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" }) : ""}
          </span>
          {e.campo === "alta" ? (
            <span>Registró al candidato</span>
          ) : (
            <span>
              <b className="font-semibold text-slate-700">{CAMPO_POR_CLAVE.get(e.campo)?.etiqueta ?? e.campo}</b>:{" "}
              {legible(e.campo, e.antes)} → {legible(e.campo, e.despues)}
            </span>
          )}
          {e.usuario && <span className="text-slate-400">· {e.usuario}</span>}
        </li>
      ))}
    </ul>
  );
}

function CampoForm({ campo, valor, onChange }: { campo: CampoCandidato; valor: any; onChange: (v: any) => void }) {
  switch (campo.tipo) {
    case "fecha":
      return <input type="date" className={inputCls} value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)} />;
    case "opcion":
      return (
        <select className={inputCls} value={valor ?? ""} onChange={(e) => onChange(e.target.value || null)}>
          {campo.clave !== "estatus" && <option value="">—</option>}
          {campo.opciones!.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.etiqueta}
            </option>
          ))}
        </select>
      );
    case "textoLargo":
      return <textarea rows={2} className={inputCls} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />;
    case "fuente":
      return (
        <>
          <input className={inputCls} list="seleccion-fuentes" value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />
          <datalist id="seleccion-fuentes">
            {FUENTES.map((x) => (
              <option key={x} value={x} />
            ))}
          </datalist>
        </>
      );
    default:
      return <input className={inputCls} value={valor ?? ""} onChange={(e) => onChange(e.target.value)} />;
  }
}

export function FormCandidato({
  abierto,
  candidato,
  requisiciones,
  requisicionInicial,
  onCerrar,
  onGuardado,
}: {
  abierto: boolean;
  candidato: Candidato | null;
  requisiciones: Requisicion[];
  requisicionInicial: number | null;
  onCerrar: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState<Record<string, any>>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verHistorial, setVerHistorial] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setVerHistorial(false);
    setF(candidato ? { ...candidato } : { requisicion_id: requisicionInicial ?? requisiciones[0]?.id ?? "", estatus: "en_proceso" });
  }, [abierto, candidato, requisicionInicial, requisiciones]);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      if (candidato) await enviar(`/api/rrhh/seleccion/candidatos/${candidato.id}`, "PATCH", f);
      else await enviar("/api/rrhh/seleccion/candidatos", "POST", f);
      onGuardado();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async () => {
    if (!candidato || !confirm(`¿Borrar a ${candidato.nombre} de la matriz? Se pierde su historial.`)) return;
    setGuardando(true);
    try {
      await enviar(`/api/rrhh/seleccion/candidatos/${candidato.id}`, "DELETE");
      onGuardado();
    } catch (e: any) {
      setError(e.message);
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{candidato ? candidato.nombre : "Nuevo candidato"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{BLOQUES[0].titulo}</h3>
            <select
              className={inputCls}
              value={f.requisicion_id ?? ""}
              onChange={(e) => setF((p) => ({ ...p, requisicion_id: Number(e.target.value) }))}
            >
              {requisiciones.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.codigo} · {r.cargo} {r.unidad_solicitante ? `(${r.unidad_solicitante})` : ""} · {SEDES_SELECCION[r.sede]}
                </option>
              ))}
            </select>
          </section>

          {BLOQUES.slice(1).map((b) => (
            <section key={b.clave} className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">{b.titulo}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {CAMPOS_CANDIDATO.filter((c) => c.bloque === b.clave).map((c) => (
                  <div key={c.clave} className={c.tipo === "textoLargo" ? "sm:col-span-2 lg:col-span-3" : ""}>
                    <Etiqueta texto={c.etiqueta} ayuda={c.ayuda}>
                      <CampoForm campo={c} valor={f[c.clave]} onChange={(v) => setF((p) => ({ ...p, [c.clave]: v }))} />
                    </Etiqueta>
                  </div>
                ))}
              </div>
            </section>
          ))}

          {candidato && (
            <section className="space-y-2 rounded-xl border border-slate-200 p-3">
              <button
                type="button"
                onClick={() => setVerHistorial((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-blue-700"
              >
                <History className="h-3.5 w-3.5" /> {verHistorial ? "Ocultar historial" : "Ver historial de cambios"}
              </button>
              {verHistorial && <Historial id={candidato.id} />}
            </section>
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <DialogFooter className="gap-2 sm:justify-between">
          {candidato ? (
            <Button variant="ghost" className="text-red-600 hover:bg-red-50 hover:text-red-700" onClick={borrar} disabled={guardando}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Borrar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onCerrar}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
