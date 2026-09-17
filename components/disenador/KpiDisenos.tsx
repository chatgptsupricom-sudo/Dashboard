"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, TrendingUp } from "lucide-react";
import { CATEGORIAS_DISENO, etiquetaCategoria } from "@/lib/disenos/categorias";

interface Kpis {
  mes: string;
  hoy: number;
  semana: number;
  mesEnCurso: number;
  total: number;
  delMes: number;
  dias: Record<string, number>;
  semanas: { inicio: string; fin: string; total: number }[];
  categorias: Record<string, number>;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const DIAS_SEMANA = ["L", "M", "M", "J", "V", "S", "D"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

const soloDia = (fecha: string) => Number(fecha.slice(8, 10));

/** Intensidad del color según cuántos diseños tiene el día, relativa al máximo del mes. */
function tono(n: number, max: number): string {
  if (n === 0) return "bg-slate-50 text-slate-300";
  const r = max > 0 ? n / max : 0;
  if (r > 0.75) return "bg-fuchsia-600 text-white";
  if (r > 0.5) return "bg-fuchsia-400 text-white";
  if (r > 0.25) return "bg-fuchsia-200 text-fuchsia-900";
  return "bg-fuchsia-100 text-fuchsia-800";
}

/**
 * KPIs de diseños: subidos hoy, en la semana y en el mes, más un calendario del
 * mes con el conteo por día y el desglose por semana y por categoría.
 *
 * Los tres números de arriba son siempre de HOY / esta semana / este mes, sin
 * importar el mes que se esté viendo en el calendario: son el pulso del día, no
 * del mes navegado.
 */
export default function KpiDisenos({ refreshKey = 0 }: { refreshKey?: number }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [mes, setMes] = useState(hoy.getMonth() + 1);
  const [data, setData] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchKpis = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/disenador/disenos/kpis?mes=${iso(anio, mes, 1).slice(0, 7)}`);
      const json = await res.json();
      if (json.success) {
        setData(json);
        setError("");
      } else {
        // Sin esto, un error se veía igual que "no subiste nada": todo en 0.
        setError(json.error || `HTTP ${res.status}`);
      }
    } catch (e: any) {
      console.error("fetchKpis:", e);
      setError(e.message || "No se pudieron cargar los KPIs");
    } finally {
      setLoading(false);
    }
  }, [anio, mes]);

  useEffect(() => { fetchKpis(); }, [fetchKpis, refreshKey]);

  const celdas = useMemo(() => {
    const primero = new Date(anio, mes - 1, 1);
    const offset = (primero.getDay() + 6) % 7; // lunes primero
    const ultimo = new Date(anio, mes, 0).getDate();
    const out: (number | null)[] = Array(offset).fill(null);
    for (let d = 1; d <= ultimo; d++) out.push(d);
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [anio, mes]);

  const maxDia = useMemo(
    () => Math.max(0, ...Object.values(data?.dias || {})),
    [data],
  );

  const mover = (delta: number) => {
    const d = new Date(anio, mes - 1 + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth() + 1);
  };

  const hoyIso = iso(hoy.getFullYear(), hoy.getMonth() + 1, hoy.getDate());
  const categoriasOrdenadas = [
    ...CATEGORIAS_DISENO.map((c) => ({ id: c.id, label: c.label, n: data?.categorias?.[c.id] || 0 })),
    { id: "sin_categoria", label: etiquetaCategoria(null), n: data?.categorias?.sin_categoria || 0 },
  ].filter((c) => c.n > 0 || c.id !== "sin_categoria");

  return (
    <Card className="rounded-3xl border-none shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
        <CardTitle className="text-lg font-semibold text-slate-900 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-fuchsia-600" />
          KPI de diseños
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => mover(-1)} className="h-8 w-8 p-0">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium text-slate-700 min-w-[9rem] text-center capitalize">
            {MESES[mes - 1]} {anio}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => mover(1)}
            disabled={anio === hoy.getFullYear() && mes === hoy.getMonth() + 1}
            className="h-8 w-8 p-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm p-3">
            No se pudieron cargar los KPIs: {error}
          </div>
        )}
        {/* Hoy / semana / mes en curso — independientes del mes navegado */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Subidos hoy", valor: data?.hoy },
            { label: "Esta semana", valor: data?.semana, nota: "lunes a domingo" },
            { label: "Este mes", valor: data?.mesEnCurso },
            { label: "Total del catálogo", valor: data?.total },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl bg-slate-50 p-4 min-w-0">
              <p className="text-xs text-slate-500">{k.label}</p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {data === null ? "—" : (k.valor ?? 0)}
              </p>
              {k.nota && <p className="text-[10px] text-slate-400">{k.nota}</p>}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendario del mes */}
          <div className="lg:col-span-2 min-w-0">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-500">
              <CalendarDays className="w-4 h-4" />
              <span>
                {data === null ? "—" : data.delMes} diseño{data?.delMes === 1 ? "" : "s"} en {MESES[mes - 1]}
              </span>
              {loading && <Loader2 className="w-3 h-3 animate-spin" />}
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {DIAS_SEMANA.map((d, i) => (
                <div key={i} className="text-[10px] font-semibold text-slate-400 text-center py-1">
                  {d}
                </div>
              ))}
              {celdas.map((dia, i) => {
                if (dia === null) return <div key={i} />;
                const fecha = iso(anio, mes, dia);
                const n = data?.dias?.[fecha] || 0;
                const esHoy = fecha === hoyIso;
                return (
                  <div
                    key={i}
                    title={`${dia}/${mes}: ${n} diseño${n === 1 ? "" : "s"}`}
                    className={`aspect-square rounded-xl flex flex-col items-center justify-center ${tono(n, maxDia)} ${
                      esHoy ? "ring-2 ring-slate-900 ring-offset-1" : ""
                    }`}
                  >
                    <span className="text-[10px] opacity-70 leading-none">{dia}</span>
                    <span className="text-sm font-bold tabular-nums leading-tight">{n || ""}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Semanas y categorías del mes */}
          <div className="space-y-5 min-w-0">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Por semana</p>
              <div className="space-y-1.5">
                {(data?.semanas || []).map((s) => (
                  <div key={s.inicio} className="flex items-center justify-between gap-2 text-sm">
                    <span className="text-slate-500 truncate">
                      {soloDia(s.inicio)}–{soloDia(s.fin)} {MESES[mes - 1].slice(0, 3)}
                    </span>
                    <span className="font-semibold text-slate-800 tabular-nums">{s.total}</span>
                  </div>
                ))}
                {(data?.semanas || []).length === 0 && (
                  <p className="text-sm text-slate-400">{data === null ? "—" : "Sin diseños este mes"}</p>
                )}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Por categoría</p>
              <div className="space-y-1.5">
                {categoriasOrdenadas.map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-2 text-sm">
                    <span className="text-slate-500 leading-snug">{c.label}</span>
                    <span className="font-semibold text-slate-800 tabular-nums">{c.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
