"use client";

// Pestaña "Histórico (Excel)" del Dashboard Leads: los leads de los Excel de
// antes del panel por mes y por campaña. Datos de /api/adminleads/leads-excel/historico.

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

type Fila = { leads: number; vendidos: number; monto: number; efectividad: number | null };
type Datos = {
  total: Fila;
  porMes: (Fila & { mes: string })[];
  porCampana: (Fila & { campana: string; desde: string | null; hasta: string | null })[];
};

const usd = (n: number) => `$${n.toLocaleString("es-VE", { maximumFractionDigits: 0 })}`;
const pct = (n: number | null) => (n == null ? "—" : `${n.toFixed(1)}%`);
const mesLargo = (mes: string) =>
  new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)) - 1, 1).toLocaleDateString("es-VE", { month: "long", year: "numeric" });

function Tabla({ titulo, primera, filas }: { titulo: string; primera: string; filas: (Fila & { etiqueta: string; detalle?: string })[] }) {
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
      <p className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-zinc-500 border-b border-zinc-100">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-zinc-400 bg-zinc-50">
            <tr>
              <th className="text-left px-4 py-2">{primera}</th>
              <th className="text-right px-4 py-2">Leads</th>
              <th className="text-right px-4 py-2">Vendidos</th>
              <th className="text-right px-4 py-2">Efectividad</th>
              <th className="text-right px-4 py-2">Monto</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.etiqueta} className="border-t border-zinc-100">
                <td className="px-4 py-2">
                  <p className="font-semibold text-zinc-700 capitalize">{f.etiqueta}</p>
                  {f.detalle && <p className="text-[11px] text-zinc-400">{f.detalle}</p>}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{f.leads.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums">{f.vendidos.toLocaleString()}</td>
                <td className="px-4 py-2 text-right tabular-nums">{pct(f.efectividad)}</td>
                <td className="px-4 py-2 text-right tabular-nums font-semibold">{usd(f.monto)}</td>
              </tr>
            ))}
            {!filas.length && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-400">
                  No hay leads de Excel cargados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function HistoricoExcelTab({ sede }: { sede: string }) {
  const [data, setData] = useState<Datos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    setError(null);
    fetch(`/api/adminleads/leads-excel/historico${sede ? `?sede=${sede}` : ""}`)
      .then((r) => r.json())
      .then((r) => {
        if (r.error) throw new Error(r.error);
        setData(r);
      })
      .catch((e) => setError(e.message));
  }, [sede]);

  if (error) return <p className="text-sm font-semibold text-red-500">{error}</p>;
  if (!data)
    return (
      <div className="flex items-center justify-center py-16 text-zinc-400 text-sm">
        <Loader2 className="w-5 h-5 animate-spin mr-3" /> Cargando el histórico…
      </div>
    );

  const t = data.total;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          ["Leads de Excel", t.leads.toLocaleString()],
          ["Vendidos", t.vendidos.toLocaleString()],
          ["Efectividad", pct(t.efectividad)],
          ["Monto vendido", usd(t.monto)],
        ].map(([k, v]) => (
          <div key={k} className="bg-white rounded-2xl border border-zinc-200 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{k}</p>
            <p className="text-xl font-bold text-zinc-900 mt-1 tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-400">
        Leads de los Excel de redes de antes del panel, por la fecha de interacción. Vendidos = estatus CONCRETADO
        (incluye los que se cerraron después desde el tablero de Excel de Monitoreo Leads). Estos números no entran en
        las tarjetas de la pestaña General, salvo los cierres hechos desde ese tablero.
      </p>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Tabla titulo="Por mes" primera="Mes" filas={data.porMes.map((m) => ({ ...m, etiqueta: mesLargo(m.mes) }))} />
        <Tabla
          titulo="Por campaña"
          primera="Campaña"
          filas={data.porCampana.map((c) => ({
            ...c,
            etiqueta: c.campana,
            detalle: c.desde ? `${c.desde}${c.hasta && c.hasta !== c.desde ? ` a ${c.hasta}` : ""}` : undefined,
          }))}
        />
      </div>
    </div>
  );
}
