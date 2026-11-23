"use client";

import { ChevronRight, Loader2, Search } from "lucide-react";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { NOMBRE_SEDE, type ResumenPersona, diasEntre } from "@/lib/actividades/tipos";

const fetcher = async (url: string) => {
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || "No se pudo leer el equipo");
  return j;
};

function Semaforo({ p, hoy }: { p: ResumenPersona; hoy: string }) {
  const atraso = p.vencida_mas_vieja ? diasEntre(p.vencida_mas_vieja, hoy) : 0;
  const [texto, clase] =
    p.vencidas === 0
      ? p.pendientes === 0
        ? ["Sin pendientes", "bg-slate-100 text-slate-500"]
        : ["Al día", "bg-emerald-50 text-emerald-700"]
      : p.vencidas >= 3 || atraso > 7
        ? ["Muy atrasado", "bg-red-100 text-red-700"]
        : ["Con atrasos", "bg-amber-100 text-amber-800"];
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${clase}`}>{texto}</span>;
}

function Numero({ n, tono }: { n: number; tono?: "rojo" | "ambar" | "azul" | "verde" }) {
  if (!n) return <span className="text-slate-300">0</span>;
  const c =
    tono === "rojo" ? "text-red-700 font-semibold" : tono === "ambar" ? "text-amber-700 font-semibold" : tono === "azul" ? "text-blue-700" : tono === "verde" ? "text-emerald-700" : "text-slate-700";
  return <span className={c}>{n}</span>;
}

export default function Equipo({
  hoy,
  version,
  onElegir,
}: {
  hoy: string;
  /** Cambia cuando algo se modificó (socket) para volver a leer. */
  version: number;
  onElegir: (userId: number) => void;
}) {
  const { data, error, isLoading } = useSWR(`/api/activities/panel/equipo?v=${version}`, fetcher, {
    keepPreviousData: true,
  });
  const [buscar, setBuscar] = useState("");
  const [sede, setSede] = useState<string>("todas");
  const [soloConActividades, setSoloConActividades] = useState(true);

  const equipo: ResumenPersona[] = data?.equipo ?? [];
  const sedes = useMemo(
    () => [...new Set(equipo.map((p) => p.cids).filter((c): c is number => c != null))].sort(),
    [equipo],
  );

  const filas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return equipo
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q))
      .filter((p) => sede === "todas" || String(p.cids ?? "") === sede)
      .filter((p) => !soloConActividades || p.pendientes > 0 || p.hechas_semana > 0)
      .sort(
        (a, b) =>
          b.vencidas - a.vencidas ||
          b.hoy - a.hoy ||
          b.pendientes - a.pendientes ||
          a.name.localeCompare(b.name, "es"),
      );
  }, [equipo, buscar, sede, soloConActividades]);

  const totales = useMemo(
    () =>
      filas.reduce(
        (t, p) => ({
          vencidas: t.vencidas + p.vencidas,
          hoy: t.hoy + p.hoy,
          en_curso: t.en_curso + p.en_curso,
          pendientes: t.pendientes + p.pendientes,
          hechas: t.hechas + p.hechas_semana,
          atrasados: t.atrasados + (p.vencidas > 0 ? 1 : 0),
        }),
        { vencidas: 0, hoy: 0, en_curso: 0, pendientes: 0, hechas: 0, atrasados: 0 },
      ),
    [filas],
  );

  if (error) {
    return <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{String(error.message)}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="Buscar persona o rol"
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-slate-400"
          />
        </div>
        {sedes.length > 1 && (
          <select
            value={sede}
            onChange={(e) => setSede(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none"
            aria-label="Sede"
          >
            <option value="todas">Todas las sedes</option>
            {sedes.map((c) => (
              <option key={c} value={String(c)}>
                {NOMBRE_SEDE[c] ?? `Sede ${c}`}
              </option>
            ))}
          </select>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-slate-900"
            checked={soloConActividades}
            onChange={(e) => setSoloConActividades(e.target.checked)}
          />
          Solo quien tiene actividades
        </label>
        {isLoading && <Loader2 size={16} className="animate-spin text-slate-400" />}
      </div>

      <p className="text-sm text-slate-600">
        {totales.atrasados > 0 ? (
          <>
            <span className="font-semibold text-red-700">{totales.atrasados}</span> de {filas.length}{" "}
            {filas.length === 1 ? "persona tiene" : "personas tienen"} actividades vencidas ({totales.vencidas} en total).
          </>
        ) : filas.length ? (
          "Nadie tiene actividades vencidas."
        ) : null}
      </p>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="whitespace-nowrap bg-slate-50 text-left text-xs font-semibold text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Persona</th>
              <th className="px-3 py-2.5">Estado</th>
              <th className="px-3 py-2.5 text-right">Vencidas</th>
              <th className="px-3 py-2.5 text-right">Para hoy</th>
              <th className="px-3 py-2.5 text-right">En curso</th>
              <th className="px-3 py-2.5 text-right">Abiertas</th>
              <th className="px-3 py-2.5 text-right" title="Culminadas en los últimos 7 días">
                Culminadas 7 días
              </th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {filas.map((p) => (
              <tr
                key={p.user_id}
                onClick={() => onElegir(p.user_id)}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
              >
                <td className="px-4 py-2.5">
                  <p className="font-medium text-slate-800">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {p.role}
                    {p.cids != null && NOMBRE_SEDE[p.cids] ? ` · ${NOMBRE_SEDE[p.cids]}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2.5">
                  <Semaforo p={p} hoy={hoy} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Numero n={p.vencidas} tono="rojo" />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Numero n={p.hoy} tono="ambar" />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Numero n={p.en_curso} tono="azul" />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Numero n={p.pendientes} />
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <Numero n={p.hechas_semana} tono="verde" />
                </td>
                <td className="pr-3 text-slate-300">
                  <ChevronRight size={16} />
                </td>
              </tr>
            ))}
            {!isLoading && filas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  No hay personas con estos filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
