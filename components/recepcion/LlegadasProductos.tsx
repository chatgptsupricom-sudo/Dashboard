"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Loader2, PackageCheck, Search, X } from "lucide-react";

/**
 * Calendario de mercancia de Valencia para el Diseñador y AdminLeads: cada dia
 * marca si llego mercancia o si se espera, y al tocarlo muestra los productos.
 * Solo fecha y productos: sin proveedor, contenedores, precintos ni fotos.
 */

type Producto = { codigo: string | null; producto: string; cantidad: number };
type Lista = "llego" | "contando" | "por_llegar";
type Dia = { fecha: string } & Record<Lista, Producto[]>;

const LISTAS: Lista[] = ["llego", "contando", "por_llegar"];

// Un color por estado, el mismo en el calendario, la leyenda y el detalle.
const COLOR: Record<Lista, { punto: string; chip: string; titulo: string }> = {
  llego: { punto: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700", titulo: "text-emerald-700" },
  contando: { punto: "bg-amber-500", chip: "bg-amber-50 text-amber-700", titulo: "text-amber-700" },
  por_llegar: { punto: "bg-sky-500", chip: "bg-sky-50 text-sky-700", titulo: "text-sky-700" },
};

const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
// Mediodia para que el cambio de zona no corra el dia.
const aFecha = (dia: string) => new Date(`${dia}T12:00:00`);

function coincide(p: Producto, q: string): boolean {
  return `${p.producto} ${p.codigo || ""}`.toLowerCase().includes(q);
}

export default function LlegadasProductos() {
  const t = useTranslations("llegadas");
  const locale = useLocale();
  const [dias, setDias] = useState<Dia[]>([]);
  const [sinFecha, setSinFecha] = useState<Producto[]>([]);
  const [hoy, setHoy] = useState(() => new Date().toISOString().slice(0, 10));
  const [mes, setMes] = useState(() => ({ anio: new Date().getFullYear(), mes: new Date().getMonth() + 1 }));
  const [elegido, setElegido] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/recepcion/llegadas");
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error || t("error"));
        setDias(j.dias || []);
        setSinFecha(j.sin_fecha || []);
        if (j.hoy) {
          setHoy(j.hoy);
          setElegido(j.hoy);
          setMes({ anio: Number(j.hoy.slice(0, 4)), mes: Number(j.hoy.slice(5, 7)) });
        }
      } catch (e: any) {
        setError(e?.message || t("error"));
      } finally {
        setCargando(false);
      }
    })();
  }, [t]);

  // La busqueda filtra los productos de cada lista; un dia sin coincidencias
  // queda sin marca en el calendario.
  const q = busca.trim().toLowerCase();
  const porFecha = useMemo(() => {
    const m = new Map<string, Dia>();
    for (const d of dias) {
      const f: Dia = { fecha: d.fecha, llego: [], contando: [], por_llegar: [] };
      for (const l of LISTAS) f[l] = q ? d[l].filter((p) => coincide(p, q)) : d[l];
      if (LISTAS.some((l) => f[l].length)) m.set(d.fecha, f);
    }
    return m;
  }, [dias, q]);
  const sinFechaVisibles = q ? sinFecha.filter((p) => coincide(p, q)) : sinFecha;

  // Atajos debajo del buscador: al buscar, los dias donde aparece el producto;
  // si no, las proximas llegadas esperadas.
  const atajos = useMemo(() => {
    const todos = [...porFecha.values()];
    return q ? todos.map((d) => d.fecha) : todos.filter((d) => d.fecha >= hoy && d.por_llegar.length).map((d) => d.fecha).slice(0, 6);
  }, [porFecha, q, hoy]);

  const irA = (dia: string) => {
    setElegido(dia);
    setMes({ anio: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)) });
  };
  const moverMes = (delta: number) =>
    setMes(({ anio, mes: m }) => {
      const n = m + delta;
      return n < 1 ? { anio: anio - 1, mes: 12 } : n > 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: n };
    });

  // Celdas del mes, semana de lunes a domingo.
  const celdas = useMemo(() => {
    const primero = new Date(mes.anio, mes.mes - 1, 1);
    const blancos = (primero.getDay() + 6) % 7;
    const total = new Date(mes.anio, mes.mes, 0).getDate();
    return [...Array(blancos).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)] as (number | null)[];
  }, [mes]);

  const fmt = (opciones: Intl.DateTimeFormatOptions, dia: string) => {
    const s = new Intl.DateTimeFormat(locale, opciones).format(aFecha(dia));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  const nombresDias = useMemo(
    () => Array.from({ length: 7 }, (_, i) => fmt({ weekday: "narrow" }, iso(2024, 1, 1 + i))), // 2024-01-01 fue lunes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [locale],
  );
  const detalle = elegido ? porFecha.get(elegido) : undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
            <PackageCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">{t("titulo")}</h1>
            <p className="text-sm text-slate-500">{t("subtitulo")}</p>
          </div>
        </div>

        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("buscar")}
              aria-label={t("buscar")}
              className="w-full h-11 pl-9 pr-9 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-100"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca("")}
                aria-label={t("limpiar")}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {!cargando && !error && (q || atajos.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-slate-500 mr-1">{q ? (atajos.length ? t("aparece_en") : t("sin_resultados")) : t("proximas")}</span>
              {atajos.map((dia) => (
                <button
                  key={dia}
                  type="button"
                  onClick={() => irA(dia)}
                  className={`px-2.5 py-1 rounded-full border transition-colors ${
                    dia === elegido ? "border-violet-300 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                  }`}
                >
                  {fmt({ day: "numeric", month: "short" }, dia)}
                </button>
              ))}
            </div>
          )}
        </div>

        {cargando ? (
          <div className="py-16 flex justify-center text-slate-300">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px] items-start">
            {/* Calendario */}
            <section className="rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex items-center justify-between gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => moverMes(-1)}
                  aria-label={t("mes_anterior")}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm sm:text-base font-semibold text-slate-900">
                    {fmt({ month: "long", year: "numeric" }, iso(mes.anio, mes.mes, 1))}
                  </h2>
                  {hoy.slice(0, 7) !== iso(mes.anio, mes.mes, 1).slice(0, 7) && (
                    <button
                      type="button"
                      onClick={() => irA(hoy)}
                      className="text-xs px-2 py-0.5 rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      {t("hoy")}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => moverMes(1)}
                  aria-label={t("mes_siguiente")}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
                {nombresDias.map((d, i) => (
                  <div key={i} className="text-[10px] sm:text-[11px] font-semibold text-slate-400 text-center py-1">
                    {d}
                  </div>
                ))}
                {celdas.map((n, i) => {
                  if (n === null) return <div key={i} />;
                  const fecha = iso(mes.anio, mes.mes, n);
                  const d = porFecha.get(fecha);
                  const esHoy = fecha === hoy;
                  const activo = fecha === elegido;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setElegido(fecha)}
                      aria-pressed={activo}
                      aria-label={fmt({ weekday: "long", day: "numeric", month: "long" }, fecha)}
                      className={`@container min-h-[52px] sm:min-h-[84px] rounded-xl border p-1 sm:p-1.5 flex flex-col items-center sm:items-stretch text-left transition-colors ${
                        activo
                          ? "border-violet-400 bg-violet-50/60 ring-1 ring-violet-300"
                          : d
                            ? "border-slate-200 bg-white hover:border-slate-300"
                            : "border-transparent bg-slate-50/70 hover:bg-slate-100"
                      }`}
                    >
                      <span
                        className={`text-[11px] sm:text-xs tabular-nums leading-none w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${
                          esHoy ? "bg-slate-900 text-white font-semibold" : d ? "text-slate-800 font-medium" : "text-slate-400"
                        }`}
                      >
                        {n}
                      </span>
                      {d && (
                        <>
                          {/* Movil: solo puntos. */}
                          <span className="flex gap-0.5 mt-1 sm:hidden">
                            {LISTAS.filter((l) => d[l].length).map((l) => (
                              <span key={l} className={`w-1.5 h-1.5 rounded-full ${COLOR[l].punto}`} />
                            ))}
                          </span>
                          {/* Pantalla grande: cuantos productos, con la etiqueta si
                              la celda es lo bastante ancha (container query). */}
                          <span className="hidden sm:flex flex-col gap-0.5 mt-1">
                            {LISTAS.filter((l) => d[l].length).map((l) => (
                              <span
                                key={l}
                                title={`${t(`leyenda_${l}`)}: ${d[l].length}`}
                                className={`text-[10px] leading-tight px-1.5 py-0.5 rounded-md whitespace-nowrap ${COLOR[l].chip}`}
                              >
                                <span className="hidden @min-[64px]:inline">{t(`corto_${l}`)} </span>
                                {d[l].length}
                              </span>
                            ))}
                          </span>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-xs text-slate-500">
                {LISTAS.map((l) => (
                  <span key={l} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${COLOR[l].punto}`} />
                    {t(`leyenda_${l}`)}
                  </span>
                ))}
              </div>
            </section>

            {/* Detalle del dia elegido */}
            <section className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:sticky lg:top-4">
              <header className="px-4 sm:px-5 pt-4 pb-3 border-b border-slate-100">
                <h2 className="text-sm font-semibold text-slate-900">
                  {elegido ? fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" }, elegido) : t("elige_dia")}
                </h2>
              </header>
              {!detalle ? (
                <p className="px-4 sm:px-5 py-10 text-center text-sm text-slate-400">
                  {elegido ? (q ? t("dia_sin_coincidencias") : t("dia_vacio")) : t("elige_dia_ayuda")}
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {LISTAS.filter((l) => detalle[l].length).map((l) => {
                    const unidades = detalle[l].reduce((s, p) => s + p.cantidad, 0);
                    const atrasado = l === "por_llegar" && detalle.fecha < hoy;
                    return (
                      <div key={l} className="px-4 sm:px-5 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${COLOR[l].punto}`} />
                          <h3 className={`text-xs font-semibold uppercase tracking-wide ${COLOR[l].titulo}`}>{t(`titulo_${l}`)}</h3>
                          <span className="ml-auto text-[11px] text-slate-400 tabular-nums">
                            {t("resumen", { productos: detalle[l].length, unidades })}
                          </span>
                        </div>
                        {l !== "llego" && (
                          <p className="text-[11px] text-slate-500 mt-1">{atrasado ? t("nota_atrasado") : t(`nota_${l}`)}</p>
                        )}
                        <ul className="mt-2 space-y-0.5">
                          {detalle[l].map((p) => (
                            <li key={`${p.codigo}-${p.producto}`} className="flex items-center gap-3 py-1.5">
                              <div className="min-w-0 flex-1">
                                <p className="text-sm text-slate-800 truncate" title={p.producto}>
                                  {p.producto}
                                </p>
                                {p.codigo && <p className="text-[11px] text-slate-400 font-mono">{p.codigo}</p>}
                              </div>
                              <span className="text-sm font-semibold text-slate-700 tabular-nums">{p.cantidad.toLocaleString(locale)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* En camino sin fecha estimada: no tienen dia en el calendario. */}
            {sinFechaVisibles.length > 0 && (
              <section className="rounded-2xl border border-slate-200/80 bg-white px-4 sm:px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${COLOR.por_llegar.punto}`} />
                  <h3 className={`text-xs font-semibold uppercase tracking-wide ${COLOR.por_llegar.titulo}`}>{t("sin_fecha")}</h3>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{t("sin_fecha_nota")}</p>
                <ul className="mt-2 grid sm:grid-cols-2 gap-x-6">
                  {sinFechaVisibles.map((p) => (
                    <li key={`${p.codigo}-${p.producto}`} className="flex items-center gap-3 py-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-slate-800 truncate" title={p.producto}>
                          {p.producto}
                        </p>
                        {p.codigo && <p className="text-[11px] text-slate-400 font-mono">{p.codigo}</p>}
                      </div>
                      <span className="text-sm font-semibold text-slate-700 tabular-nums">{p.cantidad.toLocaleString(locale)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
