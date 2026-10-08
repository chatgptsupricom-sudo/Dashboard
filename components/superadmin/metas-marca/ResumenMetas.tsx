"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import Link from "next/link";
import { useLocale } from "next-intl";
import { ArrowDownRight, ArrowUpRight, Boxes, ChevronRight, Flag, Gauge, Rocket, Target, Wallet } from "lucide-react";
import { ESTADO_UI, colorPct, dinero, dineroCorto, porcentaje, unidadesFmt, type DatosMetas, type EstadoMarca, type FilaMarca } from "./formato";

const COLOR_VENDIDO = "#2563eb"; // blue-600
const COLOR_META = "#cbd5e1"; // slate-300

function Tarjeta({ icono: Icono, titulo, valor, pie, acento }: {
  icono: typeof Target; titulo: string; valor: React.ReactNode; pie?: React.ReactNode; acento?: string;
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

function TooltipSemana({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-800 mb-1">Semana {label}</p>
      <p className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: COLOR_VENDIDO }} /> Vendido: <b className="text-slate-900">{dinero(p.vendido)}</b></p>
      <p className="flex items-center gap-2 text-slate-600"><span className="h-2 w-2 rounded-sm" style={{ background: COLOR_META }} /> Meta semanal: <b className="text-slate-900">{dinero(p.meta)}</b></p>
      {p.meta > 0 && <p className={`mt-1 font-semibold ${colorPct((p.vendido / p.meta) * 100)}`}>{porcentaje((p.vendido / p.meta) * 100)} de la meta</p>}
      <p className="mt-1 text-slate-400">{p.diasHabiles} días hábiles</p>
    </div>
  );
}

