"use client";

import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Boxes, Coins, Hourglass, PackageCheck, PercentCircle, Snail } from "lucide-react";
import {
  COLOR_STOCK, COLOR_VENDIDO, ESTADO_UI, LIMITES, ORDEN_ESTADOS, cobertura, dinero, dineroCorto, fechaCorta, nombreMes,
  porcentaje, puntos, unidadesFmt, type DatosStock, type EstadoStock, type FilaMarca, type PuntoSerie,
} from "./formato";

function Tarjeta({ icono: Icono, titulo, valor, pie, acento }: {
  icono: typeof Boxes; titulo: string; valor: React.ReactNode; pie?: React.ReactNode; acento?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg ${acento ?? "bg-slate-100 text-slate-600"}`}>
          <Icono size={15} />
        </span>
        {titulo}
      </div>
      <div className="text-2xl font-black tracking-tight text-slate-900 tabular-nums truncate">{valor}</div>
      {pie && <div className="text-xs text-slate-500 leading-relaxed">{pie}</div>}
    </div>
  );
}

export function Delta({ actual, anterior, sufijo }: { actual: number | null; anterior: number | null; sufijo?: string }) {
  const p = puntos(actual, anterior);
  if (!p) return null;
  const Icono = p.d >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ${p.d > 0 ? "bg-emerald-50 text-emerald-700" : p.d < 0 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>
      <Icono size={12} /> {p.texto}{sufijo ? ` ${sufijo}` : ""}
    </span>
  );
}

function TooltipMes({ active, payload, corte }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PuntoSerie & { etiqueta: string; parcial: boolean };
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-800 mb-1">{nombreMes(p.mes)}{p.parcial ? ` (al ${fechaCorta(corte)})` : ""}</p>
      <p className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: COLOR_VENDIDO }} /> Vendido: <b className="text-slate-900">{unidadesFmt(p.vendido)} u</b></p>
      <p className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: COLOR_STOCK }} /> Quedó en stock: <b className="text-slate-900">{unidadesFmt(p.stock)} u</b></p>
      <p className="mt-1 font-semibold text-slate-900">{porcentaje(p.pct, 1)} vendido</p>
    </div>
  );
}

/** Vendido + stock al cierre de cada mes: la barra entera es el 100% de la marca ese mes. */
export function GraficoMeses({ serie, corte, alto = 230 }: { serie: PuntoSerie[]; corte: string; alto?: number }) {
  const mesCorte = corte.slice(0, 7);
  const datos = serie.map((p) => ({
    ...p, vendido: Math.max(0, p.vendido), etiqueta: nombreMes(p.mes, true), parcial: p.mes === mesCorte && corte !== finMes(p.mes),
    pctTexto: p.pct == null ? "" : porcentaje(p.pct, p.pct < 10 ? 1 : 0),
  }));
  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 mb-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_VENDIDO }} /> Vendido en el mes</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_STOCK }} /> Stock al cierre del mes</span>
        <span className="text-slate-400">Encima: % vendido</span>
      </div>
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart data={datos} margin={{ top: 18, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tickLine={false} axisLine={false} width={52} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => unidadesCorto(v)} />
          <Tooltip content={<TooltipMes corte={corte} />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="vendido" stackId="a" fill={COLOR_VENDIDO} stroke="#ffffff" strokeWidth={1} maxBarSize={40} />
          <Bar dataKey="stock" stackId="a" fill={COLOR_STOCK} stroke="#ffffff" strokeWidth={1} radius={[4, 4, 0, 0]} maxBarSize={40}>
            <LabelList dataKey="pctTexto" position="top" style={{ fontSize: 11, fontWeight: 700, fill: "#334155" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function finMes(mes: string) {
  const [y, m] = mes.split("-").map(Number);
  return `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
}

const unidadesCorto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("es-VE", { maximumFractionDigits: 1 })}M`;
  if (a >= 1e3) return `${(n / 1e3).toLocaleString("es-VE", { maximumFractionDigits: 0 })}K`;
  return String(n);
};

function Lista({ titulo, icono: Icono, filas, valor, vacio, onAbrir }: {
  titulo: string; icono: typeof Boxes; filas: FilaMarca[]; valor: (f: FilaMarca) => React.ReactNode; vacio: string; onAbrir: (f: FilaMarca) => void;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"><Icono size={14} /> {titulo}</p>
      {filas.length === 0 ? <p className="text-xs text-slate-400">{vacio}</p> : (
        <ul className="space-y-1">
          {filas.map((f) => (
            <li key={f.clave}>
              <button onClick={() => onAbrir(f)} className="w-full flex items-center justify-between gap-3 rounded-lg px-1.5 py-1 text-sm hover:bg-slate-50 text-left">
                <span className="truncate text-slate-700">{f.marca}</span>
                <span className="shrink-0 tabular-nums font-semibold">{valor(f)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Resumen({ data, onFiltrar, onAbrir }: { data: DatosStock; onFiltrar: (e: EstadoStock) => void; onAbrir: (f: FilaMarca) => void }) {
  const t = data.totales;
  const p = data.periodo;
  const total = Math.max(0, t.vendido) + t.stock;
  const marcasReales = data.marcas.filter((m) => !m.generica);
  // Las agotadas (100%) van en su propia lista: aquí, las que vendieron más de lo que tenían y aún les queda.
  const mejores = [...marcasReales].filter((m) => m.pct != null && m.vendido > 0 && m.stock > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 5);
  const parado = [...data.marcas].filter((m) => m.valorSinVenta > 0).sort((a, b) => b.valorSinVenta - a.valorSinVenta).slice(0, 5);
  const urgentes = [...marcasReales].filter((m) => m.estado === "agotada" || m.estado === "por_agotarse").sort((a, b) => b.vendido - a.vendido).slice(0, 5);
  const ritmo = p.dias > 0 ? t.vendido / p.dias : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Tarjeta
          icono={PercentCircle}
          titulo="% vendido"
          acento="bg-blue-50 text-blue-600"
          valor={<span className="flex items-baseline gap-2">{porcentaje(t.pct, 1)} <Delta actual={t.pct} anterior={t.pctAnterior} /></span>}
          pie={<>
            Se vendieron <b className="text-slate-700">{unidadesFmt(t.vendido)}</b> de <b className="text-slate-700">{unidadesFmt(total)}</b> unidades que hubo (lo vendido + lo que quedó en stock).
            {p.anterior && t.pctAnterior != null && <span className="block mt-1">Mismo tramo anterior ({fechaCorta(p.anterior.desde)}–{fechaCorta(p.anterior.corte)}): {porcentaje(t.pctAnterior, 1)}</span>}
          </>}
        />
        <Tarjeta
          icono={Boxes}
          titulo={p.enCurso ? "Stock hoy" : "Stock al cierre"}
          acento="bg-slate-100 text-slate-700"
          valor={<>{unidadesFmt(t.stock)} <span className="text-sm font-semibold text-slate-500">u</span></>}
          pie={<>
            Valor al costo <b className="text-slate-700">{dinero(t.valor)}</b> · {unidadesFmt(t.conStock)} productos de {t.marcas} marcas.
            {t.disponible != null && <span className="block mt-1">Disponible (sin lo reservado para pedidos): {unidadesFmt(t.disponible)} u</span>}
          </>}
        />
        <Tarjeta
          icono={PackageCheck}
          titulo="Vendido en el período"
          acento="bg-emerald-50 text-emerald-600"
          valor={<>{unidadesFmt(t.vendido)} <span className="text-sm font-semibold text-slate-500">u</span></>}
          pie={<>{dinero(t.ventaUsd)} sin IVA · {unidadesFmt(ritmo)} u por día en {p.dias} días. Al ritmo del período, el stock alcanza para <b className="text-slate-700">{cobertura(t.cobertura)}</b>.</>}
        />
        <Tarjeta
          icono={Coins}
          titulo="Stock sin venta"
          acento="bg-amber-50 text-amber-600"
          valor={dinero(t.valorSinVenta)}
          pie={<>{unidadesFmt(t.sinVenta)} productos con stock no vendieron ni una unidad en el período: {porcentaje(t.valor > 0 ? (t.valorSinVenta / t.valor) * 100 : null)} del valor del inventario.</>}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="font-bold text-slate-800">% vendido mes a mes</h3>
            <span className="text-xs text-slate-400">Cada barra es el 100% del mes: lo vendido + lo que quedó</span>
          </div>
          <GraficoMeses serie={data.serie} corte={p.corte} />
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <h3 className="font-bold text-slate-800">Estado de las marcas</h3>
            <p className="text-xs text-slate-500">Según cuántos días dura su stock al ritmo de venta del período.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ORDEN_ESTADOS.map((e) => {
              const ui = ESTADO_UI[e];
              const Icono = ui.icono;
              return (
                <button
                  key={e}
                  onClick={() => onFiltrar(e)}
                  title={ui.ayuda}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition hover:brightness-95 ${ui.chip}`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold"><Icono size={14} /> {ui.label}</span>
                  <span className="text-lg font-black tabular-nums">{t.conteo[e]}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] leading-relaxed text-slate-400">
            Por agotarse: menos de {LIMITES.porAgotarse} días · Sana: {LIMITES.porAgotarse}–{LIMITES.sana} días · Lenta: hasta {LIMITES.lenta / 30} meses · Sobrestock: más de {LIMITES.lenta / 30} meses.
            {p.dias < 20 && " Con pocos días de período el ritmo todavía es poco representativo."}
          </p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
        <Lista titulo="Mayor % vendido (con stock)" icono={ArrowUpRight} filas={mejores} vacio="Ninguna marca vendió en el período." onAbrir={onAbrir}
          valor={(f) => <span className="text-blue-700">{porcentaje(f.pct, 1)}</span>} />
        <Lista titulo="Más dinero en stock sin venta" icono={Snail} filas={parado} vacio="Todo el stock tuvo venta." onAbrir={onAbrir}
          valor={(f) => <span className="text-amber-700">{dineroCorto(f.valorSinVenta)}</span>} />
        <Lista titulo="Agotadas o por agotarse (más vendidas)" icono={Hourglass} filas={urgentes} vacio="Ninguna marca está por agotarse." onAbrir={onAbrir}
          valor={(f) => <span className={f.estado === "agotada" ? "text-violet-700" : "text-amber-700"}>{f.estado === "agotada" ? "Agotada" : cobertura(f.cobertura)}</span>} />
      </div>
    </div>
  );
}
