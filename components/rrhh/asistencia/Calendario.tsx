"use client";

import { Button } from "@/components/ui/button";
import { DIAS_SEMANA, SEDES_ASISTENCIA, diaSemana, type DiaEspecial } from "@/lib/asistencia/tipos";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Pastilla, fechaCorta } from "../seleccion/comunes";

const inputCls = "rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";

/** Sábados de inventario (se trabajan 8:00 a 4:30) y feriados (no se cuentan ausencias). */
export function Calendario({ sede, onCambio }: { sede: number; onCambio: () => void }) {
  const [dias, setDias] = useState<DiaEspecial[]>([]);
  const [cargando, setCargando] = useState(true);
  const [f, setF] = useState({ fecha: "", tipo: "inventario", sede: String(sede), nota: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = () =>
    fetch("/api/rrhh/asistencia/dias")
      .then((r) => r.json())
      .then((j) => setDias(j.dias || []))
      .finally(() => setCargando(false));

  useEffect(() => {
    cargar();
  }, []);
  useEffect(() => setF((p) => ({ ...p, sede: String(sede) })), [sede]);

  const agregar = async () => {
    setGuardando(true);
    setError(null);
    try {
      const r = await fetch("/api/rrhh/asistencia/dias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, sede: Number(f.sede) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "No se pudo guardar");
      setF((p) => ({ ...p, fecha: "", nota: "" }));
      await cargar();
      onCambio();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (d: DiaEspecial) => {
    await fetch(`/api/rrhh/asistencia/dias?id=${d.id}`, { method: "DELETE" });
    await cargar();
    onCambio();
  };

  const esSabado = f.fecha && diaSemana(f.fecha) === 6;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800">Agregar un día</h3>
        <p className="mt-1 text-xs text-slate-500">
          Los sábados solo se trabajan si hay inventario: márcalos aquí y ese día se evalúa con el horario de 8:00 a 4:30. En un feriado no
          se cuentan ausencias.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="block text-xs font-semibold text-slate-600">Fecha</span>
            <input type="date" className={inputCls} value={f.fecha} onChange={(e) => setF({ ...f, fecha: e.target.value })} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold text-slate-600">Tipo</span>
            <select className={inputCls} value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
              <option value="inventario">Sábado de inventario</option>
              <option value="feriado">Feriado / no laborable</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold text-slate-600">Sede</span>
            <select className={inputCls} value={f.sede} onChange={(e) => setF({ ...f, sede: e.target.value })}>
              <option value="0">Todas las sedes</option>
              {Object.entries(SEDES_ASISTENCIA).map(([id, n]) => (
                <option key={id} value={id}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[200px] flex-1 space-y-1">
            <span className="block text-xs font-semibold text-slate-600">Nota</span>
            <input className={`${inputCls} w-full`} value={f.nota} onChange={(e) => setF({ ...f, nota: e.target.value })} placeholder="Ej. Inventario de fin de mes" />
          </label>
          <Button onClick={agregar} disabled={guardando || !f.fecha || (f.tipo === "inventario" && !esSabado)}>
            {guardando ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Plus className="mr-1.5 h-4 w-4" />} Agregar
          </Button>
        </div>
        {f.fecha && f.tipo === "inventario" && !esSabado && (
          <p className="mt-2 text-xs text-amber-700">El {fechaCorta(f.fecha)} es {DIAS_SEMANA[diaSemana(f.fecha)]}: el día de inventario tiene que ser sábado.</p>
        )}
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              {["Fecha", "Tipo", "Sede", "Nota", ""].map((h) => (
                <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-600">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cargando && (
              <tr>
                <td colSpan={5} className="py-6">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
                </td>
              </tr>
            )}
            {!cargando && !dias.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                  Sin sábados de inventario ni feriados cargados.
                </td>
              </tr>
            )}
            {dias.map((d) => (
              <tr key={d.id} className="border-t border-slate-100">
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                  {fechaCorta(d.fecha)} <span className="text-xs text-slate-400">{DIAS_SEMANA[diaSemana(d.fecha)]}</span>
                </td>
                <td className="px-3 py-2">
                  <Pastilla tono={d.tipo === "inventario" ? "azul" : "gris"}>{d.tipo === "inventario" ? "Inventario" : "Feriado"}</Pastilla>
                </td>
                <td className="px-3 py-2">{d.sede ? SEDES_ASISTENCIA[d.sede] : "Todas"}</td>
                <td className="px-3 py-2 text-slate-600">{d.nota}</td>
                <td className="px-3 py-2 text-right">
                  <button onClick={() => quitar(d)} className="text-slate-400 hover:text-red-600" title="Quitar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
