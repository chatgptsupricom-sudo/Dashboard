"use client";

// Campañas de los leads de Excel: cada hoja del Excel es una campaña. El nombre
// sale de la hoja (lib/adminleads/recompra.ts, campanaDeHoja) y se puede cambiar
// por el de la campaña de Meta de esas fechas.

import { Check, ChevronDown, ChevronRight, Loader2, Megaphone, Pencil, RotateCcw, X } from "lucide-react";
import { useState } from "react";

const SEDES: Record<number, string> = { 9: "Valencia", 10: "Caracas", 7: "Panamá" };

export type CampanaHoja = {
  company_id: number;
  hoja: string;
  campana_hoja: string | null;
  campana_editada: string | null;
  leads: number;
  vendidos: number;
  desde: string | null;
  hasta: string | null;
};

/** Cuántos días de la hoja ("DEL 04 AL 08") aparecen en el nombre de la campaña de Meta: las que coinciden van primero. */
export function coincidencia(hoja: string, campana: string): number {
  const dias = (hoja.match(/\b\d{1,2}\b/g) || []).map(Number);
  const enNombre = new Set((campana.match(/\b\d{1,2}\b/g) || []).map(Number));
  return dias.filter((d) => enNombre.has(d)).length;
}

const correrDias = (iso: string, dias: number) =>
  new Date(Date.parse(iso + "T00:00:00Z") + dias * 86400000).toISOString().slice(0, 10);

export default function CampanasExcel({ campanas, onCambio }: { campanas: CampanaHoja[]; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [valor, setValor] = useState("");
  const [sugeridas, setSugeridas] = useState<string[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const clave = (c: CampanaHoja) => `${c.company_id}|${c.hoja}`;

  const editar = async (c: CampanaHoja) => {
    setEditando(clave(c));
    setValor(c.campana_editada ?? c.campana_hoja ?? c.hoja);
    setSugeridas([]);
    if (!c.desde || !c.hasta) return;
    // Campañas de Meta con datos en las fechas de la hoja (unos días de margen).
    setBuscando(true);
    try {
      const p = new URLSearchParams({ fecha_inicio: correrDias(c.desde, -5), fecha_fin: correrDias(c.hasta, 5) });
      const r = await fetch(`/api/adminleads/meta-campaigns?${p}`).then((x) => x.json());
      const nombres = [...new Set<string>((r.campaigns || []).map((x: any) => String(x.campaign_name || "")).filter(Boolean))];
      setSugeridas(nombres.sort((a, b) => coincidencia(c.hoja, b) - coincidencia(c.hoja, a) || a.localeCompare(b)));
    } catch {
      setSugeridas([]);
    } finally {
      setBuscando(false);
    }
  };

  const guardar = async (c: CampanaHoja, campana: string) => {
    setGuardando(true);
    try {
      const r = await fetch("/api/adminleads/recompra/historicos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "campana", company_id: c.company_id, hoja: c.hoja, campana }),
      }).then((x) => x.json());
      if (r.error) throw new Error(r.error);
      setEditando(null);
      onCambio();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (!campanas.length) return null;
  const editadas = campanas.filter((c) => c.campana_editada).length;

  return (
    <div data-tour="excel-campanas" className="bg-white rounded-2xl border border-zinc-100 shadow-sm">
      <button
        type="button"
        onClick={() => setAbierto(!abierto)}
        className="w-full flex items-center gap-2 p-4 text-left"
        aria-expanded={abierto}
      >
        {abierto ? <ChevronDown className="w-4 h-4 text-zinc-400" /> : <ChevronRight className="w-4 h-4 text-zinc-400" />}
        <Megaphone className="w-4 h-4 text-zinc-500" />
        <span className="text-sm font-bold text-zinc-700">Campañas</span>
        <span className="text-xs text-zinc-400">
          {campanas.length} hojas del Excel = {campanas.length} campañas
          {editadas ? ` · ${editadas} con el nombre de Meta` : ""}
        </span>
      </button>

      {abierto && (
        <div className="px-4 pb-4 space-y-3">
          <p className="text-xs text-zinc-500">
            Cada hoja del Excel es una campaña. El nombre sale de la hoja (Excel corta el nombre de la hoja a 31 letras,
            así que se completa el mes y se quita el día cortado). Con el lápiz lo cambias por el de la campaña de Meta de
            esas fechas, o por el que quieras; es el que sale en la Recompra y en el Excel exportado.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50">
                <tr>
                  <th className="text-left px-3 py-2">Campaña</th>
                  <th className="text-left px-3 py-2">Hoja del Excel</th>
                  <th className="text-left px-3 py-2">Fechas</th>
                  <th className="text-right px-3 py-2">Leads</th>
                  <th className="text-right px-3 py-2">Vendidos</th>
                </tr>
              </thead>
              <tbody>
                {campanas.map((c) => {
                  const k = clave(c);
                  return (
                    <tr key={k} className="border-t border-zinc-100 align-top">
                      <td className="px-3 py-2 min-w-[320px]">
                        {editando === k ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1">
                              <input
                                autoFocus
                                list={`meta-${k}`}
                                value={valor}
                                onChange={(e) => setValor(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && guardar(c, valor)}
                                className="flex-1 py-1 px-2 bg-zinc-50 rounded-lg text-xs border border-zinc-200"
                                aria-label="Nombre de la campaña"
                              />
                              <datalist id={`meta-${k}`}>
                                {sugeridas.map((n) => (
                                  <option key={n} value={n} />
                                ))}
                              </datalist>
                              <button
                                disabled={guardando}
                                onClick={() => guardar(c, valor)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                                aria-label="Guardar campaña"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setEditando(null)}
                                className="p-1 text-zinc-400 hover:bg-zinc-100 rounded"
                                aria-label="Cancelar"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <p className="text-[10px] text-zinc-400">
                              {buscando ? (
                                <span className="inline-flex items-center gap-1">
                                  <Loader2 className="w-3 h-3 animate-spin" /> Buscando campañas de Meta de esas fechas…
                                </span>
                              ) : sugeridas.length ? (
                                `${sugeridas.length} campaña(s) de Meta de esas fechas: escribe o elige de la lista.`
                              ) : (
                                "Meta no tiene campañas con datos en esas fechas: escribe el nombre."
                              )}
                            </p>
                            {sugeridas.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {sugeridas.slice(0, 8).map((n) => (
                                  <button
                                    key={n}
                                    type="button"
                                    onClick={() => setValor(n)}
                                    className="text-[10px] px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100"
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-start gap-1">
                            <button onClick={() => editar(c)} className="group text-left" title="Cambiar el nombre de la campaña">
                              <span className="font-semibold text-zinc-700">{c.campana_editada ?? c.campana_hoja ?? c.hoja}</span>
                              <Pencil className="inline w-3 h-3 ml-1 text-zinc-300 group-hover:text-zinc-500" />
                              {c.campana_editada && <p className="text-[10px] text-blue-600">nombre elegido a mano</p>}
                            </button>
                            {c.campana_editada && (
                              <button
                                disabled={guardando}
                                onClick={() => guardar(c, "")}
                                className="p-0.5 text-zinc-300 hover:text-zinc-600"
                                title="Volver al nombre que sale de la hoja"
                                aria-label="Volver al nombre de la hoja"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500">
                        {c.hoja}
                        <p className="text-[10px] text-zinc-400">{SEDES[c.company_id]}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-500 tabular-nums whitespace-nowrap">
                        {c.desde} a {c.hasta}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{c.leads}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-zinc-700">{Number(c.vendidos)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
