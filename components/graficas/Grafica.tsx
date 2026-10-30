"use client";

// Dibuja cualquier gráfica del Centro de gráficas a partir de lo que manda la
// API (lib/graficas/tipos.ts → Grafica). Marcas finas, puntas redondeadas,
// rejilla tenue y tooltip al pasar el mouse; la leyenda deja ocultar series.

import { useMemo, useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { Grafica as TGrafica, Serie } from "@/lib/graficas/tipos";
import { fmt } from "./formato";

const TINTA_SUAVE = "#898781";
const REJILLA = "#e1e0d9";
const SUPERFICIE = "#ffffff";
const eje = { fill: TINTA_SUAVE, fontSize: 11 };

function Tip({ active, payload, label, grafica }: any) {
  if (!active || !payload?.length) return null;
  const filas = payload.filter((p: any) => p.value != null);
  if (!filas.length) return null;
  const total = filas.reduce((s: number, p: any) => s + (Number(p.value) || 0), 0);
  const apilada = grafica.tipo === "apiladas" || grafica.tipo === "apiladas_h";
  return (
    <div className="rounded-xl border border-slate-200 bg-white/95 backdrop-blur px-3 py-2 shadow-lg text-xs min-w-[160px]">
      <p className="font-semibold text-slate-900 mb-1.5">{label ?? payload[0]?.payload?.etiqueta}</p>
      <div className="space-y-1">
        {filas.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: p.payload?.__color || p.color || p.fill }} />
            <span className="text-slate-500 flex-1 truncate">{p.name}</span>
            <span className="font-semibold text-slate-900 tabular-nums">{fmt(p.value, grafica.formato)}</span>
          </div>
        ))}
        {apilada && filas.length > 1 && (
          <div className="flex items-center gap-2 border-t border-slate-100 pt-1 mt-1">
            <span className="text-slate-500 flex-1">Total</span>
            <span className="font-bold text-slate-900 tabular-nums">{fmt(total, grafica.formato)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Leyenda arriba de la gráfica; clic en una serie la oculta o la muestra. */
export function Leyenda({ series, ocultas, alternar }: { series: Serie[]; ocultas: Set<string>; alternar: (c: string) => void }) {
  if (series.length < 2) return null;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mb-2">
      {series.map((s) => (
        <button
          key={s.clave}
          type="button"
          onClick={() => alternar(s.clave)}
          className={`flex items-center gap-1.5 text-xs rounded-md px-1.5 py-0.5 transition hover:bg-slate-100 ${ocultas.has(s.clave) ? "opacity-40 line-through" : "text-slate-600"}`}
          title={ocultas.has(s.clave) ? "Mostrar" : "Ocultar"}
        >
          <span
            className="h-2.5 w-2.5 rounded-sm"
            style={s.punteada ? { border: `2px dashed ${s.color}` } : { background: s.color }}
          />
          {s.etiqueta}
        </button>
      ))}
    </div>
  );
}

/** Letras de 11 px que caben por línea en el eje de categorías. */
const letrasPorLinea = (ancho: number) => Math.floor(ancho / 6.2);

/** Parte un nombre en dos líneas por palabras; lo que no quepa en la segunda se corta con "…". */
function enDosLineas(t: string, max: number): string[] {
  if (t.length <= max) return [t];
  let corte = t.lastIndexOf(" ", max);
  if (corte <= 0) corte = max;
  const resto = t.slice(corte).trim();
  return [t.slice(0, corte).trim(), resto.length > max ? `${resto.slice(0, max - 1)}…` : resto];
}

/** Etiqueta del eje de categorías: completa, en una o dos líneas. */
function TickCategoria({ x, y, payload, ancho }: any) {
  const t = String(payload.value ?? "");
  const lineas = enDosLineas(t, letrasPorLinea(ancho));
  return (
    <text x={x} y={y} textAnchor="end" fill="#52514e" fontSize={11}>
      <title>{t}</title>
      {lineas.map((l, i) => (
        <tspan key={i} x={x} dy={i === 0 ? (lineas.length > 1 ? -2 : 4) : 12}>{l}</tspan>
      ))}
    </text>
  );
}

export function Grafica({
  grafica, alto, compacta = false, onBarra,
}: {
  grafica: TGrafica;
  alto?: number;
  compacta?: boolean;
  /** Clic en una barra (con su etiqueta). */
  onBarra?: (etiqueta: string) => void;
}) {
  const [ocultas, setOcultas] = useState<Set<string>>(new Set());
  const alternar = (c: string) =>
    setOcultas((prev) => {
      const n = new Set(prev);
      if (n.has(c)) n.delete(c);
      else if (n.size < grafica.series.length - 1) n.add(c);
      return n;
    });
  const series = grafica.series.filter((s) => !ocultas.has(s.clave));
  const horizontal = grafica.tipo === "barras_h" || grafica.tipo === "apiladas_h";
  const apilada = grafica.tipo === "apiladas" || grafica.tipo === "apiladas_h";

  const datos = useMemo(
    (): Record<string, any>[] => grafica.datos.map((d, i) => ({ ...d, __color: grafica.colorPorFila?.[i] })),
    [grafica],
  );
  const hayDatos = grafica.datos.some((d) => grafica.series.some((s) => Number(d[s.clave]) !== 0 && d[s.clave] != null));
  // El eje de nombres crece con el nombre más largo (hasta 260 px) y lo que no cabe pasa a una segunda línea.
  const masLarga = Math.max(0, ...grafica.datos.map((d) => String(d.etiqueta ?? "").length));
  const anchoCategoria = compacta ? 100 : Math.min(260, Math.max(90, Math.ceil(masLarga * 6.2) + 8));
  const dosLineas = horizontal && masLarga > letrasPorLinea(anchoCategoria);
  const alturaFila = grafica.series.length > 1 && !apilada ? 34 : dosLineas ? 32 : 26;
  const altura = alto ?? (horizontal ? Math.max(220, grafica.datos.length * alturaFila + 40) : 280);
  const clicable = !!onBarra;

  if (!hayDatos) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height: compacta ? alto ?? 140 : 200 }}>
        {grafica.vacio || "Sin datos para este filtro."}
      </div>
    );
  }

  const tick = (v: number) => fmt(v, grafica.formato, true);
  const tooltip = <Tooltip content={<Tip grafica={grafica} />} cursor={{ fill: "rgba(15,23,42,0.04)", stroke: REJILLA }} />;
  const leyenda = !compacta && <Leyenda series={grafica.series} ocultas={ocultas} alternar={alternar} />;

  if (grafica.tipo === "dona") {
    const total = datos.reduce((s, d) => s + (Number(d.valor) || 0), 0);
    return (
      <div className="relative" style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            {tooltip}
            <Pie
              data={datos}
              dataKey="valor"
              nameKey="etiqueta"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke={SUPERFICIE}
              strokeWidth={2}
              isAnimationActive
            >
              {datos.map((d, i) => <Cell key={i} fill={d.__color || grafica.series[0].color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">Total</span>
          <span className="text-lg font-bold text-slate-900">{fmt(total, grafica.formato, true)}</span>
        </div>
        {!compacta && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center gap-3 text-xs text-slate-600">
            {datos.map((d, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.__color }} />
                {d.etiqueta} <b className="text-slate-900">{total ? Math.round((Number(d.valor) / total) * 100) : 0}%</b>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (grafica.tipo === "lineas" || grafica.tipo === "area") {
    const Chart = grafica.tipo === "area" ? AreaChart : LineChart;
    const pocos = grafica.datos.length <= 14;
    return (
      <div>
        {leyenda}
        <div style={{ height: altura }}>
          <ResponsiveContainer width="100%" height="100%">
            <Chart data={datos} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                {series.map((s) => (
                  <linearGradient key={s.clave} id={`g-${grafica.id}-${s.clave}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid vertical={false} stroke={REJILLA} />
              <XAxis dataKey="etiqueta" tick={eje} axisLine={false} tickLine={false} minTickGap={12} hide={compacta} />
              <YAxis tick={eje} axisLine={false} tickLine={false} tickFormatter={tick} width={compacta ? 0 : 64} hide={compacta} />
              {tooltip}
              {series.map((s) =>
                grafica.tipo === "area" ? (
                  <Area
                    key={s.clave}
                    type="monotone"
                    dataKey={s.clave}
                    name={s.etiqueta}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.punteada ? "5 4" : undefined}
                    fill={s.punteada ? "transparent" : `url(#g-${grafica.id}-${s.clave})`}
                    dot={false}
                    activeDot={{ r: 5, stroke: SUPERFICIE, strokeWidth: 2 }}
                    connectNulls={false}
                  />
                ) : (
                  <Line
                    key={s.clave}
                    type="monotone"
                    dataKey={s.clave}
                    name={s.etiqueta}
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray={s.punteada ? "5 4" : undefined}
                    dot={pocos && !s.punteada ? { r: 3.5, fill: s.color, stroke: SUPERFICIE, strokeWidth: 2 } : false}
                    activeDot={{ r: 5, stroke: SUPERFICIE, strokeWidth: 2 }}
                    connectNulls
                  />
                ),
              )}
            </Chart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  // Barras (verticales u horizontales, agrupadas o apiladas).
  const ultima = series[series.length - 1]?.clave;
  const radio = (s: Serie): [number, number, number, number] => {
    if (apilada && s.clave !== ultima) return [0, 0, 0, 0];
    return horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0];
  };
  return (
    <div>
      {leyenda}
      <div style={{ height: altura }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={datos}
            layout={horizontal ? "vertical" : "horizontal"}
            margin={{ top: 8, right: 16, left: 4, bottom: 0 }}
            barCategoryGap={horizontal ? "22%" : "26%"}
            barGap={2}
          >
            <CartesianGrid vertical={horizontal} horizontal={!horizontal} stroke={REJILLA} />
            {/* Ejes como hijos directos: recharts no los busca dentro de un Fragment. */}
            {horizontal ? (
              <XAxis type="number" tick={eje} axisLine={false} tickLine={false} tickFormatter={tick} hide={compacta} />
            ) : (
              <XAxis dataKey="etiqueta" tick={eje} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={4} hide={compacta} />
            )}
            {horizontal ? (
              <YAxis
                type="category"
                dataKey="etiqueta"
                width={anchoCategoria}
                axisLine={false}
                tickLine={false}
                interval={0}
                tick={<TickCategoria ancho={anchoCategoria} />}
              />
            ) : (
              <YAxis tick={eje} axisLine={false} tickLine={false} tickFormatter={tick} width={compacta ? 0 : 64} hide={compacta} />
            )}
            {tooltip}
            {series.map((s) => (
              <Bar
                key={s.clave}
                dataKey={s.clave}
                name={s.etiqueta}
                fill={s.color}
                stackId={apilada ? "a" : undefined}
                radius={radio(s)}
                maxBarSize={horizontal ? 22 : 44}
                cursor={clicable ? "pointer" : undefined}
                onClick={clicable ? (d: any) => onBarra!(String(d?.payload?.etiqueta ?? d?.etiqueta ?? "")) : undefined}
                stroke={apilada ? SUPERFICIE : undefined}
                strokeWidth={apilada ? 1 : 0}
              >
                {grafica.colorPorFila && series.length === 1 && datos.map((d, i) => <Cell key={i} fill={d.__color || s.color} />)}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Vista de tabla de la misma gráfica (accesible y para copiar números). */
export function TablaGrafica({
  grafica, onFila, clicable,
}: {
  grafica: TGrafica;
  /** Clic en una fila que `clicable` acepte. */
  onFila?: (etiqueta: string) => void;
  clicable?: (etiqueta: string) => boolean;
}) {
  const total = (clave: string) => grafica.datos.reduce((s, d) => s + (Number(d[clave]) || 0), 0);
  const sumable = grafica.formato === "usd" || grafica.formato === "num";
  return (
    <div className="max-h-[420px] overflow-auto rounded-lg border border-slate-100">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-slate-50 text-slate-500">
          <tr>
            <th className="text-left font-medium px-3 py-2"> </th>
            {grafica.series.map((s) => (
              <th key={s.clave} className="text-right font-medium px-3 py-2 whitespace-nowrap">{s.etiqueta}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grafica.datos.map((d, i) => (
            <tr
              key={i}
              className={`border-t border-slate-100 ${onFila && clicable?.(String(d.etiqueta)) ? "cursor-pointer hover:bg-blue-50" : ""}`}
              onClick={onFila && clicable?.(String(d.etiqueta)) ? () => onFila(String(d.etiqueta)) : undefined}
            >
              <td className="px-3 py-1.5 text-slate-700">{String(d.etiqueta)}</td>
              {grafica.series.map((s) => (
                <td key={s.clave} className="px-3 py-1.5 text-right tabular-nums text-slate-900">
                  {fmt(d[s.clave] as number | null, grafica.formato)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {sumable && grafica.tipo !== "lineas" && grafica.tipo !== "area" && (
          <tfoot className="bg-slate-50 font-semibold">
            <tr className="border-t border-slate-200">
              <td className="px-3 py-2 text-slate-700">Total</td>
              {grafica.series.map((s) => (
                <td key={s.clave} className="px-3 py-2 text-right tabular-nums">{fmt(total(s.clave), grafica.formato)}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
