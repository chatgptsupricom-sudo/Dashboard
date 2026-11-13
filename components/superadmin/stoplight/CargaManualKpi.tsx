"use client";

// Carga a mano del valor de un KPI por departamento (lib/stoplight/departamentos)
// en el detalle del Stoplight. Solo el SuperAdmin la edita; los demás ven de
// dónde salió el número.

import { useEffect, useState } from "react";
import type { KpiDepto } from "@/lib/stoplight/departamentos/datos";
import { sufijoUnidad } from "@/lib/stoplight/departamentos/definiciones";

const PERIODO: Record<string, string> = { trimestre: "del trimestre", semestre: "del semestre", anio: "del año" };

function texto(v: number | null, k: KpiDepto): string {
  if (v == null) return "sin dato";
  const n = new Intl.NumberFormat("es-VE", { maximumFractionDigits: 2 }).format(v);
  return k.unidad === "$" ? `$${n}` : `${n}${sufijoUnidad(k.unidad)}`;
}

export default function CargaManualKpi({
  kpi,
  mes,
  companyId,
  editable,
  onGuardado,
}: {
  kpi: KpiDepto;
  mes: string;
  companyId: number;
  editable: boolean;
  onGuardado: () => void | Promise<void>;
}) {
  const [valor, setValor] = useState(kpi.manualMes ? String(kpi.manualMes.valor) : "");
  const [nota, setNota] = useState(kpi.manualMes?.nota ?? "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValor(kpi.manualMes ? String(kpi.manualMes.valor) : "");
    setNota(kpi.manualMes?.nota ?? "");
    setError(null);
  }, [kpi.key, kpi.manualMes?.valor, kpi.manualMes?.nota]);

  const guardar = async (borrar = false) => {
    setGuardando(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/stoplight/departamentos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kpi_key: kpi.key, company_id: companyId, mes, valor: borrar ? null : valor, nota: borrar ? null : nota }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) throw new Error(json.error || `Error ${res.status}`);
      if (borrar) {
        setValor("");
        setNota("");
      }
      await onGuardado();
    } catch (e: any) {
      setError(e?.message || "No se pudo guardar");
    }
    setGuardando(false);
  };

  const periodo = kpi.acumula && kpi.acumula !== "mes" ? PERIODO[kpi.acumula] : null;
  const input = "rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-300";

  return (
    <section className="mb-5 rounded-xl border border-slate-200 p-4">
      <p className="mb-2 text-[13px] font-medium text-slate-700">De dónde sale el valor</p>
      <ul className="space-y-1 text-sm text-slate-600">
        {kpi.fuente !== "manual" && (
          <li>
            Calculado por el panel: <span className="font-medium tabular-nums text-slate-800">{texto(kpi.valorAuto, kpi)}</span>
            {kpi.detalle && kpi.origen === "auto" && <span className="text-slate-400"> · {kpi.detalle}</span>}
          </li>
        )}
        <li>
          Cargado a mano este mes:{" "}
          <span className="font-medium tabular-nums text-slate-800">{kpi.manualMes ? texto(kpi.manualMes.valor, kpi) : "nada"}</span>
          {kpi.manualMes?.por && (
            <span className="text-slate-400">
              {" "}· {kpi.manualMes.por}
              {kpi.manualMes.el ? `, ${new Date(kpi.manualMes.el).toLocaleString("es-VE", { dateStyle: "short", timeStyle: "short" })}` : ""}
            </span>
          )}
        </li>
        {kpi.manualMes?.nota && <li className="text-slate-500">Nota: {kpi.manualMes.nota}</li>}
        {periodo && (
          <li>
            Suma {periodo}: <span className="font-medium tabular-nums text-slate-800">{texto(kpi.valor, kpi)}</span>
            {kpi.esperado != null && <span className="text-slate-400"> · a la fecha se esperaba {texto(Math.round(kpi.esperado * 10) / 10, kpi)}</span>}
          </li>
        )}
        <li className="text-slate-400">
          {kpi.origen === "manual" ? "La fila usa lo cargado a mano." : kpi.origen === "auto" ? "La fila usa el cálculo del panel." : "La fila queda sin dato hasta que se cargue."}
        </li>
      </ul>

      {editable && kpi.fuente !== "auto" && (
        <div className="mt-4 border-t border-slate-100 pt-4">
          <p className="mb-2 text-[13px] font-medium text-slate-700">
            Cargar el valor de este mes
            {periodo && <span className="font-normal text-slate-400"> (lo hecho en el mes; la fila suma {periodo})</span>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1">
              {kpi.unidad === "$" && <span className="text-sm text-slate-400">$</span>}
              <input
                type="number"
                min={0}
                step="any"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className={`${input} w-28 text-right tabular-nums`}
                aria-label="Valor del mes"
              />
              <span className="text-xs text-slate-400">{sufijoUnidad(kpi.unidad).trim()}</span>
            </span>
            <input
              type="text"
              value={nota}
              maxLength={500}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Nota (de dónde sale, quién lo reportó)"
              className={`${input} min-w-[200px] flex-1`}
            />
            <button
              type="button"
              disabled={guardando || valor.trim() === ""}
              onClick={() => guardar(false)}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
            >
              {guardando ? "Guardando…" : "Guardar"}
            </button>
            {kpi.manualMes && (
              <button
                type="button"
                disabled={guardando}
                onClick={() => guardar(true)}
                className="rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-40"
              >
                Quitar la carga
              </button>
            )}
          </div>
          {kpi.fuente === "mixto" && (
            <p className="mt-2 text-[11px] text-slate-400">Lo que se cargue reemplaza el cálculo del panel; al quitarlo vuelve el cálculo.</p>
          )}
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
      )}
    </section>
  );
}