export function GraficoSemanas({ semanas, alto = 220 }: {
  semanas: { label: string; vendido: number; meta: number | null; diasHabiles?: number; futura?: boolean }[]; alto?: number;
}) {
  const datos = semanas.map((s) => ({ ...s, meta: s.meta ?? 0, vendido: s.futura ? 0 : s.vendido }));
  return (
    <div>
      <div className="flex items-center gap-4 text-xs text-slate-500 mb-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_VENDIDO }} /> Vendido</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_META }} /> Meta semanal (por días hábiles)</span>
      </div>
      <ResponsiveContainer width="100%" height={alto}>
        <BarChart data={datos} barGap={2} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#64748b" }} />
          <YAxis tickLine={false} axisLine={false} width={56} tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v) => dineroCorto(v)} />
          <Tooltip content={<TooltipSemana />} cursor={{ fill: "#f8fafc" }} />
          <Bar dataKey="meta" fill={COLOR_META} radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="vendido" fill={COLOR_VENDIDO} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ListaInsight({ titulo, icono: Icono, filas, valor, vacio }: {
  titulo: string; icono: typeof Target; filas: FilaMarca[]; valor: (f: FilaMarca) => React.ReactNode; vacio: string;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2"><Icono size={14} /> {titulo}</p>
      {filas.length === 0 ? (
        <p className="text-xs text-slate-400">{vacio}</p>
      ) : (
        <ul className="space-y-1.5">
          {filas.map((f) => (
            <li key={f.clave} className="flex items-center justify-between gap-3 text-sm">
              <span className="truncate text-slate-700">{f.marca}</span>
              <span className="shrink-0 tabular-nums font-semibold">{valor(f)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ResumenMetas({ data, onFiltrarEstado }: { data: DatosMetas; onFiltrarEstado: (e: EstadoMarca) => void }) {
  const locale = useLocale();
  const t = data.totales;
  const enCurso = data.periodo.estado === "en_curso";
  const conMeta = data.marcas.filter((m) => m.meta != null);
  const sinMetas = conMeta.length === 0;

  const masLejos = [...conMeta].filter((m) => (m.falta ?? 0) > 0).sort((a, b) => (b.falta ?? 0) - (a.falta ?? 0)).slice(0, 5);
  const mejores = [...conMeta].sort((a, b) => (b.cumplimiento ?? 0) - (a.cumplimiento ?? 0)).slice(0, 5);
  const crecen = [...conMeta].filter((m) => m.variacionVsPromedio != null).sort((a, b) => (b.variacionVsPromedio ?? 0) - (a.variacionVsPromedio ?? 0)).slice(0, 5);

  return (
    <div className="space-y-4">
      {sinMetas ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
          <Target className="mx-auto text-slate-300" size={28} />
          <p className="mt-2 font-semibold text-slate-700">Este mes todavía no tiene metas por marca</p>
          <p className="text-sm text-slate-500">Cárgalas en la pestaña <b>Asignar metas</b>. Mientras tanto se muestra la venta real por marca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Tarjeta
            icono={Target}
            titulo="Cumplimiento"
            acento="bg-blue-50 text-blue-600"
            valor={<span className={colorPct(t.cumplimiento)}>{porcentaje(t.cumplimiento, 1)}</span>}
            pie={<>
              {dinero(t.vendidoConMeta)} de {dinero(t.metaTotal)} en {t.marcasConMeta} marcas. Sin compensar entre marcas: <b>{porcentaje(t.cumplimientoSinCompensar, 1)}</b>
              {t.marcasConMetaUnidades > 0 && (
                <span className="block mt-1">
                  En unidades: {unidadesFmt(t.unidadesVendidasConMeta)} de {unidadesFmt(t.metaUnidades)} ({t.marcasConMetaUnidades} {t.marcasConMetaUnidades === 1 ? "marca" : "marcas"}) · <b className={colorPct(t.cumplimientoUnidades)}>{porcentaje(t.cumplimientoUnidades, 1)}</b>
                </span>
              )}
            </>}
          />
          <Tarjeta
            icono={Gauge}
            titulo={enCurso ? "Ritmo al día de hoy" : "Resultado del mes"}
            acento="bg-sky-50 text-sky-600"
            valor={<span className={colorPct(t.cumplimientoAlDia)}>{porcentaje(t.cumplimientoAlDia, 1)}</span>}
            pie={enCurso
              ? <>A hoy se esperaba vender {dinero(t.metaAlDia)} ({porcentaje(data.periodo.avance)} de los días hábiles).</>
              : <>Mes {data.periodo.estado === "cerrado" ? "cerrado" : "por empezar"}.</>}
          />
          <Tarjeta
            icono={Rocket}
            titulo="Proyección al cierre"
            acento="bg-violet-50 text-violet-600"
            valor={dinero(t.proyeccion)}
            pie={<>Al ritmo actual cerraría en <b className={colorPct(t.proyeccionPct)}>{porcentaje(t.proyeccionPct, 1)}</b> de la meta.</>}
          />
          <Tarjeta
            icono={Flag}
            titulo="Falta para la meta"
            acento="bg-amber-50 text-amber-600"
            valor={dinero(t.falta)}
            pie={t.ritmoNecesario
              ? <>Hay que vender <b>{dinero(t.ritmoNecesario)}</b> por día hábil en las marcas que no han llegado ({data.periodo.diasRestantes} días hábiles restantes).</>
              : t.falta ? "No quedan días hábiles en el mes." : "Todas las marcas llegaron a su meta."}
          />
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
            <h3 className="font-bold text-slate-800">Avance semanal {sinMetas ? "" : "de las marcas con meta"}</h3>
            <span className="text-xs text-slate-400">Semanas del mes, por fecha de factura</span>
          </div>
          {sinMetas
            ? <p className="py-16 text-center text-sm text-slate-400">Carga metas para ver el avance semanal contra la meta.</p>
            : <GraficoSemanas semanas={data.semanas} />}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
          <div>
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500"><Wallet size={14} /> Venta total de la sede</p>
            <p className="mt-1 text-2xl font-black text-slate-900 tabular-nums">{dinero(t.ventaTotal)}</p>
            <p className="text-xs text-slate-500">
              {t.marcasVendidas} marcas con venta{!sinMetas && <> · las marcas con meta son el <b>{porcentaje(t.participacionConMeta, 1)}</b> ({dinero(t.ventaSinMeta)} en marcas sin meta)</>}
            </p>
            {!data.incluyeIntercompania && data.intercompania !== 0 && (
              <p className="mt-1 text-[11px] text-slate-400">Excluye {dinero(data.intercompania)} de ventas a empresas del grupo.</p>
            )}
          </div>
          {/* El stock pasó a su propia sección (Ventas > Stock por Marca). */}
          <Link href={`/${locale}/superadmin/stock-marca`} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
            <span className="flex items-center gap-2"><Boxes size={14} /> Stock, vendido y % vendido por marca</span>
            <span className="flex items-center gap-1 text-blue-700">Stock por Marca <ChevronRight size={14} /></span>
          </Link>
          {!sinMetas && (
            <div className="grid grid-cols-2 gap-2">
              {(["cumplida", "en_ritmo", "atencion", "riesgo", "pendiente"] as EstadoMarca[]).map((e) => {
                const ui = ESTADO_UI[e];
                const Icono = ui.icono;
                if (e === "en_ritmo" && !enCurso) return null;
                if (e === "pendiente" && !t.conteo.pendiente) return null;
                return (
                  <button
                    key={e}
                    onClick={() => onFiltrarEstado(e)}
                    className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left ring-1 ring-inset transition hover:brightness-95 ${ui.chip}`}
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold"><Icono size={14} /> {ui.label}</span>
                    <span className="text-lg font-black tabular-nums">{t.conteo[e]}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {!sinMetas && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6">
          <ListaInsight
            titulo="Más lejos de su meta"
            icono={ArrowDownRight}
            filas={masLejos}
            vacio="Ninguna marca está por debajo de su meta."
            valor={(f) => <span className="text-red-600">−{dinero(f.falta)}</span>}
          />
          <ListaInsight
            titulo="Mejor cumplimiento"
            icono={Target}
            filas={mejores}
            vacio="–"
            valor={(f) => <span className={colorPct(f.cumplimiento)}>{porcentaje(f.cumplimiento)}</span>}
          />
          <ListaInsight
            titulo={enCurso ? "Crecen más (proyección vs prom. 3 meses)" : "Crecen más vs prom. 3 meses"}
            icono={ArrowUpRight}
            filas={crecen}
            vacio="Sin historial para comparar."
            valor={(f) => (
              <span className={(f.variacionVsPromedio ?? 0) >= 0 ? "text-emerald-600" : "text-red-600"}>
                {(f.variacionVsPromedio ?? 0) >= 0 ? "+" : ""}{porcentaje(f.variacionVsPromedio)}
              </span>
            )}
          />
        </div>
      )}
    </div>
  );
}
