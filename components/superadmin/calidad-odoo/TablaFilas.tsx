"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, Search } from "lucide-react";
import { descargarExcel } from "@/lib/excel";
import type { Chequeo } from "@/lib/calidad-odoo/tipos";
import { celda, nombreSede, numero, urlOdoo, type Fila } from "./formato";
import { filasExcel } from "./excel";

const POR_PAGINA = 25;

/** Registros de un chequeo: se piden al abrir la tarjeta. */
export function TablaFilas({ chequeoId, sede, version }: { chequeoId: string; sede: string; version: number }) {
  const [datos, setDatos] = useState<Chequeo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    let cancelado = false;
    setDatos(null);
    setError(null);
    fetch(`/api/superadmin/calidad-odoo?company_id=${sede}&chequeo=${encodeURIComponent(chequeoId)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (cancelado) return;
        if (r.ok && j?.success) setDatos(j.data);
        else setError(j?.error || "No se pudieron cargar los registros");
      })
      .catch(() => { if (!cancelado) setError("No se pudieron cargar los registros"); });
    return () => { cancelado = true; };
  }, [chequeoId, sede, version]);

  useEffect(() => { setPagina(0); }, [busca, sede]);

  const conSede = sede === "todas";
  const filtradas = useMemo(() => {
    if (!datos) return [];
    const q = busca.trim().toLowerCase();
    if (!q) return datos.filas;
    return datos.filas.filter((f) => datos.columnas.some((c) => String(f[c.clave] ?? "").toLowerCase().includes(q)) || nombreSede(f.companyId).toLowerCase().includes(q));
  }, [datos, busca]);

  if (error) return <p className="text-sm text-amber-700">{error}</p>;
  if (!datos) return <p className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={14} className="animate-spin" /> Cargando registros…</p>;
  if (!datos.filas.length) return <p className="text-sm text-emerald-700">Nada que corregir en esta sede.</p>;

  const paginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA));
  const visibles = filtradas.slice(pagina * POR_PAGINA, (pagina + 1) * POR_PAGINA);
  // Los grupos (duplicados) se alternan de color para ver dónde empieza cada uno.
  const colorGrupo = new Map<string, boolean>();
  let alterna = false;
  for (const f of filtradas) if (f.grupo && !colorGrupo.has(f.grupo)) { colorGrupo.set(f.grupo, alterna); alterna = !alterna; }
  const hayGrupos = colorGrupo.size > 0;
  const nuevoGrupo = (f: Fila, i: number) => hayGrupos && i > 0 && visibles[i - 1].grupo !== f.grupo;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 h-9 w-full sm:w-72">
          <Search size={14} className="text-slate-400" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar en estos registros…" className="w-full bg-transparent text-sm outline-none" />
        </label>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span>{numero(filtradas.length)} registro{filtradas.length === 1 ? "" : "s"}{hayGrupos && ` · ${numero(colorGrupo.size)} grupos`}</span>
          <button
            onClick={() => descargarExcel(`calidad-odoo-${datos.id}`, [{ nombre: datos.titulo, filas: filasExcel({ columnas: datos.columnas, filas: filtradas }) }])}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 h-8 font-bold text-slate-600 hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition"
          >
            <Download size={13} /> Excel
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              {conSede && <th className="px-3 py-2 font-semibold">Sede</th>}
              {datos.columnas.map((c) => (
                <th key={c.clave} className={`px-3 py-2 font-semibold whitespace-nowrap ${c.tipo && c.tipo !== "texto" && c.tipo !== "fecha" ? "text-right" : ""}`}>{c.titulo}</th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, i) => (
              <tr
                key={`${f.modelo}-${f.id}-${f.companyId}-${i}`}
                className={`${nuevoGrupo(f, i) ? "border-t-2 border-slate-300" : "border-t border-slate-100"} ${f.grupo && colorGrupo.get(f.grupo) ? "bg-slate-50/70" : "bg-white"} hover:bg-blue-50/40`}
              >
                {conSede && <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{nombreSede(f.companyId)}</td>}
                {datos.columnas.map((c) => (
                  <td key={c.clave} className={`px-3 py-2 align-top ${c.tipo && c.tipo !== "texto" && c.tipo !== "fecha" ? "text-right tabular-nums whitespace-nowrap" : ""} ${c.tipo === "fecha" ? "whitespace-nowrap" : ""} ${c.clave === "visible" ? "font-mono text-xs" : ""}`}>
                    {celda(f[c.clave], c.tipo)}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <a href={urlOdoo(f)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-blue-600 hover:underline">
                    Abrir en Odoo <ExternalLink size={12} />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
          <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30" aria-label="Página anterior"><ChevronLeft size={15} /></button>
          <span>Página {pagina + 1} de {paginas}</span>
          <button onClick={() => setPagina((p) => Math.min(paginas - 1, p + 1))} disabled={pagina >= paginas - 1} className="p-1.5 rounded-lg hover:bg-slate-100 disabled:opacity-30" aria-label="Página siguiente"><ChevronRight size={15} /></button>
        </div>
      )}
    </div>
  );
}
